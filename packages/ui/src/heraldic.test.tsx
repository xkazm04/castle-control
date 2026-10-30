import { readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Plate, PlateBand, PlateBody, PlateActions, StageFrame, HeraldicCard, CardHead, CardBody,
  HeroReadout, Medal, MedalList, NumberedDiscs, RuledFeed, RuledRow, SectionHeading, Pennant, Ribbon,
  ShieldCharge, FieldGroup, InkButton, StatusChip, ProposalCard, SealButton, NumberedPanel,
  WindowedRows, rowHeight } from './index.js';
import { ThemeFrame } from './primitives.jsx';
import HeraldicGallery from '../kit/heraldic-gallery.jsx';
import { ProposalQueue } from './steward/queue.js';
import { SimulatedSteward } from './steward/simulated.js';

test('plate vocabulary, ink and offset are explicit and radio selection is accessible', () => {
  const html = render(<><Plate ink="or" offset="space-8" selection="radio" checked aria-label="Generated plate">
    <PlateBand variant="chief" title="Generated" gloss="Sample" count="3" />
    <PlateBody as="span">Content</PlateBody>
  </Plate><PlateActions>Actions</PlateActions></>);
  for (const value of ['cc-plate', 'cc-offset-shadow', 'cc-plate-band', 'cc-plate-body', 'cc-plate-actions',
    '--cc-ink:var(--or)', '--cc-shadow-offset:var(--space-8)', 'role="radio"', 'aria-checked="true"', 'Generated']) expect(html).toContain(value);
  expect(render(<Plate>Static</Plate>)).toContain('<section');
  expect(render(<Plate selection="radio" checked={false}>Other</Plate>)).toContain('aria-checked="false"');
});

test('stage retains four decorative crop corners and cards expose opt-in levels', () => {
  const frame = render(<StageFrame ink="gules" variant="stage">Content</StageFrame>);
  expect(frame.match(/class="cc-crop"/g)).toHaveLength(4);
  for (const corner of ['tl', 'tr', 'bl', 'br']) expect(frame).toContain(`data-corner="${corner}"`);
  const card = render(<HeraldicCard variant="selectable" selected ink="azure" offset="space-4" on_select={() => undefined}>
    <ShieldCharge charge="question" /><b>Choose this</b>
  </HeraldicCard>);
  for (const value of ['<button', 'cc-card', 'cc-offset-shadow', 'aria-pressed="true"', 'data-selected="true"', '--cc-shadow-offset:var(--space-4)']) expect(card).toContain(value);
  expect(render(<HeraldicCard variant="panel"><CardHead title="Heading" /><CardBody>Body</CardBody></HeraldicCard>)).toContain('cc-card-head');
});

test('readouts, discs and section headings render caller figures and ghosts', () => {
  const html = render(<><HeroReadout value="87" caption="Generated entries" ink="gules" scale="viewport" />
    <MedalList><Medal value="3" label="Selected" detail="Sample" ink="or" /></MedalList>
    <NumberedDiscs items={[{ id: 'first', title: 'First', description: 'Generated step' }]} />
    <SectionHeading title="A heading" gloss="Plain function" count="4" ink="azure" variant="banner" /></>);
  for (const value of ['cc-hero-readout', 'data-text="87"', 'cc-medal-disc', 'cc-numbered-discs', 'cc-section-heading',
    'Generated entries', 'Selected', 'Generated step', 'data-text="A heading"', 'Plain function']) expect(html).toContain(value);
});

test('stamps, pennants, ribbons and shield charges retain words and decorative marks', () => {
  for (const stamp of ['label', 'mode', 'verdict', 'draft'] as const) {
    const html = render(<StatusChip variant="azure" stamp={stamp} ink="azure">Watching</StatusChip>);
    expect(html).toContain('cc-stamp'); expect(html).toContain('Watching');
  }
  for (const variant of ['flag', 'standing'] as const) {
    const html = render(<Pennant word="Sample group" variant={variant} ink="gules" count="8" />);
    expect(html).toContain('cc-pennant'); expect(html).toContain('Sample group');
  }
  expect(render(<Ribbon label="Guardrails" word="OK" note="Local preview" />)).toContain('OK');
  for (const charge of ['question', 'cup', 'struck-coin'] as const) {
    const html = render(<ShieldCharge charge={charge} />);
    expect(html).toContain('cc-shield'); expect(html).toContain('aria-hidden="true"');
  }
  expect(() => render(<Pennant word=" " />)).toThrow('word');
  expect(() => render(<StatusChip variant="dash" stamp="label"> </StatusChip>)).toThrow('word');
});

test('fixed ruled feed rows fit a bounded window without nesting table rows', () => {
  const rows = Array.from({ length: 10000 }, (_, id) => id);
  for (const scroll_top of [0, 5000 * rowHeight * 1.5, 10000 * rowHeight * 1.5]) {
    const html = render(<RuledFeed><WindowedRows rows={rows} label="Generated feed" row_key={String} row_height={rowHeight * 1.5} scroll_top={scroll_top}>
      {id => <RuledRow layout="amount" mark={id} trailing="12:00" detail="Generated detail">Sample event</RuledRow>}
    </WindowedRows></RuledFeed>);
    expect(html).toContain('cc-feed'); expect(html).toContain('cc-ruled-row');
    expect(html).toContain('aria-rowcount="10000"');
    expect(html.match(/role="row"/g)).toHaveLength(13);
    expect(html).toContain('role="presentation"');
  }
});

test('compact proposal keeps revision and authorization actions but no fields', async () => {
  const queue = new ProposalQueue();
  await new SimulatedSteward(queue).ask('draft a question draw', { surface: 'room' });
  const proposal = queue.pending()[0];
  if (!proposal) throw new Error('Missing generated proposal');
  const props = { proposal, on_seal: () => undefined, on_tear: () => undefined };
  const full = render(<ProposalCard {...props} />);
  const compact = render(<ProposalCard {...props} compact />);
  expect(full).toContain('<dl>'); expect(full).not.toContain('data-compact');
  expect(compact).not.toContain('<dl>'); expect(compact).not.toContain('cc-proposal-field');
  for (const value of [proposal.title, 'Rev 1', 'Hold to seal', 'Tear it up']) expect(compact).toContain(value);
});

test('existing component defaults keep their exact markup vocabulary', () => {
  expect(render(<InkButton>Action</InkButton>)).toBe('<button type="button" class="cc-button " data-variant="outline" data-size="normal">Action</button>');
  expect(render(<StatusChip variant="dash">Sample</StatusChip>)).toBe('<span class="cc-chip" data-variant="dash">Sample</span>');
  const seal = render(<SealButton on_seal={() => undefined} />);
  expect(seal).toContain('class="cc-seal-button"'); expect(seal).not.toContain('data-size');
  expect(render(<SealButton on_seal={() => undefined} size="large" />)).toContain('data-size="large"');
  const panel = render(<NumberedPanel number="1" title="Sample">Body</NumberedPanel>);
  expect(panel).toContain('class="cc-panel"'); expect(panel).not.toContain('cc-card');
  expect(render(<FieldGroup label="Find" control_id="sample" hint="Generated hint"><input id="sample" /></FieldGroup>)).toContain('for="sample"');
});

test('heraldic sources stay generic and opt-in button rules outrank the shell default', () => {
  const names = readdirSync(new URL('.', import.meta.url)).filter(name => name.startsWith('heraldic') && !name.endsWith('.test.tsx'));
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(readFileSync(new URL(name, import.meta.url), 'utf8')).not.toMatch(/\b(?:lottery|moderator|visuals|studio|urn|hexfield|moat)\b/);
  const css = readFileSync(new URL('heraldic-buttons.css', import.meta.url), 'utf8');
  expect(css).toContain('.cc-button.cc-heraldic-button[data-size]');
  for (const property of ['font:', 'border:', 'background:', 'color:', 'padding:']) expect(css).toContain(property);
});

test.each(['paper', 'stock'] as const)('deferred gallery shows every primitive in four inks on %s', theme => {
  const html = render(<ThemeFrame theme={theme}><HeraldicGallery theme={theme} /></ThemeFrame>);
  expect(html).toContain(`id="heraldic-${theme}"`);
  for (const ink of ['gules', 'azure', 'or', 'key']) expect(html).toContain(`aria-label="${ink} primitives"`);
  for (const name of ['cc-plate', 'cc-stage', 'cc-card', 'cc-card-head', 'cc-card-body', 'cc-card-copy', 'cc-card-side', 'cc-stamp', 'cc-hero-readout', 'cc-medal', 'cc-numbered-discs',
    'cc-feed', 'cc-section-heading', 'cc-pennant', 'cc-ribbon', 'cc-shield', 'cc-field', 'cc-proposal-card']) expect(html).toContain(name);
});

test('all opt-in button sizes render their vocabulary and print properties', () => {
  for (const size of ['room', 'big', 'wrap'] as const) {
    const html = render(<InkButton size={size} variant="offset" ink="or" offset="space-8" shadow_ink="key">Sample</InkButton>);
    for (const value of ['cc-heraldic-button', 'cc-offset-shadow', '--cc-ink:var(--or)', '--cc-shadow-offset:var(--space-8)',
      '--cc-shadow-ink:var(--key)', `data-size="${size}"`]) expect(html).toContain(value);
  }
});
