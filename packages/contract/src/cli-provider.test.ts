import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect, test } from 'vitest';
import { parseJson } from './door.mjs';
import { schemas } from './generated/schemas.js';
import type { CliProvider } from './index.js';

// Validates the exported enum, not a second implementation of the settings parser.
const validate = new Ajv2020({ strict: true }).compile<CliProvider>(schemas.types.CliProvider);

test('both CLI providers round-trip through the generated enum schema', () => {
  for (const provider of ['claude_cli', 'codex_cli']) {
    const decoded = parseJson(JSON.stringify(provider));
    expect(validate(decoded)).toBe(true);
    expect(decoded).toBe(provider);
  }
});

test('CLI provider refuses null, unknown enum strings and wrong types', () => {
  for (const value of [null, 'unknown', false, 0, {}, []]) {
    expect(validate(value)).toBe(false);
  }
});
