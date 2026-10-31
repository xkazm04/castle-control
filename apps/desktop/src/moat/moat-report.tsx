import { createPortal } from 'react-dom';
import { clockText } from './clock.js';
import { actionWords, moatCopy as copy } from './moat-copy.js';
import type { MoatModel } from './moat-model.js';
import { MoatScene } from './moat-scene.jsx';

export type MoatReportInfo = { source: string; instrument_hash: string; origin: 'fixture' | 'core' };
const rowCap = 60;
const verdictWords = { hold: 'Hold', bar: 'Bar', pass: 'Pass' } as const;

/** The night on one sheet: the finished moat, gaps and every stop. Paper tokens, whatever the app theme. */
export function MoatReport({ model, info, delay_s, uid }: { model: MoatModel; info: MoatReportInfo; delay_s?: number | undefined; uid: string }) {
  const stopped = model.markers.filter(marker => marker.fate === 'held');
  const end = model.start_ms + model.span_ms;
  const words = copy.report;
  return <article className="moat-report" data-theme="paper" aria-label={words.title}>
    <header><h2>{words.title}</h2><p>{words.kicker}</p></header>
    <dl className="moat-report-facts">
      <dt>{words.source}</dt><dd>{info.source}</dd>
      <dt>{words.from}</dt><dd>{clockText(model.start_ms)}</dd>
      <dt>{words.to}</dt><dd>{clockText(end)}</dd>
      <dt>{words.hash}</dt><dd><code>{info.instrument_hash}</code> · {info.origin === 'fixture' ? words.hash_fixture : words.hash_core}</dd>
    </dl>
    <p className="moat-report-figure"><b>{copy.summary(model.counts.held, model.counts.total)}</b> · {copy.breakdown(model.counts)}</p>
    <MoatScene model={model} playhead_ms={model.run_ms} window={{ from_ms: 0, to_ms: model.span_ms, paged: false }} delay_s={delay_s} uid={`${uid}-report`} />
    <h3>{words.gaps}</h3>
    {model.gaps.length ? <ul>{model.gaps.map(gap => <li key={gap.from}>{words.gap_line(clockText(Date.parse(gap.from)), clockText(Date.parse(gap.to)))}</li>)}</ul> : <p>{words.no_gaps}</p>}
    <h3>{words.stopped}</h3>
    {stopped.length ? <table><thead><tr>{[words.time, words.message, words.verdict, words.rule, words.action, words.evaluation].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>{stopped.slice(0, rowCap).map(marker => <tr key={marker.index}>
        <td>{clockText(Date.parse(marker.at))}</td><td>{marker.message_id}</td><td>{marker.verdict ? verdictWords[marker.verdict] : copy.none}</td>
        <td>{marker.rule_id ?? copy.none}</td><td>{marker.action ? actionWords[marker.action] : copy.none}</td>
        <td>{copy.evaluation_words[marker.passed === undefined ? 'none' : marker.passed ? 'true' : 'false']}</td></tr>)}</tbody></table> : <p>{words.none_stopped}</p>}
    {stopped.length > rowCap && <p>{words.more(stopped.length - rowCap)}</p>}
    <footer><p>{words.note}</p></footer>
  </article>;
}

/** Printing moves the report to the document root so the app shell's fixed heights cannot clip it. */
export function MoatReportPortal(props: { model: MoatModel; info: MoatReportInfo; delay_s?: number | undefined; uid: string }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div data-moat-report="true"><MoatReport {...props} /></div>, document.body);
}
