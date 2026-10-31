import { frameTransform, keepRooms, siteOverviewFrame, siteOverviewTarget, siteRoomTarget } from '@castle-control/keep-art';
import { chamber, headline, words } from './copy.ts';
import { level } from './machine.ts';
import type { State } from './machine.ts';
import { artRoom, chamberIds } from './route.ts';
import type { SiteRoom } from './route.ts';
import type { Stage } from './stage.ts';
import { buildToyDock } from './toy-dock.ts';
import { buildStacked } from './stacked.ts';
import type { Stacked } from './stacked.ts';

const ink = { key: 'var(--ink)', gules: 'var(--gules)', azure: 'var(--azure)', or: 'var(--or)' } as const;
const textInk = { key: 'var(--ink)', gules: 'var(--gules-text)', azure: 'var(--azure-text)', or: 'var(--or-text)' } as const;

export function createView(nodes: Stage, reduced: () => boolean, seed?: string) {
  const dock = buildToyDock(nodes.toy, nodes.castle, reduced, seed);
  let stacked: Stacked | undefined;
  let isStacked = false;
  let previous: State = { phase: 'overview', room: null };
  let overviewRoom: SiteRoom | null = null;
  let focused: SiteRoom | null = null;
  let quietFocus = false;
  let origin: SiteRoom | null = null;
  let attention: SiteRoom | null | undefined;
  const overlays = nodes.castle.querySelectorAll<SVGElement>('.dim,.litglow');
  const inkFilter = nodes.stage.querySelector<SVGElement>('.cc-inkedge-filter')!;

  function light(room: SiteRoom | null): void {
    nodes.castle.classList.toggle('focus', room !== null);
    for (const overlay of overlays) overlay.classList.toggle('on', room !== null && overlay.dataset['room'] === artRoom[room]);
  }

  function showHeadline(room: SiteRoom | null): void {
    if (attention === room) return;
    attention = room;
    const copy = headline(room);
    nodes.headline.eyebrow.textContent = copy.eyebrow;
    nodes.headline.name.textContent = copy.name;
    nodes.headline.sub.textContent = copy.sub;
    nodes.headline.name.style.color = textInk[copy.ink];
    nodes.headline.name.style.setProperty('--ghost', room === null || copy.ink === 'key' ? ink.gules : ink.key);
    // Two alternating animation names restart registration without forcing a layout read.
    if (!reduced()) nodes.headline.name.classList.toggle('slip-again');
    nodes.headline.name.classList.toggle('slip', !reduced());
  }

  function attend(): void {
    if (isStacked) return;
    if (level(previous) > 0) return;
    light(overviewRoom);
    showHeadline(overviewRoom);
  }

  // Attention follows the last interaction, never a fallback to a still-focused hit.
  function hover(room: SiteRoom | null): void { overviewRoom = room; attend(); }
  function focus(room: SiteRoom | null): void {
    focused = room;
    if (quietFocus) return;
    overviewRoom = room;
    attend();
  }
  function reviewHover(room: SiteRoom | null): void { overviewRoom = room; attend(); }

  function focusFirst(): void {
    if (isStacked) { stacked!.navigate({ phase: 'room', room: 'lots' }); return; }
    // Skip hands off keyboard focus without changing the printed attention.
    quietFocus = true;
    try { nodes.hits.get('lots')?.focus({ preventScroll: true }); }
    finally { quietFocus = false; }
  }

  function update(state: State): void {
    const depth = level(state);
    const was = level(previous);
    const moved = state.room !== previous.room || depth !== was;
    if (isStacked) {
      dock.update(state);
      if (moved) stacked!.navigate(state);
      previous = state;
      return;
    }
    if (was === 0 && depth > 0) origin = state.room;
    nodes.stage.classList.toggle('intro', state.phase === 'intro');
    nodes.stage.classList.toggle('room-mode', depth > 0);
    nodes.stage.dataset['phase'] = state.phase;
    nodes.stage.dataset['level'] = String(depth);
    const copy = chamber(state.room);
    nodes.crumbs.home.disabled = depth === 0;
    nodes.crumbs.home.classList.toggle('here', depth === 0);
    nodes.crumbs.room.hidden = depth === 0;
    nodes.crumbs.room.disabled = depth === 1;
    nodes.crumbs.room.classList.toggle('here', depth === 1);
    nodes.crumbs.room.textContent = copy?.name ?? words.steward_name;
    nodes.crumbs.detailSep.hidden = depth !== 2;
    nodes.crumbs.detail.hidden = depth !== 2;
    nodes.crumbs.hint.hidden = depth > 0;
    for (const [room, hit] of nodes.hits) {
      hit.disabled = depth > 0;
      hit.tabIndex = depth > 0 ? -1 : 0;
      if (room === state.room) hit.setAttribute('aria-current', 'page');
      else hit.removeAttribute('aria-current');
    }
    const rect = state.room === null ? siteOverviewFrame : keepRooms[artRoom[state.room]].frame;
    const target = state.room === null ? siteOverviewTarget : siteRoomTarget;
    const camera = frameTransform(rect, target, 'contain');
    nodes.castle.style.transform = `translate(${camera.ox}px,${camera.oy}px) scale(${camera.s})`;
    const colour = state.room === 'steward' ? 'or' : copy?.ink ?? 'key';
    nodes.broadside.style.setProperty('--bc', ink[colour]);
    nodes.broadside.style.setProperty('--bt', textInk[colour]);
    nodes.broadside.hidden = depth === 0;
    nodes.sheet.update(state, reduced());
    dock.update(state);
    previous = state;
    if (state.room !== null) {
      overviewRoom = null; focused = null;
      light(state.room);
      if (moved) nodes.broadside.focus({ preventScroll: true });
    } else {
      attend();
      if (was > 0 && origin !== null) nodes.hits.get(origin)?.focus({ preventScroll: true });
    }
  }

  function moveFocus(direction: -1 | 1): void {
    const current = focused ?? overviewRoom;
    const index = chamberIds.findIndex((room) => room === current);
    const next = chamberIds[index < 0 ? 0 : (index + direction + chamberIds.length) % chamberIds.length];
    if (next) nodes.hits.get(next)?.focus({ preventScroll: true });
  }

  function setStacked(on: boolean): void {
    if (on === isStacked) return;
    isStacked = on;
    nodes.stage.ownerDocument.documentElement.classList.toggle('stacked', on);
    nodes.stage.hidden = on;
    if (on) {
      stacked ??= buildStacked(nodes, reduced);
      nodes.stage.ownerDocument.body.append(stacked.page);
      // SVG resources must stay outside the display:none desktop stage.
      stacked.page.append(inkFilter);
      stacked.syncTheme();
      dock.present(stacked.scenes, stacked.hosts);
      dock.update(previous);
      stacked.navigate(previous);
    } else {
      dock.present(); nodes.stage.insertBefore(inkFilter, nodes.mark.parentElement); stacked!.page.remove();
      update(previous);
      if (previous.room !== null) nodes.broadside.focus({ preventScroll: true });
    }
  }

  return { update, setStacked, hover, focus, focusFirst, reviewHover, moveFocus, liveHex: dock.liveHex,
    claimHex: (): void => dock.claimHex(nodes.stage.ownerDocument.activeElement) };
}
