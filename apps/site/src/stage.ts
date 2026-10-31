import { keepArt, keepRooms } from '@castle-control/keep-art';
import { mountArt } from '@castle-control/keep-art/dom';
import { chamber, releases, words } from './copy.ts';
import { button, element } from './dom.ts';
import { buildBroadside } from './broadside.ts';
import { mountInkFilter } from './ink-filter.ts';
import { makeStamp } from './stamp.ts';
import { artRoom, encode, roomIds } from './route.ts';
import type { SiteRoom } from './route.ts';

export function buildStage(document: Document) {
  const stage = element(document, 'main', { id: 'stage', role: 'stage' });
  const skiplink = element(document, 'a', { cls: 'skiplink', text: 'Skip to the chambers' });
  skiplink.href = '#rooms';
  const skip = element(document, 'button', { id: 'skip', role: 'skip', text: 'Skip intro' });
  skip.type = 'button';
  skip.hidden = true;
  // Skip follows the skiplink and precedes every header link in document order.
  stage.append(skiplink, skip);
  mountInkFilter(document, stage);
  const topbar = element(document, 'header', { cls: 'topbar', role: 'topbar' });
  const mark = element(document, 'a', { cls: 'mark', role: 'mark' });
  mark.href = '#';
  mark.setAttribute('aria-label', 'Castle Control, the whole keep');
  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  symbol.setAttribute('viewBox', '0 0 30 26');
  symbol.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 26V6h4v4h4V6h4v4h2V6h4v4h4V6h4v20H18v-7a3 3 0 0 0-6 0v7Z');
  symbol.append(path);
  mark.append(symbol, element(document, 'span', { text: words.name }));
  const crumbs = element(document, 'nav', { id: 'crumbs', cls: 'crumbs', role: 'crumbs' });
  crumbs.setAttribute('aria-label', 'Where you are');
  const home = button(document, 'The keep', () => mark.click());
  const sep = element(document, 'span', { cls: 'sep', text: '›' });
  const room = element(document, 'button');
  room.type = 'button';
  const detailSep = element(document, 'span', { cls: 'sep', text: '›' });
  const detail = element(document, 'span', { cls: 'here', text: 'Features' });
  const hint = element(document, 'span', { text: 'four chambers below' });
  crumbs.append(home, sep, room, detailSep, detail, hint);
  const keys = element(document, 'div', { cls: 'keys', role: 'keys' });
  keys.setAttribute('aria-label', 'Keyboard: 1 to 4 chambers, 0 the keep, Escape back; arrows move between chambers');
  keys.append(element(document, 'kbd', { text: '1' }), element(document, 'span', { text: '–' }),
    element(document, 'kbd', { text: '4' }), element(document, 'span', { text: 'chambers' }));
  for (const [key, label] of [['0', 'the keep'], ['Esc', 'back']] as const) {
    keys.append(element(document, 'kbd', { text: key }), element(document, 'span', { text: label }));
  }
  const study = element(document, 'a', { cls: 'study-link', text: 'Study' });
  study.href = encode({ room: 'steward', features: false });
  study.setAttribute('aria-label', 'The Steward’s study');
  const theme = element(document, 'button', { id: 'theme', text: 'Dark stock' });
  theme.type = 'button';
  theme.setAttribute('aria-pressed', 'false');
  theme.setAttribute('aria-label', 'Use dark stock theme');
  const cta = element(document, 'a', { cls: 'cta', role: 'cta', text: 'Get the app →' });
  cta.href = releases;
  topbar.append(mark, crumbs, study, keys, theme, cta);
  const headline = element(document, 'div', { id: 'headline' });
  headline.setAttribute('aria-live', 'polite');
  const eyebrow = element(document, 'span', { cls: 'eyebrow', role: 'headline-eyebrow', text: words.eyebrow });
  const name = element(document, 'h1', { cls: 'display ghost', role: 'headline-name', text: words.name });
  const sub = element(document, 'span', { cls: 'sub serif', role: 'headline-sub', text: words.sub });
  headline.append(eyebrow, name, sub);
  const world = element(document, 'div', { id: 'world' });
  const castle = element(document, 'div', { id: 'castle', cls: 'castle' });
  mountArt(castle, keepArt());
  const rooms = element(document, 'div', { id: 'rooms' });
  rooms.setAttribute('role', 'group');
  rooms.setAttribute('aria-label', 'Chambers of the keep');
  const hits = new Map<SiteRoom, HTMLButtonElement>();
  for (const id of roomIds) {
    const geometry = keepRooms[artRoom[id]];
    const copy = chamber(id);
    const hit = element(document, 'button', { cls: 'hit' });
    hit.type = 'button';
    hit.dataset['room'] = id;
    hit.setAttribute('aria-label', copy
      ? `Chamber ${copy.n}: ${copy.name}, ${copy.fn}. ${copy.line}`
      : 'The Steward’s study: before you open the gates, the six principles');
    Object.assign(hit.style, { left: `${geometry.hit.x}px`, top: `${geometry.hit.y}px`,
      width: `${geometry.hit.w}px`, height: `${geometry.hit.h}px` });
    rooms.append(hit);
    hits.set(id, hit);
    if (copy) {
      const tag = element(document, 'span', { cls: 'tag', role: 'room-tag', text: String(copy.n) });
      tag.style.background = `var(--${copy.ink === 'key' ? 'ink' : copy.ink})`;
      tag.style.left = `${geometry.rect.x + 10}px`;
      tag.style.top = `${geometry.rect.y - 16}px`;
      tag.setAttribute('aria-hidden', 'true');
      rooms.append(tag);
    }
  }
  castle.append(rooms);
  world.append(castle);
  const vlabel = element(document, 'div', { id: 'vlabel', cls: 'vlabel', role: 'vlabel', text: words.vlabel });
  const broadside = element(document, 'section', { id: 'broadside' });
  broadside.tabIndex = -1;
  broadside.setAttribute('aria-label', 'Chamber details');
  broadside.setAttribute('aria-live', 'polite');
  const sheet = buildBroadside(broadside);
  const toy = element(document, 'section', { id: 'toy' });
  toy.setAttribute('aria-label', 'Sample toy');
  const toyStack = element(document, 'div', { cls: 'toy-stack' });
  toyStack.append(vlabel, toy);
  const footer = element(document, 'footer', { id: 'footer', role: 'footer' });
  const stamp = makeStamp(document, 'sample', words.sample);
  const footerCta = element(document, 'a', { cls: 'cta ghostbtn', text: words.footer_cta });
  footerCta.href = releases;
  footer.append(stamp, element(document, 'span', { text: words.footer }),
    element(document, 'span', { cls: 'mid serif', text: words.footer_aside }), footerCta);
  stage.append(topbar, headline, world, toyStack, broadside, footer);
  document.body.append(stage);
  return { stage, skiplink, skip, mark, crumbs: { home, room, sep, detailSep, detail, hint },
    headline: { eyebrow, name, sub }, castle, rooms, hits, broadside, sheet, toy, footer, theme, study };
}

export type Stage = ReturnType<typeof buildStage>;
