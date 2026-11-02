import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { parseJson } from '@castle-control/contract/door';
import { startCore, type StartOptions } from './core.ts';
import type { CallOutcome, Session } from './session.ts';
import { findTool, TOOLS, type Tool } from './tools.ts';

export const EXIT = { ok: 0, error: 1, usage: 2, launch: 3 } as const;

export type Io = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin: Readable;
  interactive?: boolean;
};
export type CliDeps = { startCore: (options: StartOptions) => Promise<Session> };

const USAGE = `usage: cc [--exe <path>] [--data-root <dir>] <command>

commands:
  tools                    list the allowlisted tools
  call <tool> [json]       run one tool; prints pretty JSON
  run <file.jsonl|->       run {"tool","args"} lines; prints NDJSON {tool, ok, result|error}
  repl                     interactive: <tool> [json], tools, exit

Tools accept the underscored name (rehearsal_scenario_run) or the method (rehearsal.scenario.run).
The core is a rehearsal-only cc-headless (CC_HEADLESS_EXE, or built with cargo) on a temp data root.
exit: 0 ok, 1 error envelope, 2 usage, 3 core launch failure
`;

type Parsed = { command: string | undefined; positional: string[]; options: StartOptions } | { error: string };

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const options: StartOptions = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')),
      arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (flag === '--exe' || flag === '--data-root') {
      const value = inline ?? argv[++index];
      if (!value) return { error: `${flag} needs a value` };
      if (flag === '--exe') options.exe = value;
      else options.dataRoot = value;
    } else if (arg === '-h' || arg === '--help') {
      return { command: 'help', positional: [], options };
    } else if (arg.startsWith('--')) {
      return { error: `unknown option ${arg}` };
    } else {
      positional.push(arg);
    }
  }
  const [command, ...rest] = positional;
  return { command, positional: rest, options };
}

function table(): string {
  const width = Math.max(...TOOLS.map(tool => tool.name.length));
  return TOOLS.map(tool => `${tool.name.padEnd(width)}  ${tool.class.padEnd(9)}  ${tool.description}`)
    .join('\n') + '\n';
}

function unknown(io: Io, name: string): number {
  io.stderr(`unknown tool: ${name}\navailable: ${TOOLS.map(tool => tool.name).join(', ')}\n`);
  return EXIT.usage;
}

function parseArgsJson(text: string | undefined): { args: unknown } | undefined {
  if (text === undefined || text.trim() === '') return { args: {} };
  try {
    return { args: parseJson(text) };
  } catch {
    return undefined;
  }
}

const pretty = (outcome: CallOutcome) =>
  `${JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }, null, 2)}\n`;

async function withCore(io: Io, deps: CliDeps, options: StartOptions,
  work: (session: Session) => Promise<number>): Promise<number> {
  let session: Session;
  try {
    session = await deps.startCore(options);
  } catch (error) {
    io.stderr(`cc: ${error instanceof Error ? error.message : 'headless core launch failed'}\n`);
    return EXIT.launch;
  }
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

type Step = { tool: Tool; args: unknown };

/** The one parse door for a run script: every line is checked before any core starts. */
export function parseScript(text: string): { steps: Step[] } | { error: string } {
  const steps: Step[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = parseJson(line);
    } catch {
      return { error: `line ${index + 1}: not JSON` };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('tool' in value)
      || typeof value.tool !== 'string' || Object.keys(value).some(key => key !== 'tool' && key !== 'args')) {
      return { error: `line ${index + 1}: expected {"tool": string, "args"?: object}` };
    }
    const tool = findTool(value.tool);
    if (!tool) return { error: `line ${index + 1}: unknown tool ${value.tool}` };
    steps.push({ tool, args: 'args' in value ? value.args : {} });
  }
  return { steps };
}

async function readAll(stream: Readable): Promise<string> {
  let text = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) text += String(chunk);
  return text;
}

async function run(io: Io, deps: CliDeps, options: StartOptions, source: string): Promise<number> {
  let text: string;
  try {
    text = source === '-' ? await readAll(io.stdin) : await readFile(source, 'utf8');
  } catch {
    io.stderr(`cc: cannot read ${source}\n`);
    return EXIT.usage;
  }
  const script = parseScript(text);
  if ('error' in script) {
    io.stderr(`cc run: ${script.error}\navailable: ${TOOLS.map(tool => tool.name).join(', ')}\n`);
    return EXIT.usage;
  }
  return withCore(io, deps, options, async session => {
    let failed = false;
    for (const step of script.steps) {
      const outcome = await session.call(step.tool.name, step.args);
      failed ||= !outcome.ok;
      io.stdout(`${JSON.stringify(outcome.ok ? { tool: step.tool.name, ok: true, result: outcome.result }
        : { tool: step.tool.name, ok: false, error: outcome.error })}\n`);
    }
    return failed ? EXIT.error : EXIT.ok;
  });
}

async function repl(io: Io, deps: CliDeps, options: StartOptions): Promise<number> {
  return withCore(io, deps, options, async session => {
    const lines = createInterface({ input: io.stdin, terminal: false });
    lines.on('SIGINT', () => lines.close());
    const prompt = () => { if (io.interactive) io.stdout('cc> '); };
    prompt();
    for await (const raw of lines) {
      const line = raw.trim();
      if (line === 'exit' || line === 'quit') break;
      if (line === 'tools') io.stdout(table());
      else if (line !== '') {
        const space = line.search(/\s/);
        const name = space === -1 ? line : line.slice(0, space);
        const parsed = parseArgsJson(space === -1 ? undefined : line.slice(space + 1));
        if (!findTool(name)) unknown(io, name);
        else if (!parsed) io.stderr('cc: arguments are not JSON\n');
        else io.stdout(pretty(await session.call(name, parsed.args)));
      }
      prompt();
    }
    lines.close();
    return EXIT.ok;
  });
}

export async function main(argv: readonly string[], io: Io, deps: CliDeps = { startCore }): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    io.stderr(`cc: ${parsed.error}\n\n${USAGE}`);
    return EXIT.usage;
  }
  const { command, positional, options } = parsed;
  if (command === 'help') {
    io.stdout(USAGE);
    return EXIT.ok;
  }
  if (command === 'tools' && positional.length === 0) {
    io.stdout(table());
    return EXIT.ok;
  }
  if (command === 'call' && positional.length >= 1 && positional.length <= 2) {
    const [name = '', json] = positional;
    if (!findTool(name)) return unknown(io, name);
    const args = parseArgsJson(json);
    if (!args) {
      io.stderr('cc: arguments are not JSON\n');
      return EXIT.usage;
    }
    return withCore(io, deps, options, async session => {
      const outcome = await session.call(name, args.args);
      io.stdout(pretty(outcome));
      return outcome.ok ? EXIT.ok : EXIT.error;
    });
  }
  if (command === 'run' && positional.length === 1) return run(io, deps, options, positional[0] ?? '-');
  if (command === 'repl' && positional.length === 0) return repl(io, deps, options);
  io.stderr(USAGE);
  return EXIT.usage;
}

/** Process entry for the `cc` bin. */
export async function runCli(argv: readonly string[]): Promise<void> {
  process.exitCode = await main(argv, {
    stdout: text => { process.stdout.write(text); },
    stderr: text => { process.stderr.write(text); },
    stdin: process.stdin,
    interactive: process.stdin.isTTY,
  });
}
