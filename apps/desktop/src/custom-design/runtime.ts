import type { ArtAssetKind, ArtCostReceipt, ArtDirection, ArtQuestion, DesignId } from '@castle-control/contract';
import { closestAsset, directArt, libraryUrl, loadLibrary, searchLibrary, size_options } from '@castle-control/ui/custom-design';
import type { LibraryAsset, LibraryCatalog, LibraryMatch, SizeOption } from '@castle-control/ui/custom-design';
import type { PreviewArt } from '@castle-control/ui/living-preview';
import type { WorkContext } from '@castle-control/ui/steward-flow';
import type { CoreBeaconsPort } from '../beacons-core.js';

/**
 * The Custom design flow's working state, loaded only once the flow runs: the library
 * catalog and its searches, the follow-up question, and what "Make a new one" produced.
 * Fixture mode makes a SIMULATED pick of the closest library asset; core mode runs
 * design.create -> art.direct (scripted fallback) -> art.generate (OpenAI) -> art.layers,
 * and keeps every paid step's result so a retry never pays for it twice.
 */
export type DesignMode = { core: false } | { core: true; beacons: () => Promise<CoreBeaconsPort> };
export type MakeInput = { request: string; size: SizeOption; answer?: string };
export type Made = {
  key: string; signature: string; art: PreviewArt; style_name: string;
  /** library: a ready-made pick; simulated: fixture stand-in for a generation; generated: a real image in the core. */
  source: 'library' | 'simulated' | 'generated';
  library_id?: string; design_id?: DesignId; direction?: ArtDirection; scripted?: boolean; cost?: string; note?: string;
};

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Stopped.')); }, { once: true });
});
const stopped = (signal: AbortSignal) => { if (signal.aborted) throw new Error('Stopped.'); };

export function libraryArt(asset: LibraryAsset, kind: ArtAssetKind): PreviewArt {
  return { kind, label: asset.style_name, base: libraryUrl(asset.file), anchors: asset.anchors ?? {}, palette: asset.palette,
    width: asset.width, height: asset.height,
    ...(asset.effect ? { effect: libraryUrl(asset.effect) } : {}), ...(asset.effect_blend ? { effect_blend: asset.effect_blend } : {}),
    ...(asset.token ? { token: libraryUrl(asset.token) } : {}) };
}

/** Plain words for a refused core call. The envelope's own prose is never shown (it may carry secrets). */
export function plainFailure(stage: 'design' | 'generate' | 'layers', error: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (stage === 'layers') return new Error('Your image was made and kept, but breaking it into layers failed. Try again reuses the same image; nothing is spent twice.');
  const reasons: Record<string, string> = {
    unauthorized: 'Your OpenAI key was refused. Check it in Settings. Nothing was spent.',
    blocked_by_policy: 'OpenAI declined this request. Try different words. Nothing was spent.',
    rate_limited: 'OpenAI asked us to slow down. Nothing was spent; try again in a minute.',
    invalid: 'The request was not accepted. Nothing was spent.',
    unavailable: 'Image generation is unavailable right now (offline, or no key in Settings). Nothing was spent; the library still works.',
  };
  return new Error(reasons[code] ?? (stage === 'design' ? 'The core could not open a new design. Nothing was spent.' : 'Generation failed. Nothing was spent.'));
}

function costLine(costs: readonly ArtCostReceipt[]): string | undefined {
  const micro = costs.reduce((sum, cost) => sum + ('micro_usd' in cost.charge ? cost.charge.micro_usd : 0), 0);
  return micro ? `$${(micro / 1_000_000).toFixed(2)} on your OpenAI key` : undefined;
}

export function createDesignState(kind: ArtAssetKind, mode: DesignMode, read: (url: string) => Promise<unknown>) {
  let catalog: LibraryCatalog | undefined;
  let openai = !mode.core;
  let design_id: DesignId | undefined;
  let serial = 0;
  const searches = new Map<string, LibraryMatch[]>();
  const results = new Map<string, Made>();
  const shown = new Map<string, string[]>();
  const directions = new Map<string, { direction: ArtDirection; scripted: boolean }>();
  /** Generated but not yet layered: a retry after a layers failure reuses it instead of paying again. */
  const unlayered = new Map<string, { asset: string; costs: readonly ArtCostReceipt[] }>();
  const signature = (input: MakeInput) => JSON.stringify([input.request, input.size.id, input.answer ?? '']);
  const scripted = (input: MakeInput) => directArt({ kind, request: input.request, width: input.size.width, height: input.size.height,
    ...(input.answer ? { answer: input.answer } : {}) });

  async function makeSimulated(input: MakeInput, context: WorkContext): Promise<Made> {
    context.progress('Reading your request...');
    await pause(350, context.signal);
    const direction = scripted(input);
    context.progress(`Art direction: ${direction.style_name} (scripted).`);
    await pause(450, context.signal);
    context.progress('SIMULATED: picking the closest library art instead of generating...');
    await pause(450, context.signal);
    const sig = signature(input);
    const asset = catalog ? closestAsset(catalog, kind, `${input.request} ${direction.style_name}`, shown.get(sig) ?? []) : undefined;
    if (!asset) throw new Error('The library has no art of this kind.');
    shown.set(sig, [...(shown.get(sig) ?? []), asset.id]);
    return { key: '', signature: sig, art: libraryArt(asset, kind), style_name: asset.style_name, source: 'simulated', library_id: asset.id,
      direction, scripted: true, note: 'SIMULATED generation: the closest ready-made library art stands in for a new image. Nothing was spent.' };
  }

  async function makeCore(input: MakeInput, context: WorkContext, beacons: () => Promise<CoreBeaconsPort>): Promise<Made> {
    const port = await beacons();
    const sig = signature(input);
    context.progress('Opening a new design in your core...');
    try { design_id ??= (await port.createDesign(kind)).design_id; } catch (error: unknown) { throw plainFailure('design', error); }
    stopped(context.signal);
    context.progress('Directing the art...');
    let directed = directions.get(sig);
    if (!directed) {
      try {
        directed = { direction: await port.directArt({ kind, request: input.request, width: input.size.width, height: input.size.height,
          ...(input.answer ? { answer: input.answer } : {}) }), scripted: false };
      } catch {
        // No Steward engine (or offline): the scripted director gives the same shape.
        directed = { direction: scripted(input), scripted: true };
      }
      directions.set(sig, directed);
    }
    stopped(context.signal);
    let generated = unlayered.get(sig);
    if (!generated) {
      context.progress('Generating the image with your OpenAI key. This can take a minute...');
      try {
        const result = await port.generateArt({ design_id, model_id: 'gpt-image-2-5-sunburst', prompt: directed.direction.master_prompt, quantity: 1,
          width: input.size.width, height: input.size.height, remove_background: false, provider: 'openai', background: 'transparent' });
        const first = result.assets[0];
        if (!first) throw { code: 'unavailable' };
        generated = { asset: first.asset, costs: result.costs };
        // Kept even if the streamer cancelled meanwhile: the image is paid for and reused on the next try.
        unlayered.set(sig, generated);
      } catch (error: unknown) { throw plainFailure('generate', error); }
    }
    stopped(context.signal);
    context.progress('Breaking it into layers and measuring its anchors...');
    let layers;
    try { layers = await port.artLayers({ design_id, asset: generated.asset, kind }); } catch (error: unknown) { throw plainFailure('layers', error); }
    unlayered.delete(sig);
    const { direction } = directed;
    // The new image itself, from the core's loopback overlay host; without it the preview keeps anchors and palette.
    let images: { base?: string; effect?: string };
    try {
      const root = `${await port.overlayOrigin()}/assets/${layers.design_id}/${layers.package.content_hash}/`;
      images = { base: root + layers.base, ...(layers.effect ? { effect: root + layers.effect } : {}) };
    } catch { images = {}; }
    return { key: '', signature: sig, style_name: direction.style_name, source: 'generated', design_id: layers.design_id, direction,
      scripted: directed.scripted, ...(costLine([...generated.costs, ...layers.costs]) ? { cost: costLine([...generated.costs, ...layers.costs]) ?? '' } : {}),
      art: { kind, label: direction.style_name, anchors: layers.anchors, palette: direction.palette, width: input.size.width, height: input.size.height, ...images },
      note: images.base ? 'Your new image from the core, moving with SIMULATED sample data. It reaches the overlay once sealed.'
        : 'Your new image is kept in the core and shows on the overlay once sealed. Here: its measured anchors and palette with SIMULATED motion.' };
  }

  return {
    kind,
    /** Load the library (and, in core mode, whether an OpenAI key is set), then search it. Resolves to the request it searched. */
    async search(request: string, context: WorkContext): Promise<string> {
      context.progress('Looking through the library...');
      catalog ??= await loadLibrary(read);
      if (mode.core) {
        try {
          const port = await mode.beacons();
          await port.loadArtStatus();
          openai = port.getSnapshot().art_providers.some(item => item.provider === 'openai' && item.available);
        } catch { openai = false; }
      }
      stopped(context.signal);
      searches.set(request, searchLibrary(catalog, kind, request, 3));
      return request;
    },
    matches: (request: string | undefined) => request === undefined ? undefined : searches.get(request),
    asset: (id: string | undefined) => catalog?.assets.find(item => item.id === id && item.kind === kind),
    canGenerate: () => openai,
    sizes: (): readonly SizeOption[] => size_options[kind],
    size: (id: string | undefined) => size_options[kind].find(item => item.id === id),
    question: (request: string, size: SizeOption): ArtQuestion | undefined => scripted({ request, size }).question,
    signature,
    async make(input: MakeInput, context: WorkContext): Promise<string> {
      const made = mode.core ? await makeCore(input, context, mode.beacons) : await makeSimulated(input, context);
      const key = `made-${++serial}`;
      results.set(key, { ...made, key });
      return key;
    },
    made: (key: string | undefined) => key === undefined ? undefined : results.get(key),
  };
}
export type DesignState = ReturnType<typeof createDesignState>;
