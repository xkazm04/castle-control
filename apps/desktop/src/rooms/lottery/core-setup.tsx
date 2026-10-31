import { useId, useState } from 'react';
import { FieldGroup, HeraldicCard, InkButton } from '@castle-control/ui';
import type { LotsDraw, LotsDrawPolicy } from '@castle-control/contract';
import { lotsCopy as copy } from '../../lots-copy.js';

type Draft = { base: LotsDraw; value: LotsDraw; regions: string };
const fresh = (draw: LotsDraw): Draft => ({ base: draw, value: draw, regions: draw.policy.regions.join(', ') });
const regionList = (text: string) => text.split(',').map(value => value.trim()).filter(Boolean);
const prize_flags = [['paid_entry', copy.paid_entry], ['paid_weight', copy.journey.paid_weight], ['official_rules', copy.template],
  ['twitch_disclaimer', copy.disclaimer], ['registration_confirmed', copy.registration]] as const;

/** Saves the candidate after the regions draft is applied; undefined while a field is invalid. */
export function coreSetupCandidate(draft: Pick<Draft, 'value' | 'regions'>): LotsDraw | undefined {
  const draw = draft.value; const rules = draw.rules;
  if (!draw.name.trim()) return undefined;
  if (rules.pool.kind === 'keyword' && !/^\S+$/.test(rules.pool.keyword)) return undefined;
  if (!Number.isInteger(rules.cooldown_s) || rules.cooldown_s < 0) return undefined;
  if (!Number.isInteger(draw.policy.prize_value_usd_cents) || draw.policy.prize_value_usd_cents < 0) return undefined;
  return { ...draw, policy: { ...draw.policy, regions: regionList(draft.regions) } };
}

/** Core rule setup as a draft: edits stay in this card until one save sends a single
 * `lots.draw.upsert` (which also re-runs the core's policy check). Winner count keeps its
 * own commit-on-blur field above; a new draw from the core replaces an unsaved draft. */
export function CoreDrawSetup({ draw, disabled, on_save }: { draw: LotsDraw; disabled: boolean; on_save: (draw: LotsDraw) => void }) {
  const id = useId();
  const [state, setDraft] = useState<Draft>(() => fresh(draw));
  const draft = state.base === draw ? state : fresh(draw);
  if (draft !== state) setDraft(draft);
  const value = draft.value; const rules = value.rules;
  const update = (next: (current: LotsDraw) => LotsDraw) => setDraft(prior => ({ ...prior, value: next(prior.value) }));
  const rule = (change: Partial<LotsDraw['rules']>) => update(current => ({ ...current, rules: { ...current.rules, ...change } }));
  const policy = (change: Partial<LotsDrawPolicy>) => update(current => ({ ...current, policy: { ...current.policy, ...change } }));
  const candidate = coreSetupCandidate(draft);
  const dirty = JSON.stringify(candidate ?? value) !== JSON.stringify(draw) || draft.regions !== draw.policy.regions.join(', ');
  const field = (name: string) => `${id}-${name}`;
  return <HeraldicCard variant="raised" aria-label={copy.core_setup.title}>
    <h2 className="lottery-card-title">{copy.core_setup.title}</h2>
    <p className="cc-aside">{copy.core_setup.hint}</p>
    <fieldset className="lottery-settings" disabled={disabled}>
      <FieldGroup label={copy.name} control_id={field('name')} result={value.name.trim() ? undefined : copy.invalid_setup}>
        <input id={field('name')} value={value.name} onChange={event => { const name = event.currentTarget.value; update(current => ({ ...current, name })); }} />
      </FieldGroup>
      <FieldGroup label={copy.content} control_id={field('content')} variant="select">
        <select id={field('content')} value={value.policy.content} onChange={event => {
          const option = copy.content_options.find(item => item.value === event.currentTarget.value);
          if (option) policy({ content: option.value });
        }}>{copy.content_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.pool_label} control_id={field('pool')} variant="select">
        <select id={field('pool')} value={rules.pool.kind} onChange={event => {
          const option = copy.pool_options.find(item => item.value === event.currentTarget.value);
          if (option) update(current => ({ ...current,
            rules: { ...current.rules, pool: option.value === 'keyword' ? { kind: 'keyword', keyword: '!join' } : { kind: option.value } },
            policy: { ...current.policy, subscriber_only: option.value === 'subscribers', channel_points: option.value === 'redeemers' } }));
        }}>{copy.pool_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      {rules.pool.kind === 'keyword' && <FieldGroup label={copy.keyword} control_id={field('keyword')}
        result={/^\S+$/.test(rules.pool.keyword) ? undefined : copy.invalid_setup}>
        <input id={field('keyword')} value={rules.pool.keyword}
          onChange={event => rule({ pool: { kind: 'keyword', keyword: event.currentTarget.value } })} />
      </FieldGroup>}
      <FieldGroup label={copy.cooldown_label} control_id={field('cooldown')}>
        <input id={field('cooldown')} type="number" min={0} step={1} value={Number.isNaN(rules.cooldown_s) ? '' : rules.cooldown_s}
          onChange={event => rule({ cooldown_s: event.currentTarget.valueAsNumber })} />
      </FieldGroup>
      <FieldGroup label={copy.cap} control_id={field('cap')} variant="select">
        <select id={field('cap')} value={rules.cohort_caps.find(item => item.cohort === 'raider')?.numerator ?? 0} onChange={event => {
          const numerator = Number(event.currentTarget.value);
          rule({ cohort_caps: numerator ? [{ cohort: 'raider', numerator, denominator: 3 }] : [] });
        }}><option value={0}>{copy.no_cap}</option>
          {copy.cap_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.weights} control_id={field('weights')} variant="select" hint={copy.journey.weight_hint}>
        <select id={field('weights')} value={rules.weight_curve.kind} onChange={event => {
          if (event.currentTarget.value === 'equal') rule({ weight_curve: { kind: 'equal' } });
          if (event.currentTarget.value === 'concave') rule({ weight_curve: { kind: 'concave', max_units: 4 } });
        }}><option value="equal">{copy.weight_options[0].label}</option><option value="concave">{copy.journey.concave}</option></select>
      </FieldGroup>
      <FieldGroup label={copy.free} control_id={field('free')}>
        <input id={field('free')} type="checkbox" checked={rules.free_join_equal_odds} onChange={event => {
          const free = event.currentTarget.checked;
          update(current => ({ ...current, rules: { ...current.rules, free_join_equal_odds: free },
            policy: { ...current.policy, free_entry_equal_odds: free } }));
        }} />
      </FieldGroup>
      {value.policy.content === 'prize' && <>
        {prize_flags.map(([key, label]) => <FieldGroup key={key} label={label} control_id={field(key)}>
          <input id={field(key)} type="checkbox" checked={value.policy[key]} onChange={event => policy({ [key]: event.currentTarget.checked })} />
        </FieldGroup>)}
        <FieldGroup label={copy.prize_value} control_id={field('prize')}>
          <input id={field('prize')} type="number" min={0} step="0.01" value={value.policy.prize_value_usd_cents / 100}
            onChange={event => policy({ prize_value_usd_cents: Math.round(event.currentTarget.valueAsNumber * 100) })} />
        </FieldGroup>
        <FieldGroup label={copy.age} control_id={field('age')}>
          <input id={field('age')} type="number" min={0} max={120} value={value.policy.minimum_age ?? ''} onChange={event => {
            const age = event.currentTarget.valueAsNumber;
            update(current => {
              const next = { ...current.policy };
              if (Number.isNaN(age)) delete next.minimum_age; else next.minimum_age = age;
              return { ...current, policy: next };
            });
          }} />
        </FieldGroup>
        <FieldGroup label={copy.regions} control_id={field('regions')}>
          <input id={field('regions')} value={draft.regions} onChange={event => {
            const regions = event.currentTarget.value; setDraft(prior => ({ ...prior, regions }));
          }} />
        </FieldGroup>
      </>}
    </fieldset>
    <InkButton size="room" variant="primary" disabled={disabled || !dirty || !candidate}
      onClick={() => { if (candidate) on_save(candidate); }}>{copy.core_setup.save}</InkButton>
    <InkButton size="room" disabled={disabled || !dirty} onClick={() => setDraft(fresh(draw))}>{copy.core_setup.discard}</InkButton>
    <p className="cc-status" role="status">{!candidate ? copy.invalid_setup : dirty ? copy.core_setup.dirty : copy.core_setup.clean}</p>
  </HeraldicCard>;
}
