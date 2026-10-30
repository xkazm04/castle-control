import { useState } from 'react';
import type { Theme } from '@castle-control/tokens';
import { Plate, PlateBand, PlateBody, PlateActions } from '../src/heraldic-plate.jsx';
import { StageFrame } from '../src/heraldic-stage.jsx';
import { HeraldicCard, CardHead, CardBody, CardCopy, CardSide } from '../src/heraldic-card.jsx';
import { HeroReadout, MedalList, Medal, NumberedDiscs } from '../src/heraldic-readout.jsx';
import { SectionHeading } from '../src/heraldic-heading.jsx';
import { Pennant, Ribbon, ShieldCharge } from '../src/heraldic-marks.jsx';
import { RuledFeed, RuledRow } from '../src/heraldic-feed.jsx';
import { FieldGroup } from '../src/heraldic-field.jsx';
import { InkButton } from '../src/primitives.jsx';
import { StatusChip } from '../src/chips.jsx';
import { SealButton } from '../src/seal-button.jsx';
import { ProposalCard } from '../src/proposal-card.jsx';
import { chambers } from '../src/shell.jsx';
import { WindowedRows, rowHeight } from '../src/windowed-rows.jsx';
import type { PrintInk } from '../src/heraldic-options.js';
import './heraldic-gallery.css';
import '../src/heraldic-buttons.css';
import '../src/heraldic-stamp.css';

const inks = ['gules', 'azure', 'or', 'key'] as const;
const entries = Array.from({ length: 10000 }, (_, id) => ({ id: String(id), title: `Generated event ${id + 1}` }));
const noop = () => undefined;

function InkSheet({ ink }: { ink: typeof inks[number] }) {
  const [selected, setSelected] = useState('first');
  const [notice, setNotice] = useState('Simulated controls only');
  const text_ink: PrintInk = ink === 'key' ? 'ink' : `${ink}-text`;
  return <section className="cc-heraldic-sheet" aria-label={`${ink} primitives`}>
    <SectionHeading variant="banner" title={`${ink} print`} gloss="Shared heraldic vocabulary" count="Simulated" ink={ink} />
    <Plate ink={ink} offset="space-6" style={{ '--cc-band-text': ink === 'key' ? 'var(--paper)' : 'var(--press)' }}
      band={<PlateBand title="Primary plate" gloss="Plain function" count="3" count_label="Generated" />}>
      <PlateBody><StageFrame ink={ink}><HeroReadout value="87" caption="Generated entries" ink={ink} ghost="overprint" />
        <MedalList><Medal value="3" label="Selected" detail="Simulated" ink={ink} /></MedalList></StageFrame></PlateBody>
      <PlateBody><PlateActions><InkButton size="big" variant="pass" ink={ink} style={{ '--cc-button-text': ink === 'key' ? 'var(--paper)' : 'var(--press)' }} onClick={() => setNotice('Preview selected')}>Preview</InkButton>
        <InkButton size="big" variant="bar" onClick={() => setNotice('Preview dismissed')}>Dismiss</InkButton></PlateActions></PlateBody>
    </Plate>
    <div className="cc-heraldic-choices" role="radiogroup" aria-label={`${ink} example choices`}>
      {['first', 'second'].map(id => <Plate key={id} selection="radio" variant="choice" ink={ink} checked={selected === id}
        tabIndex={selected === id ? 0 : -1} onClick={() => setSelected(id)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'first' : event.key === 'End' ? 'second' : selected === 'first' ? 'second' : 'first';
          setSelected(next);
          const group = event.currentTarget.parentElement;
          group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next === 'first' ? 0 : 1]?.focus();
        }} style={{ '--cc-band-text': ink === 'key' ? 'var(--paper)' : 'var(--press)' }}>
        <PlateBand variant="chief" title={id} count={selected === id ? 'Selected' : 'Choose'} />
        <HeroReadout as="span" value="39" unit="%" caption="Current intensity" ink={ink} scale="numeric" ghost="none" />
      </Plate>)}
    </div>
    <HeraldicCard variant="selectable" selected on_select={noop} ink={ink}>
      <ShieldCharge charge="question" /><CardCopy title="Generated card" meta="Selection preview" reasons={['Local example only']} />
      <CardSide action="Draft"><StatusChip variant="dash" stamp="verdict" tone="ok">OK</StatusChip></CardSide>
    </HeraldicCard>
    <HeraldicCard variant="raised" ink={ink}><SectionHeading title="Secondary card" gloss="Raised" />
      <div className="cc-heraldic-samples"><ShieldCharge charge="cup" /><ShieldCharge charge="struck-coin" /></div></HeraldicCard>
    <HeraldicCard tone="seal" ink={ink}><SectionHeading title="Dashed card" gloss="Proposed only" />
      <ProposalCard compact proposal={{ id: `sample-${ink}`, chamber: chambers[0].id, kind: 'seal', title: 'Generated proposal', revision: 1,
        state: 'drafted', fields: [{ key: 'sample', label: 'Sample', value: 3, struck: [] }] }} on_seal={() => setNotice('Simulated seal')} on_tear={() => setNotice('Simulated tear')} />
    </HeraldicCard>
    <HeraldicCard variant="panel"><CardHead title="Carded panel" gloss="Plain secondary level" /><CardBody>
      <StageFrame variant="print"><HeroReadout value="4" unit="s" caption="Applied value" caption_style="label" ghost="none" /></StageFrame>
    </CardBody></HeraldicCard>
    <Plate variant="plain" ink={ink} band={<PlateBand variant="bench" title="Workbench" count="Local preview" />}><PlateBody>Plain plate with a fixed press band</PlateBody></Plate>
    <Plate ink={ink} border_ink="rule" style={{ '--cc-band-text': ink === 'key' ? 'var(--paper)' : 'var(--press)' }} band={<PlateBand variant="hero" title="Selected item" count="Sample" />}>
      <PlateBody><HeroReadout value="I2" caption="Selected item" ink={ink} /></PlateBody></Plate>
    <Plate variant="plain" border_ink="rule" band={<PlateBand variant="seal" title="Proposal awaiting seal" />}><PlateBody>Nothing acts without a seal.</PlateBody></Plate>
    <div className="cc-heraldic-samples">{[false, true].map(current => <HeraldicCard key={String(current)} variant="tablet" current={current} locked={!current} selected={current} on_select={noop}>
      <b>{current ? 'Current' : 'Locked'}</b><i>Simulated stage</i></HeraldicCard>)}</div>
    <div className="cc-heraldic-samples"><StatusChip variant="dash" stamp="label">Sample</StatusChip>
      <StatusChip variant="azure" stamp="mode" ink={ink} style={{ '--cc-stamp-text': `var(--${text_ink})` }}>Watching</StatusChip>
      <StatusChip variant="azure" stamp="mode" tone="solid" ink={ink}>Armed</StatusChip>
      <StatusChip variant="dash" stamp="draft">Draft</StatusChip>
      <Pennant word="Sample group" ink={ink} /><Pennant word="Sample group" ink={ink} count="8" variant="standing" />
    </div>
    <Ribbon label="Guardrails" word="OK" note="Local preview" />
    <NumberedDiscs items={[{ id: 'first', title: 'First', description: 'Prepare' }, { id: 'second', title: 'Second', description: 'Check' },
      { id: 'third', title: 'Third', description: 'Confirm' }, { id: 'fourth', title: 'Fourth', description: 'Publish' }]} />
    <SectionHeading title="Ruled heading" gloss="Plain function" count="10,000" variant="ruled" />
    <SectionHeading title="Inline heading" gloss="Plain function" variant="inline" />
    <RuledFeed><WindowedRows rows={entries} row_key={row => row.id} row_height={rowHeight * 1.5} label={`${ink} generated feed`}>
      {row => <RuledRow layout="amount" mark="1" trailing="12:00" detail="Generated detail">{row.title}</RuledRow>}
    </WindowedRows></RuledFeed>
    <RuledFeed><WindowedRows rows={entries} row_key={row => row.id} label={`${ink} generated lines`}>
      {row => <RuledRow mark={<Pennant word="Held" ink={ink} />} trailing="12:00">{row.title}</RuledRow>}
    </WindowedRows></RuledFeed>
    <RuledFeed><WindowedRows rows={entries} row_key={row => row.id} row_height={rowHeight * 4} label={`${ink} generated ledger`}>
      {row => <RuledRow layout="entry" mark="Recorded" trailing="12:00" detail="Original generated message" actions={<InkButton size="room">Inspect</InkButton>}>{row.title}</RuledRow>}
    </WindowedRows></RuledFeed>
    <div className="cc-heraldic-samples"><InkButton size="room">Room size</InkButton><InkButton size="wrap" variant="offset" ink={ink} style={{ '--cc-button-text': ink === 'key' ? 'var(--paper)' : 'var(--press)' }}>Plate button</InkButton>
      <SealButton size="large" on_seal={() => setNotice('Simulated hold completed')} /></div>
    <FieldGroup label="Find a generated item" control_id={`field-${ink}`} hint="Generated data only"><input id={`field-${ink}`} placeholder="sample" /></FieldGroup>
    <p role="status">{notice}</p>
  </section>;
}

export default function HeraldicGallery({ theme }: { theme: Theme }) {
  return <section id={`heraldic-${theme}`} aria-label={`${theme} heraldic kit`}>
    <h2>Heraldic kit · {theme} · simulated</h2>
    <div className="cc-heraldic-gallery">{inks.map(ink => <InkSheet ink={ink} key={ink} />)}</div>
  </section>;
}
