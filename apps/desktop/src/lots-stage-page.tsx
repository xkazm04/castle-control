import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { InkButton, NumberedPanel, PageHeader, StageFrame } from '@castle-control/ui';
import { LotsDotField, LotsFairness, LotsLookup, LotsSaved, LotsSetup, LotsStream, LotsWritView } from './lots-page.jsx';
import { checkFixturePolicy, createLotsPreview } from './lots-model.js';
import type { LotsPort, LotsPreview } from './lots-model.js';
import { fixtureCooldown, fixtureWrit } from './lots-fixture.js';
import { lotsCopy } from './lots-copy.js';
import { stageCopy as copy } from './lots-stage-copy.js';
import { defaultDesign, escapeStage, focusTitle } from './lots-stage-model.js';
import type { FixtureDesign } from './lots-stage-model.js';
import { stageHash } from './lots-stage-route.js';
import type { StageFocus } from './lots-stage-route.js';
import { CustomDesign, DesignArtifact, PresetPicker } from './lots-stage-design.jsx';
import './lots-stage.css';

type StageProps = { snapshot: LotsPreview; port: LotsPort; design: FixtureDesign };
export function LotsStageOverview({ snapshot, port, design }: StageProps) {
  return <>
    <PageHeader number={1} title={copy.title} description={copy.description} />
    <p className="lots-notice">{lotsCopy.notice}</p>
    <StageFrame label={copy.stage} stage={<>
      <p className="lots-kicker">{snapshot.draw.name} · {lotsCopy.roll}</p>
      <div className="lots-stage-roll">
        <div className="lots-stage-roll-art"><DesignArtifact design={{ ...design, shape: snapshot.shape }} />
          <p className="lots-meta">{copy.preset}: <b>{design.name}</b></p>
          <div className="lots-tools"><a href={`${stageHash}/restyle`}>{copy.restyle}</a><a href={`${stageHash}/custom`}>{copy.custom}</a></div>
        </div>
        <div className="lots-hero-art">
          <p className="lots-meta">{lotsCopy.illustration}</p>
          <div className="lots-tickets" role="list" aria-label={lotsCopy.tickets}>{snapshot.entries.slice(0, 5).map(entry =>
            <div role="listitem" key={entry.handle} className="lots-ticket"><b>{String(entry.number).padStart(3, '0')}</b>
              <span>{entry.handle}<small>{lotsCopy.cohorts[entry.cohort]}</small></span></div>)}</div>
          <LotsDotField entries={snapshot.entries} />
          <p className="lots-legend">{Object.entries(lotsCopy.cohorts).map(([cohort, label]) => <span key={cohort}><i className={`lots-dot lots-${cohort}`} />{label}</span>)}</p>
        </div>
      </div>
    </>} headline_figures={[
      <><span>{copy.count}</span><strong>{snapshot.entries.length.toLocaleString('en-US')}</strong></>,
      <><span>{copy.state}</span><strong>{snapshot.sealed ? lotsCopy.sealed : snapshot.paused ? lotsCopy.paused : lotsCopy.open}</strong></>,
      <><span>{copy.cooldown}</span><strong>{fixtureCooldown.length}</strong></>,
    ]} primary_actions={[
      <InkButton key="seal" variant="primary" disabled={snapshot.sealed || !snapshot.entries.length || checkFixturePolicy(snapshot.draw.policy).result === 'blocked'} onClick={port.seal}>{lotsCopy.seal}</InkButton>,
      <InkButton key="pause" disabled={snapshot.sealed} aria-pressed={snapshot.paused} onClick={port.pause}>{snapshot.paused ? lotsCopy.resume : lotsCopy.pause}</InkButton>,
    ]} entry_points={copy.entries.map(entry => <a key={entry.id} href={`${stageHash}/${entry.id}`}>
      {entry.id === 'writ' ? entry.title : `${entry.id} ${entry.title}`}</a>)} />
    <p className="lots-notice" role="status">{snapshot.notice}</p>
    <a href="#/lottery">{copy.reference}</a>
  </>;
}

function FocusContent({ focus, snapshot, port }: { focus: StageFocus; snapshot: LotsPreview; port: LotsPort }) {
  switch (focus) {
    case '1.1': return LotsSaved({ snapshot, port });
    case '1.2': return LotsLookup({ snapshot, port });
    case '1.3': return <LotsSetup snapshot={snapshot} port={port} />;
    case '1.4': return LotsFairness();
    case '1.5': return LotsStream({ snapshot, port });
    case '1.6': return <><p>{copy.history_note}</p>
      <dl className="lots-proof"><div><dt>{lotsCopy.writ_fields.at}</dt><dd>{fixtureWrit.roll.sealed_at}</dd></div>
        <div><dt>{lotsCopy.writ_fields.winners}</dt><dd>{fixtureWrit.winners.join(', ')}</dd></div>
        <div><dt>{lotsCopy.writ_fields.seal}</dt><dd>{fixtureWrit.seal}</dd></div></dl>
      <a href={`${stageHash}/writ`}>{copy.sample} · {lotsCopy.writ_open}</a></>;
    case 'writ': return <LotsWritView snapshot={snapshot} port={port} embedded />;
    default: return null;
  }
}
export function LotsStagePage({ route = 'stage' }: { route?: StageFocus | 'stage' }) {
  const [port] = useState(createLotsPreview);
  const [design, setDesign] = useState(defaultDesign);
  const [notice, setNotice] = useState('');
  const snapshot = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef<StageFocus | 'stage'>(route);
  const back = () => { window.location.hash = stageHash; };
  useEffect(() => {
    if (route === 'stage' && previous.current !== 'stage') {
      container.current?.querySelector<HTMLAnchorElement>(`a[href="${stageHash}/${previous.current}"]`)?.focus();
    } else container.current?.focus();
    previous.current = route;
  }, [route]);
  const apply = (next: FixtureDesign) => { setDesign(next); port.shape(next.shape); };
  // Keep the existing shape panel wired to the same artifact; its writ opens a route.
  const focusPort: LotsPort = { ...port, nested: show => { window.location.hash = show ? `${stageHash}/writ` : stageHash; } };
  return <div className="lots-stage-page" ref={container} tabIndex={-1}
    onKeyDown={event => { if (route !== 'stage') escapeStage(event, back); }}>
    {route === 'stage' ? <><LotsStageOverview snapshot={snapshot} port={port} design={design} /><p role="status">{notice}</p></> : <>
      <nav className="cc-breadcrumb" aria-label={copy.breadcrumb}><span>{copy.home}</span><span aria-hidden="true">›</span>
        <a href={stageHash}>{copy.chamber}</a><span aria-hidden="true">›</span><b>{focusTitle(route)}</b></nav>
      <div className="lots-tools"><a href={stageHash}>{copy.back}</a></div>
      <NumberedPanel number={route} title={focusTitle(route)}>
        {route === 'restyle' ? <PresetPicker design={{ ...design, shape: snapshot.shape }} apply={apply} />
          : route === 'custom' ? <CustomDesign design={{ ...design, shape: snapshot.shape }} apply={next => { apply(next); setNotice(copy.applied); back(); }}
            discard={() => { setNotice(copy.discarded); back(); }} />
          : <FocusContent focus={route} snapshot={snapshot} port={focusPort} />}
      </NumberedPanel>
    </>}
  </div>;
}
