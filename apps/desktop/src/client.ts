import { createCoreSource } from './core-source.js';
import type { CoreLaunch, Network } from './core-source.js';
import { createReadModel } from './model.js';
import { createSimulatedSource } from './simulated.js';

// Reserved opt-in metadata only. It does not select a Steward implementation.
export type Launch = { mode: 'fixture' } | (CoreLaunch & { steward: 'live' | 'simulated' });

// The shell injects an object in memory before loading main.tsx. Never use URL
// parameters, storage, logs or environment variables for the session capability.
export function parseLaunch(value: unknown): Launch {
  if (typeof value !== 'object' || value === null) throw new Error('Missing shell launch');
  if ('mode' in value && value.mode === 'fixture' && Object.keys(value).length === 1) return { mode: 'fixture' };
  const steward = 'steward' in value ? value.steward : 'simulated';
  if ('mode' in value && value.mode === 'core'
      && 'endpoint' in value && typeof value.endpoint === 'string'
      && 'session_token' in value && typeof value.session_token === 'string'
      && (steward === 'live' || steward === 'simulated')
      && Object.keys(value).length === ('steward' in value ? 4 : 3)
      && Object.keys(value).every(key => ['mode', 'endpoint', 'session_token', 'steward'].includes(key))) {
    return { mode: 'core', endpoint: value.endpoint, session_token: value.session_token, steward };
  }
  throw new Error('Invalid shell launch');
}

export function createDesktopClient(value: unknown, transport?: Network) {
  const launch = parseLaunch(value);
  // Fixture mode has no endpoint or network dependency, even at runtime.
  return createReadModel(launch.mode === 'fixture' ? createSimulatedSource() : createCoreSource(launch, transport));
}
