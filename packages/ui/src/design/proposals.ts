import type { Proposal, ProposalResult } from '../steward/port.js';
import type { ProposalQueue } from '../steward/queue.js';
import { artifactChambers, defaultPreset, presetsFor } from './catalog.js';
import type { ArtifactId } from './catalog.js';
import { validateDesignOutput } from './schema.js';

export type DesignRequest =
  | { readonly action: 'restyle'; readonly artifact: ArtifactId; readonly preset_id: string }
  | { readonly action: 'custom'; readonly artifact: ArtifactId; readonly prompt: string };
export type DesignGenerator = (request: DesignRequest) => unknown;

/** Deterministic illustrative fixtures only. Prompt text is never executable style or markup. */
export const simulatedDesign: DesignGenerator = request => {
  const preset = request.action === 'restyle'
    ? presetsFor(request.artifact).find(item => item.id === request.preset_id) : defaultPreset(request.artifact);
  if (!preset) throw new Error('Choose a preset for this artifact.');
  if (request.action === 'restyle') return preset.output;
  const prompt = request.prompt.toLowerCase();
  return { ...preset.output, style: { ...preset.output.style,
    treatment: /engraved|etched/.test(prompt) ? 'engraved' : /plain|minimal/.test(prompt) ? 'plain' : 'halftone',
    density: /quiet|calm|minimal/.test(prompt) ? 'quiet' : /bold|bright/.test(prompt) ? 'bold' : 'balanced',
  } };
};

export function draftDesign(queue: ProposalQueue, id: string, request: DesignRequest,
  generate: DesignGenerator = simulatedDesign): ProposalResult {
  const current = queue.getSnapshot().proposals.find(proposal => proposal.id === id);
  if (current && !current.fields.some(field => field.key === 'artifact' && field.value === request.artifact)) {
    return { ok: false, code: 'conflict', reason: 'An amendment must keep the same design artifact.' };
  }
  if (request.action === 'custom' && (!request.prompt.trim() || request.prompt.length > 200)) {
    return { ok: false, code: 'invalid_fields', reason: 'Describe a style in 1 to 200 characters.' };
  }
  try {
    const parsed = validateDesignOutput(generate(request), request.artifact);
    if (!parsed.ok) return { ...parsed, code: 'invalid_fields' };
    const preset = request.action === 'restyle'
      ? presetsFor(request.artifact).find(item => item.id === request.preset_id) : defaultPreset(request.artifact);
    if (!preset) return { ok: false, code: 'invalid_fields', reason: 'Choose a preset for this artifact.' };
    const output = parsed.output;
    const values = {
      design_action: request.action, artifact: request.artifact, preset_id: preset.id,
      prompt: request.action === 'custom' ? request.prompt.trim().replaceAll('\u2014', ', ') : 'Preset selection',
      shape: output.scene.shape, ink: output.style.ink, treatment: output.style.treatment,
      density: output.style.density, simulated: true,
    };
    const fields: Proposal['fields'] = Object.entries(values).map(([key, value]) => ({ key, label: key.replaceAll('_', ' '), value, struck: [] }));
    return queue.addOrUpdate({ id, chamber: artifactChambers[request.artifact], kind: 'proclaim',
      title: request.action === 'restyle' ? 'Restyle' : 'Custom design', revision: 1, state: 'drafted', fields });
  } catch {
    return { ok: false, code: 'invalid_fields', reason: 'Simulated design generation failed. The current look is intact.' };
  }
}
