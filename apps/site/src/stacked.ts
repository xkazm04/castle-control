import { keepArt, keepRooms } from '@castle-control/keep-art';
import type { ArtNode, Rect } from '@castle-control/keep-art';
import { mountArt } from '@castle-control/keep-art/dom';
import { CHAMBERS, principles, releases, stewardCopy, words } from './copy.ts';
import { element } from './dom.ts';
import type { State } from './machine.ts';
import { artRoom } from './route.ts';
import type { ChamberId, SiteRoom } from './route.ts';
import { makeStamp } from './stamp.ts';
import type { Stage } from './stage.ts';

// Repeated scenes use the same drawing data, with local SVG paint/filter references.
// This prevents one scene's clip paths or animated hooks from targeting another.
function sceneTree(tree: ArtNode, prefix: string): ArtNode {
  const reference = (value: string): string => value.replace(/url\(#([^)]*)\)/g, `url(#${prefix}$1)`);
  const attrs = Object.fromEntries(Object.entries(tree.attrs).map(([key, value]) => [key,
    key === 'id' ? `${prefix}${value}` : reference(value),
  ]));
  return { ...tree, attrs, ...(tree.id ? { id: `${prefix}${tree.id}` } : {}),
    ...(tree.paint ? { paint: Object.fromEntries(Object.entries(tree.paint).map(([key, value]) => [key, reference(value)])) } : {}),
    ...(tree.children ? { children: tree.children.map((child) => sceneTree(child, prefix)) } : {}) };
}

export function buildStacked(nodes: Stage, reduced: () => boolean) {
  const document = nodes.stage.ownerDocument;
  const page = element(document, 'div', { cls: 'stacked-page', role: 'stacked' });
  const skip = element(document, 'a', { cls: 'skiplink', text: 'Skip to the chambers' });
  skip.href = '#lots';
  const header = element(document, 'header', { cls: 'stacked-topbar' });
  const mark = element(document, 'a', { cls: 'stacked-mark', text: words.name }); mark.href = '#';
  const theme = element(document, 'button', { cls: 'stacked-theme' }); theme.type = 'button';
  function syncTheme(): void {
    theme.textContent = nodes.theme.textContent;
    for (const attr of ['aria-label', 'aria-pressed']) theme.setAttribute(attr, nodes.theme.getAttribute(attr)!);
  }
  theme.addEventListener('click', () => { nodes.theme.click(); syncTheme(); });
  const cta = element(document, 'a', { cls: 'cta', text: 'Get the app' }); cta.href = releases;
  const content = element(document, 'main');
  header.append(mark, theme, cta); page.append(skip, header, content);
  const intro = element(document, 'section', { cls: 'stacked-overview' });
  intro.setAttribute('aria-labelledby', 'stacked-title');
  intro.append(element(document, 'p', { cls: 'eyebrow', text: words.eyebrow }),
    element(document, 'h1', { id: 'stacked-title', cls: 'display ghost', text: words.name }),
    element(document, 'p', { cls: 'serif', text: words.sub }));
  // Keep the full overview; room scenes change only the public drawing's viewBox.
  function art(parent: HTMLElement, id: string, rect?: Rect): HTMLElement {
    const drawing = element(document, 'div', { cls: 'stacked-art' });
    drawing.setAttribute('aria-hidden', 'true');
    mountArt(drawing, sceneTree(keepArt(), `stacked-${id}-`));
    if (rect) {
      const svg = drawing.querySelector('svg')!;
      svg.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
      svg.setAttribute('width', String(rect.w)); svg.setAttribute('height', String(rect.h));
    }
    parent.append(drawing); return drawing;
  }
  art(intro, 'overview');
  intro.append(element(document, 'p', { cls: 'stacked-caption', text: words.vlabel }));
  const nav = element(document, 'nav'); nav.setAttribute('aria-label', 'Chambers');
  for (const copy of CHAMBERS) {
    const link = element(document, 'a', { text: copy.name }); link.href = `#${copy.id}`; nav.append(link);
  }
  const studyLink = element(document, 'a', { text: 'The Steward’s study' }); studyLink.href = '#steward'; nav.append(studyLink);
  intro.append(nav); content.append(intro);
  const sections = new Map<SiteRoom, HTMLElement>();
  const scenes = new Map<ChamberId, HTMLElement>();
  const hosts = new Map<ChamberId, HTMLElement>();
  const details = new Map<ChamberId, HTMLDetailsElement>();
  for (const copy of CHAMBERS) {
    const section = element(document, 'section', { id: copy.id, cls: 'stacked-room', role: 'room-section' });
    section.dataset['room'] = copy.id; section.tabIndex = -1;
    section.setAttribute('aria-labelledby', `${copy.id}-title`);
    section.style.setProperty('--room-ink', `var(--${copy.ink === 'key' ? 'ink' : `${copy.ink}-text`})`);
    section.append(element(document, 'p', { cls: 'eyebrow', text: `Chamber ${copy.n} of 4` }),
      element(document, 'h2', { id: `${copy.id}-title`, cls: 'display', text: copy.name }),
      element(document, 'p', { cls: 'stacked-function serif', text: copy.fn }),
      element(document, 'p', { text: copy.line }));
    const drawing = art(section, copy.id, keepRooms[artRoom[copy.id]].frame);
    scenes.set(copy.id, drawing);
    section.append(element(document, 'p', { cls: 'stacked-caption', text: words.vlabel }));
    const notes = element(document, 'ol');
    for (const [lead, text] of copy.notes) {
      const row = element(document, 'li');
      row.append(element(document, 'b', { text: `${lead}. ` }), element(document, 'span', { text })); notes.append(row);
    }
    const inside = element(document, 'details'); inside.id = `${copy.id}-features`;
    inside.append(element(document, 'summary', { text: `Inside the ${copy.name}` }),
      element(document, 'p', { text: copy.inside }), element(document, 'p', { cls: 'serif', text: words.fine }));
    const host = element(document, 'section', { cls: 'stacked-toy' });
    host.setAttribute('aria-label', `${copy.name}: sample toy`);
    section.append(notes, inside, host); content.append(section);
    sections.set(copy.id, section); hosts.set(copy.id, host); details.set(copy.id, inside);
  }
  const study = element(document, 'section', { id: 'steward', cls: 'stacked-study' }); study.tabIndex = -1;
  study.setAttribute('aria-labelledby', 'steward-title');
  study.append(element(document, 'p', { cls: 'eyebrow', text: 'The Steward’s study · principles' }),
    element(document, 'h2', { id: 'steward-title', cls: 'display', text: words.steward_title }),
    element(document, 'p', { text: words.steward_lead }));
  for (const [lead, text] of principles) {
    const row = element(document, 'div', { cls: 'stacked-principle', role: 'principle' });
    row.append(element(document, 'h3', { text: lead }), element(document, 'p', { text })); study.append(row);
  }
  const notices = element(document, 'div', { cls: 'steward-notices' });
  for (const notice of stewardCopy.notices) {
    const paragraph = element(document, 'p');
    if ('href' in notice) {
      const link = element(document, 'a', { text: notice.text }); link.href = notice.href; paragraph.append(link);
    } else paragraph.textContent = notice.text;
    notices.append(paragraph);
  }
  const links = element(document, 'nav'); links.setAttribute('aria-label', 'Project links');
  for (const item of stewardCopy.links) {
    const link = element(document, 'a', { text: item.text }); link.href = item.href; links.append(link);
  }
  notices.append(links); study.append(notices); sections.set('steward', study);
  const footer = element(document, 'footer', { cls: 'stacked-footer' });
  footer.append(makeStamp(document, 'sample', words.sample), element(document, 'p', { text: words.footer }),
    element(document, 'p', { cls: 'serif', text: words.footer_aside }));
  content.append(study); page.append(footer);

  function navigate(state: State): void {
    if (state.phase === 'features' && state.room !== null && state.room !== 'steward') details.get(state.room)!.open = true;
    const target = state.room === null ? page : sections.get(state.room)!;
    target.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'start' });
    if (state.room !== null) target.focus({ preventScroll: true });
  }
  return { page, scenes, hosts, sections, details, navigate, syncTheme };
}

export type Stacked = ReturnType<typeof buildStacked>;
