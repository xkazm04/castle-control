import type { Proposal } from '../steward/port.js';
import { artifactChambers, presetsFor } from './catalog.js';
import type { ArtifactId, DesignOutput } from './catalog.js';

export type DesignParseResult = { readonly ok: true; readonly output: DesignOutput }
  | { readonly ok: false; readonly reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, names: readonly string[]): boolean {
  return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some(item => item === value);
}

/** The single schema door for generated fixtures and amended proposal data. No code or URLs. */
export function validateDesignOutput(value: unknown, artifact: ArtifactId): DesignParseResult {
  const invalid = { ok: false, reason: 'Invalid design data. Choose a preset or try another simulated design.' } as const;
  if (!record(value) || !keys(value, ['simulated', 'scene', 'style']) || value.simulated !== true
    || !record(value.scene) || !keys(value.scene, ['shape'])
    || !record(value.style) || !keys(value.style, ['ink', 'treatment', 'density'])) return invalid;
  const { shape } = value.scene;
  const { ink, treatment, density } = value.style;
  if (!member(shape, presetsFor(artifact).map(item => item.output.scene.shape))
    || !member(ink, ['gules', 'azure', 'or', 'key'])
    || !member(treatment, ['halftone', 'engraved', 'plain'])
    || !member(density, ['quiet', 'balanced', 'bold'])) return invalid;
  return { ok: true, output: Object.freeze({ simulated: true,
    scene: Object.freeze({ shape }), style: Object.freeze({ ink, treatment, density }),
  }) };
}

export type DesignProposalData = { readonly artifact: ArtifactId; readonly output: DesignOutput };
export type DesignProposalResult = { readonly ok: true; readonly data: DesignProposalData }
  | { readonly ok: false; readonly reason: string };

export function readDesignProposal(proposal: Proposal): DesignProposalResult {
  const fields = Object.fromEntries(proposal.fields.map(field => [field.key, field.value]));
  const invalid = { ok: false, reason: 'Invalid design proposal. Preview a valid design before sealing.' } as const;
  if (!keys(fields, ['design_action', 'artifact', 'preset_id', 'prompt', 'shape', 'ink', 'treatment', 'density', 'simulated'])
    || proposal.fields.length !== Object.keys(fields).length
    || !member(fields.artifact, ['draw', 'urn', 'beacon', 'map', 'overlay'])
    || !member(fields.design_action, ['restyle', 'custom']) || proposal.kind !== 'proclaim'
    || artifactChambers[fields.artifact] !== proposal.chamber
    || typeof fields.prompt !== 'string' || fields.prompt.length > 200
    || (fields.design_action === 'custom' && !fields.prompt.trim())
    || !presetsFor(fields.artifact).some(preset => preset.id === fields.preset_id)) return invalid;
  const result = validateDesignOutput({ simulated: fields.simulated,
    scene: { shape: fields.shape }, style: { ink: fields.ink, treatment: fields.treatment, density: fields.density },
  }, fields.artifact);
  return result.ok ? { ok: true, data: { artifact: fields.artifact, output: result.output } } : result;
}
