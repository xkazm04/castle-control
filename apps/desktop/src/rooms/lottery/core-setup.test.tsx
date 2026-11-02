import { Children, isValidElement, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { LotsDraw } from '@castle-control/contract';
import { fixtureDraws } from '../../lots-fixture.js';
import { lotsCopy as copy } from '../../lots-copy.js';
import { createCoreLotsPort } from '../../lots-core.js';
import { CoreDrawSetup, coreSetupCandidate, editStands } from './core-setup.jsx';
import { renderLotDrawer } from './drawer-test.jsx';
import { ConnectedLotsRoom } from './core.jsx';

type Props = { children?: ReactNode; tools?: ReactNode; id?: string; value?: string | number; disabled?: boolean; onClick?: () => void; on_save?: (draw: LotsDraw) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => void };
function elements(tree: ReactNode): Props[] {
  const found: Props[] = [];
  Children.forEach(tree, child => { if (isValidElement<Props>(child)) found.push(child.props, ...elements(child.props.children), ...elements(child.props.tools)); });
  return found;
}
const draw = fixtureDraws[0] as LotsDraw;
const byId = (tree: ReactNode, suffix: string) => {
  const control = elements(tree).find(props => props.id?.endsWith(`-${suffix}`));
  if (!control) throw new Error(`Missing ${suffix}`);
  return control;
};
const button = (tree: ReactNode, label: string) => {
  const control = elements(tree).find(props => props.children === label && props.onClick);
  if (!control) throw new Error(`Missing ${label}`);
  return control;
};
const change = (tree: ReactNode, suffix: string, value: string, checked = false) => byId(tree, suffix).onChange?.(
  { currentTarget: { value, valueAsNumber: Number(value), checked } } as ChangeEvent<HTMLInputElement & HTMLSelectElement>);

test('a clean draft cannot be saved and says it matches the core', () => {
  const markup = renderToStaticMarkup(<CoreDrawSetup draw={draw} disabled={false} on_save={vi.fn()} />);
  expect(markup).toContain(copy.core_setup.title);
  expect(markup).toMatch(new RegExp(`disabled=""[^>]*>${copy.core_setup.save}<`));
  expect(markup).toContain(copy.core_setup.clean);
  expect(markup).not.toContain(copy.winners);
});

test('edits stay in the draft until one save sends the whole rule set', () => {
  const on_save = vi.fn();
  const seen: string[] = [];
  function Sequence() {
    const [step, setStep] = useState(0);
    const tree = CoreDrawSetup({ draw, disabled: false, on_save });
    const save = button(tree, copy.core_setup.save);
    if (step === 0) { change(tree, 'name', 'Raffle of the hall'); setStep(1); }
    else if (step === 1) { change(tree, 'pool', 'keyword'); setStep(2); }
    else if (step === 2) { change(tree, 'keyword', 'two words'); setStep(3); }
    else if (step === 3) { seen.push(`invalid:${String(save.disabled)}`); change(tree, 'keyword', '!raffle'); setStep(4); }
    else if (step === 4) { change(tree, 'cooldown', '30'); change(tree, 'cap', '0'); setStep(5); }
    else if (step === 5) { change(tree, 'weights', 'concave'); setStep(6); }
    else if (step === 6) { seen.push(`ready:${String(save.disabled)}`); expect(on_save).not.toHaveBeenCalled(); save.onClick?.(); setStep(7); }
    return tree;
  }
  renderToStaticMarkup(<Sequence />);
  expect(seen).toEqual(['invalid:true', 'ready:false']);
  expect(on_save).toHaveBeenCalledTimes(1);
  expect(on_save.mock.calls[0]?.[0]).toMatchObject({ draw_id: draw.draw_id, name: 'Raffle of the hall', rules: {
    pool: { kind: 'keyword', keyword: '!raffle' }, cooldown_s: 30, cohort_caps: [], weight_curve: { kind: 'concave', max_units: 4 },
    winner_count: draw.rules.winner_count } });
});

test('prize policy fields and regions travel with the save; invalid drafts never produce a candidate', () => {
  const prize = { ...draw, policy: { ...draw.policy, content: 'prize' as const } };
  const markup = renderToStaticMarkup(<CoreDrawSetup draw={prize} disabled={false} on_save={vi.fn()} />);
  for (const label of [copy.template, copy.disclaimer, copy.prize_value, copy.age, copy.regions]) expect(markup).toContain(label);
  expect(coreSetupCandidate({ value: prize, regions: ' CZ, , DE ' })?.policy.regions).toEqual(['CZ', 'DE']);
  expect(coreSetupCandidate({ value: { ...draw, name: '  ' }, regions: '' })).toBeUndefined();
  expect(coreSetupCandidate({ value: { ...draw, rules: { ...draw.rules, cooldown_s: Number.NaN } }, regions: '' })).toBeUndefined();
  expect(coreSetupCandidate({ value: { ...draw, rules: { ...draw.rules, cooldown_s: -1 } }, regions: '' })).toBeUndefined();
});

test('a busy or locked roll disables the whole card', () => {
  const markup = renderToStaticMarkup(<CoreDrawSetup draw={draw} disabled on_save={vi.fn()} />);
  expect(markup).toMatch(/<fieldset class="lottery-settings" disabled="">/);
  expect(markup).toMatch(new RegExp(`disabled=""[^>]*>${copy.core_setup.discard}<`));
});

test('the core room carries the rule draft, and one save is one upsert followed by the core check', async () => {
  const rpc = vi.fn(async (_endpoint: string, _session: string, method: string, params: unknown): Promise<unknown> => {
    if (method === 'lots.draw.list') return { draws: [draw] };
    if (method === 'lots.draw.upsert' && params && typeof params === 'object' && 'draw' in params) return params.draw;
    return { result: 'ok', reasons: [] };
  });
  const port = createCoreLotsPort({ mode: 'core', endpoint: 'http://127.0.0.1:3210/', session_token: 'a'.repeat(64) }, { rpc });
  await port.load();
  let setup: Props | undefined;
  function Probe() { const tree = ConnectedLotsRoom({ port }); setup = elements(tree).find(props => props.on_save); return tree; }
  expect(renderLotDrawer(port, <Probe />)).toContain(copy.core_setup.title);
  const before = rpc.mock.calls.length;
  setup?.on_save?.({ ...draw, rules: { ...draw.rules, cooldown_s: 45 } });
  await vi.waitFor(() => expect(port.getSnapshot().busy).toBe(false));
  expect(rpc.mock.calls.slice(before).map(call => call[2])).toEqual(['lots.draw.upsert', 'lots.draw.check']);
  expect(port.getSnapshot().draw?.rules.cooldown_s).toBe(45);
});

test('unsaved rule edits survive an update to the same draw from another control, and land in the save', () => {
  const on_save = vi.fn();
  let current = draw;
  const seen: string[] = [];
  function Sequence() {
    const [step, setStep] = useState(0);
    const tree = CoreDrawSetup({ draw: current, disabled: false, on_save });
    if (step === 0) { change(tree, 'name', 'Raffle of the hall'); change(tree, 'cooldown', '45'); setStep(1); }
    else if (step === 1) {
      // The winner-count field (or tier, or equalizer) saves first; the core returns a new draw object.
      current = { ...draw, rules: { ...draw.rules, winner_count: 9 } }; setStep(2);
    } else if (step === 2) {
      seen.push(String(byId(tree, 'name').value ?? ''));
      button(tree, copy.core_setup.save).onClick?.(); setStep(3);
    }
    return tree;
  }
  renderToStaticMarkup(<Sequence />);
  expect(seen).toEqual(['Raffle of the hall']);
  expect(on_save).toHaveBeenCalledTimes(1);
  expect(on_save.mock.calls[0]?.[0]).toMatchObject({ name: 'Raffle of the hall', rules: { cooldown_s: 45, winner_count: 9 } });
});

test('Save stays off for values the contract schema rejects, and regions formatting alone is not a change', () => {
  const prize = { ...draw, policy: { ...draw.policy, content: 'prize' as const, regions: ['US', 'CA'] } };
  expect(coreSetupCandidate({ value: { ...prize, policy: { ...prize.policy, minimum_age: 17.5 } }, regions: 'US, CA' })).toBeUndefined();
  expect(coreSetupCandidate({ value: { ...prize, policy: { ...prize.policy, minimum_age: 300 } }, regions: 'US, CA' })).toBeUndefined();
  expect(coreSetupCandidate({ value: { ...prize, rules: { ...prize.rules, cooldown_s: 2 ** 33 } }, regions: 'US, CA' })).toBeUndefined();
  expect(coreSetupCandidate({ value: { ...prize, policy: { ...prize.policy, minimum_age: 18 } }, regions: 'US,CA' })?.policy.regions)
    .toEqual(['US', 'CA']);
  const markup = renderToStaticMarkup(<CoreDrawSetup draw={prize} disabled={false} on_save={vi.fn()} />);
  expect(markup).toContain(copy.core_setup.clean);
});

test('when the core changes a field a pending edit also changed, the newer core value wins on Save', () => {
  const on_save = vi.fn();
  let current = draw;
  function Sequence() {
    const [step, setStep] = useState(0);
    const tree = CoreDrawSetup({ draw: current, disabled: false, on_save });
    if (step === 0) { change(tree, 'weights', 'concave'); change(tree, 'name', 'Raffle of the hall'); setStep(1); }
    else if (step === 1) {
      // The equalizer saves concave with a cap of 6 before the rule card is saved.
      current = { ...draw, rules: { ...draw.rules, weight_curve: { kind: 'concave', max_units: 6 } } }; setStep(2);
    } else if (step === 2) { button(tree, copy.core_setup.save).onClick?.(); setStep(3); }
    return tree;
  }
  renderToStaticMarkup(<Sequence />);
  expect(on_save).toHaveBeenCalledTimes(1);
  expect(on_save.mock.calls[0]?.[0]).toMatchObject({ name: 'Raffle of the hall', rules: { weight_curve: { kind: 'concave', max_units: 6 } } });
  const edit = { origin: draw, apply: (value: LotsDraw) => ({ ...value, name: 'Changed' }) };
  expect(editStands(edit, { ...draw, rules: { ...draw.rules, winner_count: 9 } })).toBe(true);
  expect(editStands(edit, { ...draw, name: 'Renamed in the core' })).toBe(false);
});
