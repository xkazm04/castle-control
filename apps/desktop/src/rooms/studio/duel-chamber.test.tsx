import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ChamberLayout } from '@castle-control/ui/chamber';
import type { ChamberLayoutProps } from '@castle-control/ui/chamber';
import { DuelStage } from './duel-stage.jsx';
import { DuelDrawer } from './duel-drawer.jsx';
import { DuelSourceAction } from './tiltyard-source.jsx';
import { MoreMenu } from './room.jsx';
import { draftPicture } from './duel-model.js';

vi.mock('react', async original => ({ ...await original<typeof React>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const picture = draftPicture({ title: 'SIMULATED bracket', preset: 'mill', window_s: 15,
  entries: ['Raze the mill', 'Tax the miller', 'Spare it', 'Borrow the mill'].map(title => ({ title })) });
type NodeProps = { children?: ReactNode; onClick?: () => void; 'aria-haspopup'?: string };
function elements(tree: ReactNode): ReactElement<NodeProps>[] {
  const result: ReactElement<NodeProps>[] = [];
  React.Children.forEach(tree, child => {
    if (!React.isValidElement<NodeProps>(child)) return;
    result.push(child, ...elements(child.props.children));
  });
  return result;
}

test('Map Room composes ChamberLayout with its picture, minis, two section columns and working drawer triggers', () => {
  const setOpen = vi.fn();
  vi.spyOn(React, 'useState').mockReturnValue([false, setOpen]);
  vi.spyOn(React, 'useRef').mockReturnValue({ current: null });
  vi.spyOn(React, 'useEffect').mockImplementation(() => undefined);
  const tree = DuelStage({ picture });
  const layout = React.Children.toArray(tree.props.children).find(child => React.isValidElement(child) && child.type === ChamberLayout);
  if (!React.isValidElement<ChamberLayoutProps>(layout)) throw new Error('Missing ChamberLayout');
  expect(layout.props.columns).toHaveLength(2);
  const html = renderToStaticMarkup(layout);
  expect(html.match(/data-role="room-picture"/g)).toHaveLength(1);
  expect(html.match(/class="cc-chamber-column"/g)).toHaveLength(2);
  expect(html.match(/data-role="room-section"/g)).toHaveLength(3);
  expect(html).toContain('Room sections 1'); expect(html).toContain('Room sections 2');
  expect(html).toContain('Preview · drafts only'); expect(html).toContain('Program · SIMULATED');
  expect(html).toContain('The duel'); expect(html).toContain('The bracket'); expect(html).toContain('Call the duel');
  expect(html).not.toContain('data-role="ty-match"');
  const triggers = elements(layout.props.columns[1]).filter(child => child.type === 'button' && child.props['aria-haspopup'] === 'dialog');
  expect(triggers).toHaveLength(2);
  for (const trigger of triggers) trigger.props.onClick?.();
  expect(setOpen).toHaveBeenCalledTimes(2); expect(setOpen).toHaveBeenCalledWith(true);
});

test('the drawer exposes the full seeded bracket, every former More view, core source tools and proposals', () => {
  const props = { picture, on_close: vi.fn(),
    tools: <><DuelSourceAction mode="core" busy={false} on_copy={vi.fn()} /><MoreMenu view="duel" on_view={vi.fn()} expanded /></>,
    details: { open: false, on_close: vi.fn(), content: <p>SIMULATED proposal form</p> } };
  const closed = renderToStaticMarkup(<DuelDrawer {...props} open={false} />);
  expect(closed).not.toContain('role="dialog"');
  expect(closed).toContain('<div hidden=""><p>SIMULATED proposal form</p></div>');
  const html = renderToStaticMarkup(<DuelDrawer {...props} open />);
  expect(html.match(/role="dialog"/g)).toHaveLength(1);
  expect(html.match(/data-role="ty-match"/g)).toHaveLength(3);
  expect(html).toContain('aria-current="step"');
  expect(html).toContain('class="duel-sheet__seed">1');
  expect(html).toContain('class="duel-sheet__seed">4');
  expect(html).toContain('Duel on stream · Copy browser source URL');
  expect(html.match(/role="menuitem"/g)).toHaveLength(6);
  for (const name of ['Showdown', 'Ladder', 'Sand table', 'Spyglass', 'Rehearse', 'Design proposals']) expect(html).toContain(name);
  expect(html).toContain('SIMULATED proposal form');
  expect(html).toContain('Close Full bracket');
});

test('Preview shows a draft while Program retains the existing tournament', () => {
  const html = renderToStaticMarkup(<DuelStage picture={picture} program={{ ...picture, source: 'fixture', title: 'Existing SIMULATED tournament', phase: 'live', counts: [3, 2] }} />);
  const preview = html.indexOf('Preview · drafts only');
  const program = html.indexOf('Program · SIMULATED');
  expect(html.slice(preview, program)).toContain('SIMULATED bracket');
  expect(html.slice(preview, program)).not.toContain('Existing SIMULATED tournament');
  expect(html.slice(program)).toContain('Existing SIMULATED tournament');
  expect(html.slice(program)).toContain('5 counted');
});

test('Escape closes the drawer before the duel keymap; frozen and drafted controls do not send events', () => {
  const setOpen = vi.fn();
  vi.spyOn(React, 'useState').mockReturnValue([true, setOpen]);
  vi.spyOn(React, 'useRef').mockReturnValue({ current: null });
  vi.spyOn(React, 'useEffect').mockImplementation(() => undefined);
  const send = vi.fn();
  const close = vi.fn();
  const tree = DuelStage({ picture: { ...picture, source: 'fixture', phase: 'live' }, on_event: send,
    details: { open: false, content: null, on_close: close } });
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  tree.props.onKeyDown({ key: 'Escape', preventDefault, stopPropagation });
  expect(setOpen).toHaveBeenCalledWith(false); expect(close).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce(); expect(stopPropagation).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  vi.spyOn(React, 'useState').mockReturnValue([false, setOpen]);
  for (const props of [{ picture, on_event: send }, { picture: { ...picture, source: 'fixture' as const }, frozen: true, on_event: send }]) {
    const frozen = DuelStage(props);
    frozen.props.onKeyDown({ key: 'Enter' });
    const layout = React.Children.toArray(frozen.props.children).find(child => React.isValidElement(child) && child.type === ChamberLayout);
    if (!React.isValidElement<ChamberLayoutProps>(layout)) throw new Error('Missing ChamberLayout');
    const actions = elements(layout.props.columns[0]).filter(child => child.type === 'button');
    for (const action of actions) action.props.onClick?.();
  }
  expect(send).not.toHaveBeenCalled();
});
