import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ChamberLayout } from './layout.jsx';
import { ChamberSection } from './section.jsx';
import { Drawer } from './drawer.jsx';
import { KeyBadge } from './key-badge.jsx';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('layout renders the named 16:9 picture, caption, minis and exactly two section columns', () => {
  const html = renderToStaticMarkup(<ChamberLayout picture={<img src="sample.webp" alt="Stylised simulated gate" />}
    picture_label="Gatehouse stream picture" preview={<p>Nothing in Preview · SIMULATED</p>}
    program={<p>Sample Herald · SIMULATED</p>} columns={[
      <ChamberSection title="At the portcullis"><p>Sample queue · SIMULATED</p></ChamberSection>,
      <ChamberSection title="The Herald"><p>Sample chart · SIMULATED</p></ChamberSection>,
    ]} />);
  expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Gatehouse stream picture"');
  const caption_id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
  expect(html).toContain(`<figcaption class="cc-chamber-caption" id="${caption_id}">as it is on air · simulated</figcaption>`);
  expect(html.match(/class="cc-chamber-column"/g)).toHaveLength(2);
  for (const name of ['Room sections 1', 'Room sections 2']) expect(html).toContain(`aria-label="${name}"`);
  expect(html.match(/data-role="room-section"/g)).toHaveLength(2);
  expect(html).toContain('Preview · drafts only');
  expect(html).toContain('Program · simulated');
  expect(html).toContain('Sample queue · SIMULATED');
  expect(html).toContain('Sample chart · SIMULATED');
  expect(html).not.toContain('data-role="room-title"');
});

test('heading, caption and mini titles are slots without inventing room behaviour', () => {
  const html = renderToStaticMarkup(<ChamberLayout picture={<div>SIMULATED</div>} picture_label="Sample"
    heading={<h2>The Gatehouse</h2>} caption={<strong>Draft · not on air</strong>}
    preview_title="Proposal · awaiting your seal" program_title="Sample program"
    preview="Draft sample" program="Program sample" columns={[null, null]} />);
  expect(html).toContain('data-role="room-title"');
  expect(html).toContain('<h2>The Gatehouse</h2>');
  expect(html).toContain('<strong>Draft · not on air</strong>');
  expect(html).toContain('Proposal · awaiting your seal');
  expect(html).toContain('Sample program');
});

test('glass section has a unique labelled heading row and a right-hand slot', () => {
  const html = renderToStaticMarkup(<><ChamberSection title="Queue" aside={<button>Details</button>}>SIMULATED</ChamberSection>
    <ChamberSection title="Queue">SIMULATED</ChamberSection></>);
  const labels = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(labels).size).toBe(2);
  for (const id of labels) expect(html).toContain(`<h3 id="${id}">Queue</h3>`);
  expect(html).toContain('<button>Details</button></header>SIMULATED');
});

test('KeyBadge exposes its letter as keycap text in the control accessible name', () => {
  const html = renderToStaticMarkup(<button>Propose pass <KeyBadge letter="Q" /></button>);
  expect(html).toContain('<kbd class="cc-kbd cc-key-badge">Q</kbd>');
  expect(html).not.toContain('aria-hidden');
  expect(html).not.toContain('tabindex');
});

test('closed drawer is absent; open drawer has a labelled heading, close control and content', () => {
  const props = { title: 'Full Herald', description: 'Sample · SIMULATED', onClose: vi.fn(), children: <p>Sample chart</p> };
  expect(renderToStaticMarkup(<Drawer {...props} open={false} />)).toBe('');
  const html = renderToStaticMarkup(<Drawer {...props} open />);
  expect(html).toContain('role="dialog"');
  const title_id = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
  const description_id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
  expect(html).toContain(`<h2 id="${title_id}">Full Herald</h2>`);
  expect(html).toContain(`<p id="${description_id}">Sample · SIMULATED</p>`);
  expect(html).toContain('aria-label="Close Full Herald"');
  expect(html).toContain('<p>Sample chart</p>');
  expect(html).not.toContain('aria-modal');
  expect(props.onClose).not.toHaveBeenCalled();
});

test('drawer enters focus on open, requests controlled close and restores focus on close or unmount', () => {
  class FocusTarget { isConnected = true; focus = vi.fn(); }
  const opener = new FocusTarget();
  const close = new FocusTarget();
  vi.stubGlobal('HTMLElement', FocusTarget);
  vi.stubGlobal('document', { activeElement: opener });
  vi.spyOn(React, 'useId').mockReturnValue('drawer');
  vi.spyOn(React, 'useRef').mockReturnValue({ current: close });
  const effects: React.EffectCallback[] = [];
  const effect = vi.spyOn(React, 'useEffect').mockImplementation(callback => { effects.push(callback); });
  const onClose = vi.fn();
  const props = { title: 'Details', children: 'SIMULATED', onClose };
  expect(Drawer({ ...props, open: false })).toBeNull();
  expect(effects.shift()?.()).toBeUndefined();
  const tree = Drawer({ ...props, open: true });
  expect(effect).toHaveBeenLastCalledWith(expect.any(Function), [true]);
  const cleanup = effects.shift()?.();
  expect(close.focus).toHaveBeenCalledOnce();
  tree?.props.children[0].props.children[1].props.onClick();
  expect(onClose).toHaveBeenCalledOnce();
  expect(opener.focus).not.toHaveBeenCalled();
  if (typeof cleanup !== 'function') throw new Error('Open drawer must return focus cleanup');
  cleanup();
  expect(opener.focus).toHaveBeenCalledOnce();
  const reopened = Drawer({ ...props, open: true });
  expect(reopened).not.toBeNull();
  const unmount = effects.shift()?.();
  opener.isConnected = false;
  if (typeof unmount !== 'function') throw new Error('Reopened drawer must return cleanup');
  unmount();
  expect(opener.focus).toHaveBeenCalledOnce();
});
