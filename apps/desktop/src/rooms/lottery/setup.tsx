import { FieldGroup, HeraldicCard, InkButton, WindowedRows } from '@castle-control/ui';
import type { LotsDraw, LotsDrawPolicy } from '@castle-control/contract';
import type { LotsPort } from '../../lots-model.js';
import { checkFixturePolicy } from '../../lots-model.js';
import { lotsCopy as copy } from '../../lots-copy.js';

export function DrawSetup({ port, on_edit, on_preview }: {
  port: LotsPort; on_edit: (draw: LotsDraw) => void; on_preview: () => void;
}) {
  const state = port.getSnapshot(); const draw = state.draw; const rules = draw.rules;
  const policy = (change: Partial<LotsDrawPolicy>) => on_edit({ ...draw, policy: { ...draw.policy, ...change } });
  const rule = (change: Partial<LotsDraw['rules']>) => on_edit({ ...draw, rules: { ...rules, ...change } });
  const check = checkFixturePolicy(draw.policy);
  const blocked = check.result === 'blocked' || state.entries.length < rules.winner_count;
  const newcomer = rules.free_join_equal_odds || rules.weight_curve.kind === 'equal' ? 1 : rules.weight_curve.max_units;
  const heaviest = Math.max(0, ...state.entries.map(entry => entry.weight));
  return <HeraldicCard variant="raised" aria-label={copy.setup}>
    <h2 className="lottery-card-title">{copy.setup}</h2>
    <p className="cc-aside">{copy.journey.setup_hint}</p>
    <fieldset className="lottery-settings" disabled={state.sealed}>
      <FieldGroup label={copy.name} control_id="lots-name">
        <input id="lots-name" value={draw.name} onChange={event => on_edit({ ...draw, name: event.currentTarget.value })} />
      </FieldGroup>
      <FieldGroup label={copy.content} control_id="lots-content" variant="select">
        <select id="lots-content" value={draw.policy.content} onChange={event => {
          const option = copy.content_options.find(item => item.value === event.currentTarget.value);
          if (option) policy({ content: option.value });
        }}>{copy.content_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.pool_label} control_id="lots-pool" variant="select">
        <select id="lots-pool" value={rules.pool.kind} onChange={event => {
          const option = copy.pool_options.find(item => item.value === event.currentTarget.value);
          if (option) on_edit({ ...draw,
            rules: { ...rules, pool: option.value === 'keyword' ? { kind: 'keyword', keyword: '!join' } : { kind: option.value } },
            policy: { ...draw.policy, subscriber_only: option.value === 'subscribers', channel_points: option.value === 'redeemers' } });
        }}>{copy.pool_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      {rules.pool.kind === 'keyword' && <FieldGroup label={copy.keyword} control_id="lots-keyword">
        <input id="lots-keyword" value={rules.pool.keyword} onChange={event => rule({ pool: { kind: 'keyword', keyword: event.currentTarget.value } })} />
      </FieldGroup>}
      <FieldGroup label={copy.winners} control_id="lots-winners">
        <input id="lots-winners" type="number" min={1} max={10000} value={rules.winner_count}
          onChange={event => rule({ winner_count: event.currentTarget.valueAsNumber })} />
      </FieldGroup>
      <FieldGroup label={copy.cooldown_label} control_id="lots-cooldown">
        <input id="lots-cooldown" type="number" min={0} value={rules.cooldown_s}
          onChange={event => rule({ cooldown_s: event.currentTarget.valueAsNumber })} />
      </FieldGroup>
      <FieldGroup label={copy.cap} control_id="lots-cap" variant="select">
        <select id="lots-cap" value={rules.cohort_caps[0]?.numerator ?? 1} onChange={event => {
          const option = copy.cap_options.find(item => item.value === Number(event.currentTarget.value));
          if (option) rule({ cohort_caps: [{ cohort: 'raider', numerator: option.value, denominator: 3 }] });
        }}>{copy.cap_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </FieldGroup>
      <FieldGroup label={copy.weights} control_id="lots-weights" variant="select" hint={copy.journey.weight_hint}>
        <select id="lots-weights" value={rules.weight_curve.kind} onChange={event => {
          if (event.currentTarget.value === 'equal') rule({ weight_curve: { kind: 'equal' } });
          if (event.currentTarget.value === 'concave') rule({ weight_curve: { kind: 'concave', max_units: 4 } });
        }}><option value="equal">{copy.weight_options[0].label}</option><option value="concave">{copy.journey.concave}</option></select>
      </FieldGroup>
      <FieldGroup label={copy.free} control_id="lots-free">
        <input id="lots-free" type="checkbox" checked={rules.free_join_equal_odds} onChange={event => {
          on_edit({ ...draw, rules: { ...rules, free_join_equal_odds: event.currentTarget.checked },
            policy: { ...draw.policy, free_entry_equal_odds: event.currentTarget.checked } });
        }} />
      </FieldGroup>
      {draw.policy.content === 'prize' && <>
        {([
          ['paid_entry', copy.paid_entry], ['paid_weight', copy.journey.paid_weight],
          ['subscriber_only', copy.restrictions[1].label], ['channel_points', copy.pool_options[3].label],
          ['official_rules', copy.template], ['twitch_disclaimer', copy.disclaimer], ['registration_confirmed', copy.registration],
        ] as const).map(([key, label]) => <FieldGroup key={key} label={label} control_id={`lots-${key}`}>
          <input id={`lots-${key}`} type="checkbox" checked={draw.policy[key]} onChange={event => policy({ [key]: event.currentTarget.checked })} />
        </FieldGroup>)}
        <FieldGroup label={copy.prize_value} control_id="lots-prize">
          <input id="lots-prize" type="number" min={0} step="0.01" value={draw.policy.prize_value_usd_cents / 100}
            onChange={event => policy({ prize_value_usd_cents: Math.round(event.currentTarget.valueAsNumber * 100) })} />
        </FieldGroup>
        <FieldGroup label={copy.age} control_id="lots-age">
          <input id="lots-age" type="number" min={0} max={120} value={draw.policy.minimum_age ?? ''} onChange={event => {
            const next = { ...draw.policy }; const value = event.currentTarget.valueAsNumber;
            if (Number.isNaN(value)) delete next.minimum_age; else next.minimum_age = value;
            on_edit({ ...draw, policy: next });
          }} />
        </FieldGroup>
        <FieldGroup label={copy.regions} control_id="lots-regions">
          <input id="lots-regions" value={draw.policy.regions.join(', ')} onChange={event => policy({ regions: event.currentTarget.value.split(',').map(value => value.trim()).filter(Boolean) })} />
        </FieldGroup>
      </>}
    </fieldset>
    <p className="cc-aside">{copy.journey.weight_summary(newcomer, heaviest)}</p>
    <details className="cc-disclosure"><summary>{copy.journey.weight_table}</summary>
      <WindowedRows rows={state.entries} label={copy.journey.weight_table} row_key={entry => entry.handle}>
        {entry => <p>{copy.core.entry(entry.handle, entry.weight)}</p>}
      </WindowedRows>
    </details>
    <InkButton size="room" disabled={state.sealed || blocked} onClick={on_preview}>{copy.journey.preview}</InkButton>
    {!state.sealed && <InkButton size="room" onClick={() => port.pause()}>{state.paused ? copy.resume : copy.pause}</InkButton>}
    <p className="cc-status" role="status">{state.sealed ? copy.journey.frozen : state.notice}</p>
    <p className="cc-aside">{copy.journey.draft_hint}</p>
  </HeraldicCard>;
}
