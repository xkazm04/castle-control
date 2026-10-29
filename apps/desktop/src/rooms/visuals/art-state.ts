import { parseError } from '@castle-control/contract';
import type { ArtGenerateParams, ArtGenerateResult, DesignId } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';

export type ArtState = Readonly<{
  prompt: string; model_id: string; confirming: boolean; busy: boolean;
  error?: string; result?: ArtGenerateResult;
}>;

/** UI state only. A paid request has one explicit confirmation and no retry. */
export function createArtGeneration(port: CoreBeaconsPort, design_id?: DesignId) {
  let state: ArtState = Object.freeze({ prompt: '', model_id: '', confirming: false, busy: false });
  const listeners = new Set<() => void>();
  function publish(next: ArtState) {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit(field: 'prompt' | 'model_id', value: string) {
      if (!state.busy && !state.confirming) publish({ ...state, [field]: value });
    },
    requestConfirmation() {
      if (state.busy || state.confirming || !design_id) return;
      const { prompt, model_id } = state;
      if (!prompt.trim() || !model_id.trim()) {
        publish({ prompt, model_id, busy: false, confirming: false, error: 'Enter a prompt and model ID.' });
        return;
      }
      publish({ prompt, model_id, busy: false, confirming: true });
    },
    cancel() {
      if (!state.busy) publish({ prompt: state.prompt, model_id: state.model_id, busy: false, confirming: false });
    },
    async confirm() {
      if (!state.confirming || state.busy || !design_id) return;
      const { prompt, model_id } = state;
      publish({ prompt, model_id, confirming: false, busy: true });
      // Generated request validation stays at the core port's contract door.
      const params: ArtGenerateParams = { design_id, prompt, model_id, width: 512, height: 512,
        quantity: 1, remove_background: false };
      try {
        const result = await port.generateArt(params);
        publish({ prompt, model_id, confirming: false, busy: false, result });
      } catch (error: unknown) {
        let code: string;
        try { code = parseError(JSON.stringify(error)).code; }
        catch { code = 'unavailable'; }
        // Never render provider prose, details or launch credentials.
        publish({ prompt, model_id, confirming: false, busy: false,
          error: `Art request failed: ${code}. No automatic retry was made.` });
      }
    },
  };
}
export type ArtGeneration = ReturnType<typeof createArtGeneration>;
