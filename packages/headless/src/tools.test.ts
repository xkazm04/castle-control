import { RPC_METHODS } from '@castle-control/contract';
import { expect, test } from 'vitest';
import { ARMED, findTool, TOOLS } from './tools.ts';

const READ = ['status.get', 'settings.get', 'auth.twitch.status', 'bridge.status.get', 'obs.status.get',
  'gatehouse.rules.list', 'gatehouse.consensus.get', 'gatehouse.chat.list', 'gatehouse.history.list',
  'gatehouse.liveRun.get', 'gatehouse.source.url', 'lots.draw.list', 'lots.draw.check', 'lots.roll.lookup',
  'lots.writ.get', 'lots.source.url', 'beacons.visual.list', 'beacons.contribution.list', 'beacons.source.url',
  'maproom.stage.get', 'tiltyard.source.url'];
const SIMULATED = ['rehearsal.start', 'rehearsal.stop', 'rehearsal.scenario.run', 'rehearsal.crowd.set'];
const LOCAL = ['events.since', 'overlay.snapshot'];
const methods: readonly string[] = RPC_METHODS;
const armedList: readonly string[] = ARMED;

test('the allowlist is exactly the reviewed rows, by class', () => {
  const byClass = (kind: string) => TOOLS.filter(tool => tool.class === kind).map(tool => tool.method);
  expect(byClass('read')).toEqual(READ);
  expect(byClass('simulated')).toEqual(SIMULATED);
  expect(byClass('local')).toEqual(LOCAL);
});

test('TOOLS ⊂ RPC_METHODS ∪ local, and disjoint from ARMED', () => {
  for (const tool of TOOLS) {
    if (tool.class === 'local') expect(methods).not.toContain(tool.method);
    else expect(methods).toContain(tool.method);
    expect(armedList).not.toContain(tool.method);
  }
});

test('allowlist and ARMED partition every RPC method, so a new method needs a review', () => {
  const allowed = TOOLS.filter(tool => tool.class !== 'local').map(tool => tool.method);
  expect([...allowed, ...ARMED].sort()).toEqual([...methods].sort());
  expect(new Set(ARMED).size).toBe(ARMED.length);
});

test('the brief\'s armed denylist families are all denied', () => {
  for (const method of methods) {
    const armed = /^(auth\.twitch\.(start|revoke)|settings\.set|store\.|gatehouse\.(rules\.(upsert|setMode)|ban\.|decision\.undo|petition\.resolve|held\.resolve|delay\.set|shield\.set|lease\.end|recording\.import|drill\.)|lots\.(draw\.upsert|image\.upload|roll\.seal|cast)|beacons\.(visual\.upsert|curve\.set|simulate|art\.(generate|status))|maproom\.(design\.|turn\.run)|steward\.|obs\.(connect|source\.create|scene\.ensure|rehearsal\.clear))/
      .test(method);
    expect(armedList.includes(method), method).toBe(armed);
    if (armed) {
      expect(findTool(method)).toBeUndefined();
      expect(findTool(method.replaceAll('.', '_'))).toBeUndefined();
    }
  }
});

test('names are MCP-safe and unique; both spellings resolve', () => {
  const names = TOOLS.map(tool => tool.name);
  expect(new Set(names).size).toBe(names.length);
  for (const tool of TOOLS) {
    expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(tool.name).toBe(tool.method.replaceAll('.', '_'));
    expect(findTool(tool.name)).toBe(tool);
    expect(findTool(tool.method)).toBe(tool);
    expect(tool.description.length).toBeGreaterThan(10);
  }
  expect(findTool('rehearsal_scenario_run')?.method).toBe('rehearsal.scenario.run');
  expect(findTool('nope')).toBeUndefined();
});

test('inputSchema comes from the contract params; Empty is an explicit empty object', () => {
  for (const tool of TOOLS) expect(tool.inputSchema.type).toBe('object');
  expect(findTool('status_get')?.inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
  const crowd = findTool('rehearsal_crowd_set')?.inputSchema;
  expect(crowd?.required).toEqual(['per_minute']);
  expect(crowd?.properties).toMatchObject({ per_minute: { type: 'integer', minimum: 0, maximum: 600 } });
  expect(crowd).not.toHaveProperty('$schema');
  const scenario = findTool('rehearsal_scenario_run')?.inputSchema;
  expect(scenario?.$defs).toMatchObject({
    RehearsalScenario: { enum: ['lots_fill', 'vote_round', 'beacon_fire', 'duel_round'] } });
});
