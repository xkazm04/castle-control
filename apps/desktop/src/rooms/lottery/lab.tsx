import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import { InkButton, SectionHeading, StatusChip, WindowedRows } from '@castle-control/ui';
import type { LotsWrit } from '@castle-control/contract';
import { byteWindow, defaultTamperIndex, inspectWrit } from './lab-model.js';
import type { LabReport, LabStep, StepStatus, Tamper, TamperKind, TracePick } from './lab-model.js';
import { labCopy as copy } from './lab-copy.js';
import type { BeaconAnchor } from './beacon-anchors.js';
import { useReducedMotion } from './playback.js';
import './lab.css';

const kinds: readonly TamperKind[] = ['weight', 'handle', 'seed', 'plan', 'winners'];
/** Forging only means something for a beacon writ: there is no signature to forge on a streamer seed. */
const kindsFor = (writ: LotsWrit): readonly TamperKind[] => writ.proof.source === 'drand_quicknet' ? [...kinds, 'forge'] : kinds;
const stepOrder = ['serialization', 'seal', 'randomness', 'derivation'] as const;
const stamp: Record<StepStatus, { variant: 'ok' | 'bad' | 'dash' | 'warn'; tone: 'ok' | 'blocked' | 'neutral' | 'warn' }> = {
  pass: { variant: 'ok', tone: 'ok' }, fail: { variant: 'bad', tone: 'blocked' },
  blocked: { variant: 'dash', tone: 'neutral' }, unverified: { variant: 'warn', tone: 'warn' },
};
const hex2 = (value: number | undefined) => value === undefined ? '··' : value.toString(16).padStart(2, '0');
const short = (value: string) => value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
const stepStyle = (index: number): CSSProperties & { '--lab-step': number } => ({ '--lab-step': index });

/** Summary sentence for the live region; exported for tests and the room. */
export function labVerdict(report: LabReport | undefined, failed = false): string {
  if (failed) return copy.failed;
  if (!report) return copy.checking;
  if (report.verdict !== 'caught') return copy.verdicts[report.verdict];
  const index = report.steps.findIndex(step => step.id === report.caught_at);
  const step = report.steps[index];
  return copy.verdicts.caught(index + 1, copy.steps[stepOrder[index] ?? 'seal'][0], step?.reason ? copy.reasons[step.reason] : '');
}

function RollBytes({ writ, report, tamper }: { writ: LotsWrit; report: LabReport | undefined; tamper: Tamper | undefined }) {
  const shown = report?.writ ?? writ;
  const entries = shown.roll.entries;
  const focus = report?.diff?.entry ?? (tamper && (tamper.kind === 'weight' || tamper.kind === 'handle') ? tamper.index ?? 0 : 0);
  const start = Math.max(0, Math.min(focus - 2, entries.length - 6));
  const diff = report?.diff;
  const excerpt = report ? byteWindow(report.preimage, diff?.offset ?? 0) : undefined;
  const field = diff?.field ? diff.entry === undefined ? copy.fields[diff.field] : copy.field_entry(copy.fields[diff.field], diff.entry) : undefined;
  return <div className="lottery-lab-bytes">
    <p className="lottery-lab-kicker">{copy.bytes_title}</p>
    <p className="lottery-lab-aside">{copy.bytes_hint}</p>
    <ol className="lottery-lab-roll" start={start + 1} aria-label={copy.entries_shown(Math.min(6, entries.length), entries.length)}>
      {entries.slice(start, start + 6).map((entry, offset) => <li key={`${start + offset}`}
        data-tampered={diff?.entry === start + offset ? 'true' : undefined}>
        {`{"handle":"${entry.handle}","weight":${entry.weight}}`}</li>)}
    </ol>
    <p className="lottery-lab-aside">{copy.entries_shown(Math.min(6, entries.length), entries.length)}
      {report ? ` · ${copy.byte_count(report.byte_length)}` : ''}</p>
    {excerpt && <figure className="lottery-lab-hex-frame">
      <figcaption>{diff ? <>{copy.offset(diff.offset)}{field ? ` · ${field}` : ''} · <b>{copy.byte_change(hex2(diff.before), hex2(diff.after))}</b></>
        : tamper ? copy.no_change_in_bytes : copy.offset(0)}</figcaption>
      <code className="lottery-lab-hex">{excerpt.bytes.map((byte, index) => <span key={excerpt.start + index}
        data-changed={diff && excerpt.start + index === diff.offset ? 'true' : undefined}>{hex2(byte)}</span>)}</code>
    </figure>}
  </div>;
}

function StepCard({ step, index, report }: { step: LabStep | undefined; index: number; report: LabReport | undefined }) {
  const id = stepOrder[index] ?? 'seal';
  const [title, description] = copy.steps[id];
  const status = step?.status;
  const detail = (value: string) => id === 'derivation' ? value : short(value);
  return <li className="lottery-lab-step" data-status={status ?? 'pending'} style={stepStyle(index)}>
    <span className="lottery-lab-step-number" aria-hidden="true">{index + 1}</span>
    <div className="lottery-lab-step-body">
      <h4>{`${index + 1}. ${title}`}</h4>
      <p className="lottery-lab-aside">{description}</p>
      {id === 'serialization' && report && <p className="lottery-lab-fact">{copy.entries_shown(report.entry_count, report.entry_count)} · {copy.byte_count(report.byte_length)}</p>}
      {id === 'randomness' && report && <p className="lottery-lab-fact">{copy.label(report.source, report.writ.roll.randomness.source === 'drand_quicknet' ? report.writ.roll.randomness.chain_hash : undefined)}{report.round ? ` · ${copy.round(report.round)}` : ''}</p>}
      {id === 'randomness' && status === 'pass' && report?.anchor && <p className="lottery-lab-fact" data-anchor={report.anchor}>{copy.anchor(report.anchor)}</p>}
      {step?.recorded !== undefined && <dl className="lottery-lab-compare" data-match={step.recorded === step.recomputed}>
        <div><dt>{copy.recorded}</dt><dd title={step.recorded}>{detail(step.recorded)}</dd></div>
        <div><dt>{copy.recomputed}</dt><dd title={step.recomputed}>{detail(step.recomputed ?? '')}</dd></div>
      </dl>}
      {step?.reason && <p className="lottery-lab-reason">{copy.reasons[step.reason]}</p>}
    </div>
    {status && <StatusChip variant={stamp[status].variant} stamp="verdict" tone={stamp[status].tone}>{copy.stamps[status]}</StatusChip>}
  </li>;
}

/** One-line proof summary beside the tamper bench, so a catch is visible without scrolling. */
function ProofStrip({ report, run }: { report: LabReport | undefined; run: number }) {
  return <ol className="lottery-lab-strip" key={run} aria-label={copy.strip}>
    {stepOrder.map((id, index) => {
      const status = report?.steps.find(step => step.id === id)?.status;
      return <li key={id} data-strip={status ?? 'pending'} style={stepStyle(index)}>
        <b aria-hidden="true">{index + 1}</b><span>{copy.strip_steps[id]}</span><i>{status ? copy.stamps[status] : copy.pending}</i>
      </li>;
    })}
  </ol>;
}

function TraceRow({ pick }: { pick: TracePick }) {
  return <p className="lottery-lab-pick" data-accepted={pick.accepted}>
    <b>{copy.trace_draw(pick.counter)}</b> <code>{pick.candidate}</code>{' '}
    <span>{pick.accepted ? copy.trace_accepted(pick.handle ?? '', pick.target ?? '', pick.total) : copy.trace_rejected(pick.total)}</span>
  </p>;
}

function Trace({ trace }: { trace: readonly TracePick[] }) {
  if (!trace.length) return null;
  const rejected = trace.filter(pick => !pick.accepted).length;
  return <details className="lottery-lab-trace">
    <summary>{copy.trace_title} · {copy.trace_count(trace.length, rejected)}</summary>
    <p className="lottery-lab-aside">{copy.trace_hint}</p>
    {trace.length > 8 ? <WindowedRows rows={trace} label={copy.trace_title} row_key={pick => pick.counter}>
      {pick => <TraceRow pick={pick} />}</WindowedRows>
      : <ol className="lottery-lab-picks">{trace.map(pick => <li key={pick.counter}><TraceRow pick={pick} /></li>)}</ol>}
  </details>;
}

type Specimen = 'cast' | 'beacon';

export function WritLabView({ writ, simulated, tamper, report, failed = false, run = 0, on_tamper, section, specimen, on_specimen }: {
  writ: LotsWrit; simulated: boolean; tamper?: Tamper; report?: LabReport; failed?: boolean; run?: number;
  on_tamper: (tamper: Tamper | undefined) => void; section?: Ref<HTMLElement>;
  specimen?: Specimen; on_specimen?: (specimen: Specimen) => void;
}) {
  const index = defaultTamperIndex(writ);
  const target = writ.roll.entries[index]?.handle ?? '';
  const hint = (kind: TamperKind) => copy.tamper_hints[kind](kind === 'weight' || kind === 'handle' ? target : writ.proof.source);
  return <section ref={section} className="lottery-lab" aria-label={copy.title}
    data-verdict={failed ? 'failed' : report?.verdict ?? 'pending'}>
    <SectionHeading variant="banner" level={2} title={copy.title} gloss={copy.gloss} ink="gules"
      count={simulated ? <StatusChip variant="gules" stamp="label">{copy.simulated}</StatusChip> : undefined} />
    <p className="lottery-lab-intro">{copy.intro}</p>
    {on_specimen && <div className="lottery-lab-specimens" role="group" aria-label={copy.specimen}>
      <p className="lottery-lab-kicker">{copy.specimen}</p>
      {(['cast', 'beacon'] as const).map(value => <InkButton key={value} size="small" aria-pressed={(specimen ?? 'cast') === value}
        onClick={() => on_specimen(value)}>{copy.specimens[value]}</InkButton>)}
      {specimen === 'beacon' && <p className="lottery-lab-aside">{copy.beacon_hint}</p>}
    </div>}
    <div className="lottery-lab-grid">
      <div className="lottery-lab-bench">
        <p className="lottery-lab-kicker">{copy.tamper_title}</p>
        <div className="lottery-lab-tampers" role="group" aria-label={copy.tamper_title}>
          {kindsFor(writ).map(kind => <InkButton key={kind} size="room" aria-pressed={tamper?.kind === kind} title={hint(kind)}
            onClick={() => on_tamper(tamper?.kind === kind ? undefined : { kind, index })}>{copy.tampers[kind]}</InkButton>)}
        </div>
        <p className="lottery-lab-aside">{tamper ? hint(tamper.kind) : copy.restored}</p>
        <ProofStrip report={report} run={run} />
        <p className="lottery-lab-verdict" role="status" data-verdict={failed ? 'failed' : report?.verdict ?? 'pending'}>
          {labVerdict(report, failed)}</p>
        <InkButton size="room" variant="primary" disabled={!tamper} onClick={() => on_tamper(undefined)}>{copy.restore}</InkButton>
        <RollBytes writ={writ} report={report} tamper={tamper} />
        <p className="lottery-lab-aside"><a download="castle-control-writ.json"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(writ))}`}>{copy.download}</a> · {copy.download_note}</p>
      </div>
      <div className="lottery-lab-pipeline">
        <p className="lottery-lab-kicker">{copy.pipeline_title}</p>
        <ol className="lottery-lab-steps" key={run}>
          {stepOrder.map((id, position) => <StepCard key={id} index={position} report={report}
            step={report?.steps.find(step => step.id === id)} />)}
        </ol>
        {report && <Trace trace={report.trace} />}
      </div>
    </div>
    <p className="lottery-lab-aside">{simulated ? copy.offline_note : copy.core_note}</p>
  </section>;
}

type Result = { writ: LotsWrit; tamper: Tamper | undefined; report?: LabReport; failed?: boolean };

/** In-room tamper-and-verify lab. Newer tamper selections always win over older recomputes.
 * Each new `prove` request (from the stage) restores the canonical writ, brings the lab into
 * view and replays the four-step walk. */
const no_anchors: readonly BeaconAnchor[] = [];

export function WritLab({ writ: cast_writ, simulated, prove = 0, beacon, anchors = no_anchors }: {
  writ: LotsWrit; simulated: boolean; prove?: number; beacon?: LotsWrit;
  /** Compiled-in chain anchors this lab may authenticate beacons against. */
  anchors?: readonly BeaconAnchor[];
}) {
  const [specimen, setSpecimen] = useState<Specimen>('cast');
  const writ = specimen === 'beacon' && beacon ? beacon : cast_writ;
  const [selection, setSelection] = useState<{ writ: LotsWrit; tamper?: Tamper }>({ writ });
  const section = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const tamper = selection.writ === writ ? selection.tamper : undefined;
  const [result, setResult] = useState<Result>();
  const [run, setRun] = useState(0);
  // Only a new prove request acts; a new writ alone keeps the streamer's place.
  useEffect(() => {
    if (!prove) return;
    setSpecimen('cast'); setSelection({ writ: cast_writ }); setRun(count => count + 1);
    const node = section.current;
    node?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Keyboard users land on the first tamper control, ready to try the proof.
    node?.querySelector<HTMLButtonElement>('.lottery-lab-tampers button')?.focus({ preventScroll: true });
  }, [prove]);
  useEffect(() => {
    let live = true;
    inspectWrit(writ, tamper, anchors).then(report => {
      if (!live) return;
      setResult({ writ, tamper, report }); setRun(count => count + 1);
    }, () => { if (live) setResult({ writ, tamper, failed: true }); });
    return () => { live = false; };
  }, [writ, tamper, anchors]);
  const current = result && result.writ === writ && result.tamper === tamper ? result : undefined;
  return <WritLabView section={section} writ={writ} simulated={simulated} run={run} on_tamper={next => setSelection(next ? { writ, tamper: next } : { writ })}
    {...(tamper ? { tamper } : {})} {...(current?.report ? { report: current.report } : {})} failed={current?.failed ?? false}
    {...(beacon ? { specimen, on_specimen: setSpecimen } : {})} />;
}
