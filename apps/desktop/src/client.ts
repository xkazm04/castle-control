import { createCoreSource } from './core-source.js';
import type { CoreLaunch, Network } from './core-source.js';
import { createReadModel } from './model.js';
import { createSimulatedSource } from './simulated.js';

export type Launch = { mode: 'fixture' } | CoreLaunch;

// The shell injects an object in memory before loading main.tsx. Never use URL
// parameters, storage, logs or environment variables for the session capability.
export function parseLaunch(value: unknown): Launch {
  if (typeof value !== 'object' || value === null) throw new Error('Missing shell launch');
  if ('mode' in value && value.mode === 'fixture' && Object.keys(value).length === 1) return { mode: 'fixture' };
  if ('mode' in value && value.mode === 'core'
      && 'endpoint' in value && typeof value.endpoint === 'string'
      && 'session_token' in value && typeof value.session_token === 'string'
      && Object.keys(value).length === 3) {
    return { mode: 'core', endpoint: value.endpoint, session_token: value.session_token };
  }
  throw new Error('Invalid shell launch');
}

export function createDesktopClient(value: unknown, transport?: Network) {
  const launch = parseLaunch(value);
  // Fixture mode has no endpoint or network dependency, even at runtime.
  return createReadModel(launch.mode === 'fixture' ? createSimulatedSource() : createCoreSource(launch, transport));
}
