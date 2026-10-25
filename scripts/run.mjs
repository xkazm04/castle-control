import { spawnSync } from 'node:child_process';

export function run(command, args, options = {}) {
  // On Windows pnpm is a .cmd shim; invoke it through cmd with fixed arguments.
  const isShim = process.platform === 'win32' && command === 'pnpm';
  const result = spawnSync(isShim ? 'cmd.exe' : command,
    isShim ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
    { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}
