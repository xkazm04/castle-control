import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { ChambersColumn, ConnectionMark, EmptyState, GatehouseChip, InkButton, KitShell, Mark, NumberedPanel,
  PageHeader, Rampart, RuleTable, StatusChip, ThemeFrame, ThemeToggle, chambers, chipVariants, keymap, verdicts, VerdictChip } from './index.js';
import type { InkButtonProps, RampartProps, RuleRow } from './index.js';
import { visibleRange } from './rule-table.jsx';

const noop = () => undefined;
const rampart: RampartProps = {
  on_air: true, viewers: '214', uptime: '02:14:37', twitch: 'connected', obs: 'connected',
  armed: 0, watching: 3, shield: false, home_href: '#home', gatehouse_href: '#moderator', theme: 'paper', on_theme_change: noop,
};
const click = (element: ReactElement<InkButtonProps>) => element.props.onClick?.({} as MouseEvent<HTMLButtonElement>);

test('rampart status groups retain their gaps and reclaim unused brand width at the compact breakpoint', () => {
  const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  const groups = css.match(/\.cc-live-group, \.cc-link-group\s*\{([^}]+)\}/)?.[1];
  expect(groups).toMatch(/gap:\s*var\(--space-12\)/);
  // A shrinking group lets its non-wrapping contents paint into the next group.
  expect(groups).toMatch(/flex:\s*none\s*;/);
  const compact = css.slice(css.indexOf('@media (max-width: 1420px)'));
  expect(compact).toMatch(/\.cc-rampart\s*\{[^}]*gap:\s*var\(--space-11\)/);
  expect(compact).toMatch(/\.cc-brand\s*\{[^}]*width:\s*auto\s*;/);
});

describe.each(['paper', 'stock'] as const)('%s theme', theme => {
  const render = (node: ReactNode) => renderToStaticMarkup(<ThemeFrame theme={theme}>{node}</ThemeFrame>);

  test('real shell preserves navigation, labels and section semantics', () => {
    const html = render(<KitShell rampart={<Rampart {...rampart} theme={theme} data_kind="simulated" />}
      navigation={<ChambersColumn current="moderator" links={chambers.map(item => ({ id: item.id, href: `#${item.id}`, figure: 'simulated' }))}
        home_href="#home" brand_href="#brand" summary="Simulated room" />}>
      <PageHeader number={2} title="Gatehouse" description="AI moderator" breadcrumbs={[{ label: 'Drill', href: '#drill' }, { label: 'Run' }]}
        actions={<InkButton>Run</InkButton>} />
      <NumberedPanel number="2.1" title="Live room" gloss="Chat verdicts" meta="3 held"><VerdictChip verdict="hold" /></NumberedPanel>
    </KitShell>);
    expect(html).toContain(`data-theme="${theme}"`);
    for (const text of ['On air', '214', '02:14:37', 'Twitch: connected', 'OBS: connected', 'Simulated', 'Armed', 'Watching', 'Chamber 2 of 4', 'Live room', 'Chat verdicts']) {
      // Armed appears in the moderator's accessible explanation, even in shadow.
      expect(html.toLowerCase()).toContain(text.toLowerCase());
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    for (const chamber of chambers) expect(html).toContain(chamber.name);
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('href="#drill"');
  });

  test.each(chipVariants)('status chip %s', variant => {
    const html = render(<StatusChip variant={variant}>Signal</StatusChip>);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(html).toContain('Signal');
  });

  test.each(verdicts)('verdict %s includes readable outcome and decorative icon', verdict => {
    const html = render(<VerdictChip verdict={verdict} />);
    expect(html).toContain(`data-verdict="${verdict}"`);
    expect(html).toContain({ pass: 'Released', hold: 'Held for review', bar: 'Removed' }[verdict]);
    expect(html).toContain('aria-hidden="true"');
  });

  test.each(['connected', 'reconnecting', 'down'] as const)('connection state %s', state => {
    for (const name of ['Twitch', 'OBS'] as const) {
      const html = render(<ConnectionMark name={name} state={state} />);
      expect(html).toContain(`aria-label="${name}: ${state === 'down' ? 'disconnected' : state}"`);
    }
  });

  test('offline never shows stale live numbers; sample, simulated and live labels are distinct', () => {
    const offline = render(<Rampart {...rampart} on_air={false} data_kind="sample" />);
    expect(offline).toContain('Offline');
    expect(offline).not.toContain('214');
    expect(offline).not.toContain('02:14:37');
    expect(offline).toContain('Sample data');
    expect(render(<Rampart {...rampart} />)).not.toContain('cc-sample');
    expect(render(<Rampart {...rampart} data_kind="simulated" />)).toContain('Simulated');
  });

  test.each([[0, 0], [0, 3], [2, 0], [2, 3]])('moderation counts %i/%i with and without Shield Mode', (armed, watching) => {
    for (const shield of [false, true]) {
      const html = render(<GatehouseChip armed={armed} watching={watching} shield={shield} href="#moderator" />);
      expect(html.includes('cc-gatehouse-armed')).toBe(armed > 0);
      expect(html.includes('cc-gatehouse-watching')).toBe(watching > 0 || armed === 0);
      expect(html.includes('cc-gatehouse-shield')).toBe(shield);
      expect(html).toContain(`${armed} rules armed`);
      expect(html).toContain(`${watching} watching`);
    }
  });

  test.each(['outline', 'primary', 'plate', 'ghost', 'danger'] as const)('ink button %s supports native disabled and size states', variant => {
    for (const size of ['normal', 'small', 'icon'] as const) {
      const html = render(<InkButton variant={variant} size={size} disabled>Action</InkButton>);
      expect(html).toContain('disabled=""');
      expect(html).toContain(`data-variant="${variant}"`);
      expect(html).toContain(`data-size="${size}"`);
      expect(html).toContain('type="button"');
    }
  });

  test('theme toggle calls the owner without changing external state', () => {
    const changes: string[] = [];
    const element = ThemeToggle({ theme, onChange: value => changes.push(value) });
    expect(element.props['aria-pressed']).toBe(theme === 'stock');
    click(element);
    expect(changes).toEqual([theme === 'stock' ? 'paper' : 'stock']);
  });

  test('mark and empty states are accessible; optional actions remain usable', () => {
    expect(render(<Mark />)).toContain('role="img"');
    const html = render(<EmptyState title="No lots in the urn yet" description="Open a draw to collect entries."><InkButton>Open</InkButton></EmptyState>);
    expect(html).toContain('role="status"');
    expect(html).toContain('No lots in the urn yet');
    expect(html).toContain('Open a draw');
    expect(html).toContain('>Open</button>');
    expect(render(<EmptyState title="Clear" description="Nothing pending" />)).not.toContain('<button');
  });

  test('rule table covers shadow, armed and empty states and windows large fixtures', () => {
    const rules: RuleRow[] = Array.from({ length: 10000 }, (_, index) => ({
      id: `simulated-${index}`, name: `Simulated rule ${index}`, match: 'Generated pattern', action: 'Hold', mode: index % 2 === 0 ? 'shadow' : 'armed',
    }));
    const html = render(<RuleTable rules={rules} onModeChange={noop} />);
    expect(html).toContain('aria-rowcount="10001"');
    expect(html).toContain('Watching, reports only');
    expect(html).toContain('Armed, acts');
    expect(html).not.toContain('Simulated rule 9999');
    expect((html.match(/aria-rowindex=/g) ?? []).length).toBeLessThan(20);
    expect(render(<RuleTable rules={[]} onModeChange={noop} />)).toContain('No rules configured');
  });
});

test('virtualisation preserves total height and reaches the last row with bounded windows', () => {
  for (const total of [0, 1, 10, 10000]) for (const offset of [0, 320, 319680, 999999]) {
    const range = visibleRange(total, offset);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBeLessThanOrEqual(total);
    expect(range.end - range.start).toBeLessThanOrEqual(16);
    expect(range.before + range.after + (range.end - range.start) * 32).toBe(total * 32);
  }
  expect(visibleRange(10000, 319680).end).toBe(10000);
});

test('single keymap has no conflicts and every chamber and Steward has one shortcut', () => {
  expect(new Set(keymap.map(binding => binding.key)).size).toBe(keymap.length);
  expect(keymap.map(binding => binding.key)).toEqual(['0', '1', '2', '3', '4', 'Escape', '/', 'Enter', 'Delete', ' ']);
});
