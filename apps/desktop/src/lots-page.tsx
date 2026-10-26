import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { InkButton, NumberedPanel, PageHeader, StatusChip, WindowedRows } from '@castle-control/ui';
import type { LotsDrawPolicy } from '@castle-control/contract';
import { checkFixturePolicy, createLotsPreview, lookupFixture } from './lots-model.js';
import type { LotsPort, LotsPreview } from './lots-model.js';
import { fixtureCooldown, fixtureDraws, fixtureWrit } from './lots-fixture.js';
import type { FixtureEntry } from './lots-fixture.js';
import { lotsCopy as copy } from './lots-copy.js';
import './lots.css';

type PreviewProps = { snapshot: LotsPreview; port: LotsPort };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="lots-field"><span>{label}</span>{children}</label>;
}
export function LotsDotField({ entries, scroll_top = 0 }: { entries: readonly FixtureEntry[]; scroll_top?: number }) {
  const rows = useMemo(() => Array.from({ length: Math.ceil(entries.length / 20) }, (_, index) => entries.slice(index * 20, index * 20 + 20)), [entries]);
  return <div className="lots-dotfield"><WindowedRows rows={rows} label={copy.dots} scroll_top={scroll_top}
    row_key={row => String(row[0]?.number)} empty_state={copy.empty}>
    {row => <div className="lots-dotrow">{row.map(entry => <span key={entry.handle} role="cell" className={`lots-dot lots-${entry.cohort}`}
      data-lot-dot={entry.number} aria-label={`${copy.ticket(entry.number)} · ${copy.cohorts[entry.cohort]}`} title={entry.handle} />)}</div>}
  </WindowedRows></div>;
}
export function LotsHero({ snapshot, port }: PreviewProps) {
  const blocked = checkFixturePolicy(snapshot.draw.policy).result === 'blocked';
  return <section className="lots-hero" aria-label={copy.hero}>
    <div className="lots-hero-summary">
      <p className="lots-kicker">{copy.roll} · {snapshot.draw.name}</p>
      <strong className="lots-count">{snapshot.entries.length.toLocaleString('en-US')}</strong>
      <span className="lots-pool">{copy.entries}</span><p className="lots-meta">{copy.pool}</p>
      <div className="lots-tools"><StatusChip variant="gules">{snapshot.sealed ? copy.sealed : snapshot.paused ? copy.paused : copy.open}</StatusChip>
        <span className="lots-meta">{fixtureCooldown.length} {copy.cooldown}</span></div>
      <div className="lots-tools">
        <InkButton variant="primary" disabled={snapshot.sealed || blocked || !snapshot.entries.length} onClick={port.seal}>{copy.seal}</InkButton>
        <InkButton variant="ghost" disabled={snapshot.sealed} aria-pressed={snapshot.paused} onClick={port.pause}>{snapshot.paused ? copy.resume : copy.pause}</InkButton>
      </div>
    </div>
    <div className="lots-hero-art"><p className="lots-meta">{copy.illustration}</p>
      <div className="lots-tickets" role="list" aria-label={copy.tickets}>
        {snapshot.entries.slice(0, 5).map(entry => <div role="listitem" key={entry.handle} className="lots-ticket">
          <b>{String(entry.number).padStart(3, '0')}</b><span>{entry.handle}<small>{copy.cohorts[entry.cohort]}</small></span>
        </div>)}
      </div>
      <LotsDotField entries={snapshot.entries} />
      <p className="lots-legend">{Object.entries(copy.cohorts).map(([cohort, label]) => <span key={cohort}><i className={`lots-dot lots-${cohort}`} />{label}</span>)}</p>
    </div>
  </section>;
}
export function LotsSetup({ snapshot, port }: PreviewProps) {
  const draw = snapshot.draw;
  const policy = draw.policy;
  const rules = draw.rules;
  const changePolicy = (change: Partial<LotsDrawPolicy>) => port.edit({ ...draw, policy: { ...policy, ...change } });
  const check = checkFixturePolicy(policy);
  return <>
    <p className="lots-meta">{copy.setup_note}</p>
    <fieldset className="lots-setup" disabled={snapshot.sealed} aria-label={copy.setup}>
      <Field label={copy.name}><input aria-label={copy.name} value={draw.name} onChange={event => port.edit({ ...draw, name: event.currentTarget.value })} /></Field>
      <div className="lots-form-row">
        <Field label={copy.content}><select aria-label={copy.content} value={policy.content} onChange={event => {
          const option = copy.content_options.find(option => option.value === event.currentTarget.value);
          if (option) changePolicy({ content: option.value });
        }}>{copy.content_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label={copy.pool_label}><select aria-label={copy.pool_label} value={rules.pool.kind} onChange={event => {
          const option = copy.pool_options.find(option => option.value === event.currentTarget.value);
          if (!option) return;
          port.edit({ ...draw, policy: { ...policy, channel_points: option.value === 'redeemers', subscriber_only: option.value === 'subscribers' },
            rules: { ...rules, pool: option.value === 'keyword' ? { kind: 'keyword', keyword: '!join' } : { kind: option.value } } });
        }}>{copy.pool_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
      </div>
      <Field label={copy.keyword}><input aria-label={copy.keyword} value={rules.pool.kind === 'keyword' ? rules.pool.keyword : '!join'} disabled={rules.pool.kind !== 'keyword'}
        onChange={event => port.edit({ ...draw, rules: { ...rules, pool: { kind: 'keyword', keyword: event.currentTarget.value } } })} /></Field>
      <Field label={copy.restriction}><select aria-label={copy.restriction} value={policy.subscriber_only ? 'subscribers' : 'none'}
        onChange={event => port.edit({ ...draw, policy: { ...policy, subscriber_only: event.currentTarget.value === 'subscribers' },
          rules: { ...rules, pool: event.currentTarget.value !== 'subscribers' && rules.pool.kind === 'subscribers' ? { kind: 'chatters' } : rules.pool } })}>
        {copy.restrictions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></Field>
      <label className="lots-check"><input type="checkbox" aria-label={copy.free} checked={policy.free_entry_equal_odds} onChange={event => port.edit({ ...draw,
        policy: { ...policy, free_entry_equal_odds: event.currentTarget.checked }, rules: { ...rules, free_join_equal_odds: event.currentTarget.checked } })} />{copy.free}</label>
      <Field label={copy.weights}><select aria-label={copy.weights} value={policy.paid_weight ? 'paid' : 'equal'} onChange={event => changePolicy({ paid_weight: event.currentTarget.value === 'paid' })}>
        {copy.weight_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></Field>
      <label className="lots-check"><input type="checkbox" aria-label={copy.paid_entry} checked={policy.paid_entry} onChange={event => changePolicy({ paid_entry: event.currentTarget.checked })} />{copy.paid_entry}</label>
      <p className="lots-meta">{policy.paid_weight ? copy.paid_notice : copy.equal}</p>
      <div className="lots-form-row">
        <Field label={copy.winners}><input aria-label={copy.winners} type="number" min={1} max={Math.max(1, snapshot.entries.length)} value={rules.winner_count}
          onChange={event => port.edit({ ...draw, rules: { ...rules, winner_count: event.currentTarget.valueAsNumber } })} /></Field>
        <Field label={copy.cooldown_label}><input aria-label={copy.cooldown_label} type="number" min={0} step={1} value={rules.cooldown_s}
          onChange={event => port.edit({ ...draw, rules: { ...rules, cooldown_s: event.currentTarget.valueAsNumber } })} /></Field>
      </div>
      <Field label={copy.cap}><select aria-label={copy.cap} value={rules.cohort_caps[0]?.numerator ?? 1} onChange={event => port.edit({ ...draw,
        rules: { ...rules, cohort_caps: [{ cohort: 'raider', numerator: Number(event.currentTarget.value), denominator: 3 }] } })}>
        {copy.cap_options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></Field>
      {policy.content === 'prize' && <>
        <div className="lots-form-row">
          <Field label={copy.age}><input aria-label={copy.age} type="number" min={0} max={120} value={policy.minimum_age ?? ''} onChange={event => {
            if (event.currentTarget.value !== '') changePolicy({ minimum_age: event.currentTarget.valueAsNumber });
            else { const next = { ...policy }; delete next.minimum_age; port.edit({ ...draw, policy: next }); }
          }} /></Field>
          <Field label={copy.regions}><input aria-label={copy.regions} value={policy.regions.join(',')} onChange={event => changePolicy({ regions: event.currentTarget.value.split(',') })} /></Field>
        </div>
        <Field label={copy.prize_value}><input aria-label={copy.prize_value} type="number" min={0} step="0.01" value={policy.prize_value_usd_cents / 100}
          onChange={event => changePolicy({ prize_value_usd_cents: Math.round(event.currentTarget.valueAsNumber * 100) })} /></Field>
        <label className="lots-check"><input type="checkbox" aria-label={copy.registration} checked={policy.registration_confirmed} onChange={event => changePolicy({ registration_confirmed: event.currentTarget.checked })} />{copy.registration}</label>
        <p className="lots-meta">{copy.disclaimer_text}</p>
        <label className="lots-check"><input type="checkbox" aria-label={copy.disclaimer} checked={policy.twitch_disclaimer} onChange={event => changePolicy({ twitch_disclaimer: event.currentTarget.checked })} />{copy.disclaimer}</label>
        <label className="lots-check"><input type="checkbox" aria-label={copy.template} checked={policy.official_rules} onChange={event => changePolicy({ official_rules: event.currentTarget.checked })} />{copy.template}</label>
        {policy.official_rules && <p className="lots-meta">{copy.template_text}</p>}
      </>}
    </fieldset>
    <div className="lots-guardrail" aria-label={copy.gate} role="status">
      <StatusChip variant={check.result === 'blocked' ? 'bad' : check.result === 'warn' ? 'warn' : 'ok'}>{copy.checks[check.result]}</StatusChip>
      <ul>{check.reasons.map(reason => <li key={reason}>{Object.entries(copy.reasons).find(([code]) => code === reason)?.[1] ?? reason}</li>)}</ul>
    </div>
    <InkButton variant="plate" disabled={!snapshot.sealed || snapshot.started || check.result === 'blocked'} onClick={port.start}>{copy.start}</InkButton>
  </>;
}
export function LotsWritView({ snapshot, port }: PreviewProps) {
  const writ = fixtureWrit;
  const label = copy.writ_fields;
  const fields = [
    [label.version, writ.roll.version], [label.at, writ.roll.sealed_at], [label.seal, writ.seal],
    [label.entries, writ.roll.entries.map(entry => `${entry.handle} ×${entry.weight}`).join(', ')],
    [label.count, writ.roll.winner_count], [label.margin, writ.roll.margin_s], [label.source, writ.proof.source],
    [label.commitment, writ.roll.randomness.source === 'streamer_commit' ? writ.roll.randomness.commitment : ''],
    [label.seed, writ.proof.source === 'streamer_commit' ? writ.proof.seed : ''], [label.winners, writ.winners.join(', ')],
  ];
  return <>
    <PageHeader number={1} title={copy.writ} description={copy.writ_notice} breadcrumbs={[{ label: copy.title }, { label: copy.writ }]} />
    <InkButton onClick={() => port.nested(false)}>{copy.back}</InkButton>
    <p className="lots-notice">{copy.notice}</p>
    <div className="lots-writ-grid">
      <dl className="lots-proof">{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
      <NumberedPanel number="W.1" title={copy.recompute}>
        <p className="lots-meta">{copy.fixture_only}</p>
        <InkButton variant="plate" disabled={snapshot.recomputing} onClick={() => port.recompute()}>{copy.recompute}</InkButton>
        <p role="status" aria-live="polite">{snapshot.notice}</p>
      </NumberedPanel>
    </div>
  </>;
}
export function LotsContent({ snapshot, port }: PreviewProps) {
  if (snapshot.nested) return <LotsWritView snapshot={snapshot} port={port} />;
  return <>
    <PageHeader number={1} title={copy.title} description={copy.description} actions={<StatusChip variant="gules">{copy.badge}</StatusChip>} />
    <p className="lots-notice">{copy.notice}</p>
    <LotsHero snapshot={snapshot} port={port} />
    <div className="lots-grid">
      <div className="lots-column">
        <NumberedPanel number="1.1" title={copy.saved}>
          <div className="lots-draws" role="group" aria-label={copy.saved}>{fixtureDraws.map(draw =>
            <button type="button" className="lots-draw" key={draw.draw_id} aria-pressed={draw.draw_id === snapshot.draw.draw_id} onClick={() => port.select(draw.draw_id)}>
              <b>{draw.name}</b><StatusChip variant={draw.policy.paid_weight ? 'bad' : draw.policy.content === 'prize' ? 'or' : 'dash'}>
                {draw.policy.paid_weight ? copy.paid_blocked : draw.policy.content === 'prize' ? copy.content_options[2].label : copy.no_prize}
              </StatusChip>
            </button>)}</div>
        </NumberedPanel>
        <NumberedPanel number="1.2" title={copy.roll}>
          <Field label={copy.lookup}><input aria-label={copy.lookup} type="search" value={snapshot.lookup} onChange={event => port.lookup(event.currentTarget.value)} /></Field>
          <p className="lots-meta">{copy.lookup_hint}</p><p role="status">{lookupFixture(snapshot)}</p>
        </NumberedPanel>
      </div>
      <div className="lots-column"><NumberedPanel number="1.3" title={copy.setup}><LotsSetup snapshot={snapshot} port={port} /></NumberedPanel></div>
      <div className="lots-column">
        <NumberedPanel number="1.4" title={copy.fairness}>
          <ol className="lots-steps">{copy.steps.map(([title, detail]) => <li key={title}><b>{title}</b><p>{detail}</p></li>)}</ol>
          <p className="lots-meta">{copy.test_note}</p>
        </NumberedPanel>
        <NumberedPanel number="1.5" title={copy.stream}>
          <p className="lots-meta">{copy.static_preview}</p>
          <div className="lots-shape" role="img" aria-label={copy.shapes.find(shape => shape.value === snapshot.shape)?.label}>
            <span aria-hidden="true">{copy.shapes.find(shape => shape.value === snapshot.shape)?.glyph}</span>
            <b>{copy.shapes.find(shape => shape.value === snapshot.shape)?.label}</b>
          </div>
          <div className="lots-shapes" role="group" aria-label={copy.shape}>{copy.shapes.map(shape => <InkButton size="small" key={shape.value}
            aria-pressed={snapshot.shape === shape.value} onClick={() => port.shape(shape.value)}>{shape.label}</InkButton>)}</div>
          {snapshot.draw.policy.content === 'prize' && <p className="lots-disclaimer">{copy.disclaimer_text}</p>}
          <InkButton onClick={() => port.nested(true)}>{copy.writ_open}</InkButton>
        </NumberedPanel>
      </div>
    </div>
    <p className="lots-notice" role="status" aria-live="polite">{snapshot.notice}</p>
  </>;
}
export function LotsPage({ port }: { port?: LotsPort }) {
  const [local] = useState(createLotsPreview);
  const adapter = port ?? local;
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(snapshot.nested);
  useEffect(() => {
    if (previous.current !== snapshot.nested) container.current?.focus();
    previous.current = snapshot.nested;
  }, [snapshot.nested]);
  return <div ref={container} tabIndex={-1} className="lots-page"><LotsContent snapshot={snapshot} port={adapter} /></div>;
}
