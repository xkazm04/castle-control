import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ArtAssetKind } from '@castle-control/contract';
import type { FlowChamber } from '@castle-control/ui/steward-flow';
import { proposalQueue } from '@castle-control/ui/steward';
import { createDockStore, walkFlow } from '@castle-control/ui/steward-flow';
import type { DockStore } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { customDesignFlow, customFlow, customFlowId } from './flow.js';
import type { CustomDraft } from './flow.js';
import { library_presets } from './presets.js';
import { sealedLooks } from './sealed.js';
import { lotteryCustomHost } from '../rooms/lottery/custom-host.js';
import { moderatorCustomHost } from '../rooms/moderator/custom-host.js';
import { visualsCustomHost } from '../rooms/visuals/custom-host.js';
import type { CustomHost } from './seal.js';

const raw: unknown = JSON.parse(readFileSync(new URL('../../public/art/library/library.json', import.meta.url), 'utf8'));
const fixture: Snapshot = { mode: 'fixture', phase: 'ready' };
const hosts: Record<ArtAssetKind, (snapshot: Snapshot) => CustomHost> = { beacon: visualsCustomHost, frame: visualsCustomHost,
  vote_bar: moderatorCustomHost, draw_vessel: lotteryCustomHost };
const make = (kind: ArtAssetKind, snapshot: Snapshot) => customDesignFlow(kind, snapshot, hosts[kind](snapshot));

// Core ports are mocked at the one place flows reach them: the client's connection table.
const core = vi.hoisted(() => { const ports: { beacons?: unknown; gatehouse?: unknown; lots?: unknown } = {}; return ports; });
vi.mock('../client.js', async original => ({ ...await original<Record<string, unknown>>(),
  coreBeaconsConnection: () => core.beacons ? { launch: {}, port: core.beacons } : undefined,
  coreGatehouseConnection: () => core.gatehouse ? { launch: {}, port: core.gatehouse } : undefined,
  coreLotsConnection: () => core.lots ? { launch: {}, port: core.lots } : undefined }));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(raw) }))); });
afterEach(() => { vi.unstubAllGlobals(); delete core.beacons; delete core.gatehouse; delete core.lots; });

const chamberOf: Record<ArtAssetKind, FlowChamber> = { beacon: 'visuals', frame: 'visuals', vote_bar: 'moderator', draw_vessel: 'lottery' };
const session = (store: DockStore, kind: ArtAssetKind) => store.getSnapshot().sessions[chamberOf[kind]];
const draft = (store: DockStore, kind: ArtAssetKind): CustomDraft => {
  const open = session(store, kind);
  if (!open) throw new Error('no session');
  return walkFlow(open.flow, open.state).draft as CustomDraft;
};
const active = (store: DockStore, kind: ArtAssetKind) => { const open = session(store, kind); return open ? walkFlow(open.flow, open.state).active : null; };
async function settle(store: DockStore, kind: ArtAssetKind) {
  await vi.waitFor(() => expect(session(store, kind)?.work?.status).not.toBe('running'), { timeout: 4000 });
}
function options(store: DockStore, kind: ArtAssetKind) {
  const entry = active(store, kind);
  return entry?.step.kind === 'choice' ? entry.step.options(entry.before) : [];
}

test('the static preset table mirrors the library catalog: ten presets per kind', () => {
  const presets = (raw as { assets: { id: string; kind: string; file: string; width: number; height: number; style_name: string; preset: boolean }[] })
    .assets.filter(item => item.preset && item.kind !== 'map')
    .map(({ id, kind, file, width, height, style_name }) => ({ id, kind, file, width, height, style_name }));
  expect([...library_presets].sort((a, b) => a.id.localeCompare(b.id))).toEqual(presets.sort((a, b) => a.id.localeCompare(b.id)));
  for (const kind of ['beacon', 'frame', 'vote_bar', 'draw_vessel']) expect(library_presets.filter(item => item.kind === kind)).toHaveLength(10);
});

describe('fixture journeys', () => {
  test.each(['beacon', 'frame', 'vote_bar', 'draw_vessel'] as const)('%s: request -> library pick -> preview -> seal, SIMULATED', async kind => {
    const store = createDockStore();
    const flow = make(kind, fixture);
    expect(flow).toMatchObject({ id: customFlowId(kind), chamber: chamberOf[kind], simulated: true });
    store.open(flow);
    const request = active(store, kind);
    expect(request?.step.kind === 'field' && request.step.suggestions?.(request.before)).toHaveLength(10);
    store.answer(chamberOf[kind], 'halloween version pls');
    await settle(store, kind);
    const picks = options(store, kind);
    expect(picks).toHaveLength(4);
    expect(picks[0]).toMatchObject({ label: 'Hallowed Night Gothic', tag: 'closest' });
    expect(picks[0]?.picture?.src).toMatch(/^\/art\/library\//);
    expect(picks[3]).toMatchObject({ id: 'new', simulated: true });
    store.answer(chamberOf[kind], picks[0]?.id ?? '');
    expect(active(store, kind)?.step.id).toBe('look');
    store.answer(chamberOf[kind], 'ok');
    await store.seal(chamberOf[kind]);
    const said = store.getSnapshot().beats.at(-1);
    expect(said).toMatchObject({ sealed: true, simulated: true });
    expect(said?.text).toContain('Hallowed Night Gothic');
    if (kind === 'vote_bar') expect(sealedLooks.get().vote_bar).toBe('votebar-20');
    if (kind === 'draw_vessel') {
      const { lotterySession } = await import('../rooms/lottery/session.js');
      expect(lotterySession(proposalQueue).display.getSnapshot().art_preset).toBe('vessel-20');
    }
    if (kind === 'beacon' || kind === 'frame') {
      const { fixtureBeacons } = await import('../rooms/visuals/stage-state.js');
      const id = kind === 'beacon' ? 'offering-altar' : 'gilded-frame';
      expect(fixtureBeacons().getSnapshot().visuals.find(item => item.visual.visual_id === id)?.visual.design_id)
        .toBe(kind === 'beacon' ? 'library-beacon-20' : 'library-frame-20');
    }
  });

  test('make a new one: size, one question with the assumed answer tagged, SIMULATED generation, try again picks another', async () => {
    const store = createDockStore();
    store.open(make('beacon', fixture));
    store.answer('visuals', 'fire');
    await settle(store, 'beacon');
    store.answer('visuals', 'new');
    expect(options(store, 'beacon').map(item => item.id)).toEqual(['standard', 'tall', 'square']);
    store.answer('visuals', 'tall');
    const question = active(store, 'beacon');
    expect(question?.step.ask?.(question.before)).toContain('How bright should the core burn?');
    expect(options(store, 'beacon').find(item => item.tag === 'assumed')?.id).toBe('Bold flare');
    store.answer('visuals', 'Wild blaze');
    expect(session(store, 'beacon')?.work).toMatchObject({ step: 'make', status: 'running' });
    await settle(store, 'beacon');
    const first = draft(store, 'beacon');
    expect(active(store, 'beacon')?.step.id).toBe('look');
    const look = active(store, 'beacon');
    if (look?.step.kind !== 'preview') throw new Error('not the preview');
    const lines = look.step.lines?.(look.before) ?? [];
    expect(lines.find(line => line.label === 'Source')?.value).toMatch(/^SIMULATED/);
    expect(lines.find(line => line.label === 'Size')?.value).toBe('1152 × 1536');
    expect(look.step.actions?.(look.before).map(action => action.label)).toEqual(['Try again', 'Adjust']);
    store.reopen('visuals', 'make');
    await settle(store, 'beacon');
    expect(draft(store, 'beacon').made).not.toBe(first.made);
    // Back from the preview skips the finished work and reopens the question.
    store.back('visuals');
    expect(active(store, 'beacon')?.step.id).toBe('question');
  });

  test('a flow object is shared per snapshot and kind', () => {
    expect(customFlow('frame', fixture, () => visualsCustomHost(fixture))).toBe(customFlow('frame', fixture, () => visualsCustomHost(fixture)));
    expect(customFlow('frame', fixture, () => visualsCustomHost(fixture))).not.toBe(customFlow('beacon', fixture, () => visualsCustomHost(fixture)));
  });
});

type Fake = ReturnType<typeof fakeBeacons>;
function fakeBeacons(openai = true) {
  return {
    loadArtStatus: vi.fn(async () => undefined),
    getSnapshot: vi.fn(() => ({ art_providers: [{ provider: 'openai', available: openai }], visuals: [{ visual_id: 'existing' }], phase: 'ready' })),
    load: vi.fn(async () => undefined),
    createDesign: vi.fn(async () => ({ design_id: 'custom-1' })),
    directArt: vi.fn(async () => { throw { code: 'unavailable' }; }),
    generateArt: vi.fn(async () => ({ design_id: 'custom-1', assets: [{ asset: 'generated/a.png', generated: true, provenance: 'openai_generated' }],
      costs: [{ call_id: 'simulated-call', model: 'gpt-image-2-5-sunburst', charge: { micro_usd: 42_000 } }] })),
    artLayers: vi.fn<() => Promise<unknown>>(async () => ({ design_id: 'custom-1', base: 'base.png', anchors: { core_rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 } },
      package: {}, costs: [] })),
    importLibrary: vi.fn(async (library_id: string) => ({ design_id: `imported-${library_id}` })),
    upsert: vi.fn(async () => undefined),
  };
}
const coreSnapshot: Snapshot = { mode: 'core', phase: 'ready' };

describe('core mode (ports mocked until D2 registers the methods)', () => {
  test('generate: scripted fallback, OpenAI transparent, a layers failure is retried without paying again, then the visual is upserted', async () => {
    const beacons: Fake = fakeBeacons();
    core.beacons = beacons;
    beacons.artLayers.mockRejectedValueOnce({ code: 'unavailable' });
    const store = createDockStore();
    store.open(make('beacon', { ...coreSnapshot }));
    store.answer('visuals', 'something for my valorant stream');
    await settle(store, 'beacon');
    expect(options(store, 'beacon').at(-1)).toMatchObject({ id: 'new', label: 'Make a new one' });
    expect(options(store, 'beacon').at(-1)?.disabled).toBeUndefined();
    for (const value of ['new', 'standard', 'Subtle glow']) store.answer('visuals', value);
    await settle(store, 'beacon');
    expect(session(store, 'beacon')?.work?.error).toMatch(/made and kept.*nothing is spent twice/);
    store.retry('visuals');
    await settle(store, 'beacon');
    expect(beacons.createDesign).toHaveBeenCalledOnce();
    expect(beacons.generateArt).toHaveBeenCalledOnce();
    expect(beacons.artLayers).toHaveBeenCalledTimes(2);
    const params = beacons.generateArt.mock.calls[0] as unknown[] | undefined;
    expect(params?.[0]).toMatchObject({ design_id: 'custom-1', provider: 'openai', background: 'transparent', width: 768, height: 1024, quantity: 1 });
    const prompt = (params?.[0] as { prompt: string }).prompt;
    expect(prompt.length).toBeLessThanOrEqual(1400);
    expect(prompt).not.toMatch(/valorant/i);
    const look = active(store, 'beacon');
    if (look?.step.kind !== 'preview') throw new Error('not the preview');
    expect(look.step.lines?.(look.before).find(line => line.label === 'Source')?.value).toBe('Generated with your OpenAI key · $0.04 on your OpenAI key');
    store.answer('visuals', 'ok');
    await store.seal('visuals');
    expect(beacons.upsert).toHaveBeenCalledWith({ visual: expect.objectContaining({ design_id: 'custom-1', name: expect.any(String) }) });
    expect(store.getSnapshot().beats.at(-1)).toMatchObject({ sealed: true });
  });

  test('a refused generation says why in plain words and nothing is retried on its own', async () => {
    const beacons = fakeBeacons();
    beacons.generateArt.mockRejectedValueOnce({ code: 'unauthorized', message: 'sk-should-never-show' });
    core.beacons = beacons;
    const store = createDockStore();
    store.open(make('frame', { ...coreSnapshot }));
    store.answer('visuals', 'ice');
    await settle(store, 'frame');
    for (const value of ['new', 'wide', 'Slim edges']) store.answer('visuals', value);
    await settle(store, 'frame');
    const error = session(store, 'frame')?.work?.error;
    expect(error).toBe('Your OpenAI key was refused. Check it in Settings. Nothing was spent.');
    expect(error).not.toContain('sk-');
    expect(beacons.generateArt).toHaveBeenCalledOnce();
  });

  test('no OpenAI key: library only, with the Settings note', async () => {
    core.beacons = fakeBeacons(false);
    const store = createDockStore();
    store.open(make('draw_vessel', { ...coreSnapshot }));
    store.answer('lottery', 'loot chest');
    await settle(store, 'draw_vessel');
    const made = options(store, 'draw_vessel').at(-1);
    expect(made).toMatchObject({ id: 'new', disabled: true });
    expect(made?.consequence).toContain('Add your OpenAI key in Settings');
    store.answer('lottery', 'new');
    expect(active(store, 'draw_vessel')?.step.id).toBe('pick');
  });

  test('vote bar library pick: imported once, then set on the Gatehouse', async () => {
    const beacons = fakeBeacons();
    core.beacons = beacons;
    const gatehouse = { setVoteBarDesign: vi.fn(async () => undefined), getSnapshot: () => ({ phase: 'ready', notice: '' }) };
    core.gatehouse = gatehouse;
    const store = createDockStore();
    store.open(make('vote_bar', { ...coreSnapshot }));
    store.answer('moderator', 'runes');
    await settle(store, 'vote_bar');
    store.answer('moderator', 'votebar-11');
    store.answer('moderator', 'ok');
    await store.seal('moderator');
    expect(beacons.importLibrary).toHaveBeenCalledExactlyOnceWith('votebar-11', 'vote_bar');
    expect(gatehouse.setVoteBarDesign).toHaveBeenCalledExactlyOnceWith('imported-votebar-11');
    expect(beacons.generateArt).not.toHaveBeenCalled();
  });

  test('draw vessel: the selected draw saves its display with the imported art design', async () => {
    core.beacons = fakeBeacons();
    const display = { edit: vi.fn() };
    let draw = { draw_id: 'questions', name: 'Questions for the hall' };
    const lots = { getSnapshot: () => ({ draw }), appearance: () => display,
      saveDisplay: vi.fn(async () => { draw = { ...draw }; }) };
    core.lots = lots;
    const store = createDockStore();
    store.open(make('draw_vessel', { ...coreSnapshot }));
    store.answer('lottery', 'capsule machine');
    await settle(store, 'draw_vessel');
    store.answer('lottery', options(store, 'draw_vessel')[0]?.id ?? '');
    store.answer('lottery', 'ok');
    await store.seal('lottery');
    expect(display.edit).toHaveBeenCalledWith(expect.objectContaining({ art_design: expect.stringMatching(/^imported-vessel-/) }));
    expect(lots.saveDisplay).toHaveBeenCalledOnce();
    expect(store.getSnapshot().beats.at(-1)?.text).toContain('Questions for the hall now draws from');
  });
});
