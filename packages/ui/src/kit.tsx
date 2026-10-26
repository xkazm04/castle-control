import { lazy, Suspense, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Theme } from '@castle-control/tokens';
import { ChambersColumn, EmptyState, GatehouseChip, InkButton, KitShell, Mark, NumberedPanel, PageHeader,
  Rampart, RuleTable, StatusChip, ThemeFrame, VerdictChip, chambers, chipVariants, keymap, verdicts } from './index.js';
import type { ConnectionState, ModuleId, RuleRow } from './index.js';
import './kit.css';

const PromotedGallery = lazy(() => import('./kit-promoted.jsx').then(module => ({ default: module.PromotedGallery })));

const initialRules: readonly RuleRow[] = [
  { id: 'links', name: 'Links', match: 'Unapproved links', action: 'Hold', mode: 'shadow' },
  { id: 'repeats', name: 'Repeats', match: 'Repeated lines', action: 'Warn', mode: 'shadow' },
  { id: 'caps', name: 'Caps', match: 'All capitals', action: 'Hold', mode: 'shadow' },
];

function KitTheme({ initial_theme }: { initial_theme: Theme }) {
  const [theme, setTheme] = useState(initial_theme);
  const [module, setModule] = useState<ModuleId>('moderator');
  const [live, setLive] = useState(true);
  const [twitch, setTwitch] = useState<ConnectionState>('connected');
  const [obs, setObs] = useState<ConnectionState>('connected');
  const [shield, setShield] = useState(false);
  const [rules, setRules] = useState(initialRules);
  const [notice, setNotice] = useState('Simulated controls only. No Twitch, OBS or model calls.');
  const current = chambers.find(item => item.id === module) ?? chambers[1];
  const armed = rules.filter(rule => rule.mode === 'armed').length;
  const nextConnection = (value: ConnectionState): ConnectionState => value === 'connected' ? 'reconnecting' : value === 'reconnecting' ? 'down' : 'connected';
  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const binding = keymap.find(item => item.key === event.key);
    if (!binding) return;
    event.preventDefault();
    if (binding.action === 'steward') setNotice('The Steward drafts a proposed change. Nothing happens until you seal it.');
    else setModule(binding.action);
  }
  return <section className="cc-kit-sheet" aria-label={`${initial_theme} theme kit, 1440 by 900`} onKeyDown={handleKey}>
    <ThemeFrame theme={theme} module={module}>
      <KitShell rampart={<Rampart on_air={live} viewers="214" uptime="02:14:37" twitch={twitch} obs={obs}
        armed={armed} watching={rules.length - armed} shield={shield} gatehouse_href={`#${initial_theme}-moderator`}
        home_href="#kit" theme={theme} on_theme_change={setTheme} data_kind="simulated"
        on_settings={() => setNotice('Use the simulated state controls below.')} on_steward={() => setNotice('The Steward drafts a writ; seal it to apply.')} />}
        navigation={<ChambersColumn current={module} on_navigate={setModule}
          links={chambers.map(item => ({ id: item.id, href: `#${initial_theme}-${item.id}`, figure: ({ lottery: '3 draws · 87 lots', moderator: '3 held · 3 watching', visuals: '3 lit · 24 events', studio: '12×8 hex · sand table' })[item.id] }))}
          home_href="#kit" brand_href="#kit" summary={<><b>214</b> viewers · <b>87</b> chatters / 10 min<br />Tier <b>M</b> · moat <b>4 s</b></>} />}>
        <PageHeader number={Number(current.number)} title={current.name} description={current.description}
          actions={<StatusChip variant="dash">Component kit</StatusChip>} />
        <div className="cc-kit-stack">
          <NumberedPanel number="0.1" title="State controls" gloss="simulated" meta={`${theme} · 1440×900`}>
            <div className="cc-kit-row">
              <InkButton onClick={() => setLive(!live)}>{live ? 'Go offline' : 'Go live'}</InkButton>
              <InkButton onClick={() => setTwitch(nextConnection(twitch))}>Twitch: {twitch}</InkButton>
              <InkButton onClick={() => setObs(nextConnection(obs))}>OBS: {obs}</InkButton>
              <InkButton variant="danger" onClick={() => setShield(!shield)}>{shield ? 'Lower drawbridge' : 'Raise drawbridge'}</InkButton>
            </div><p className="cc-kit-note" role="status">{notice}</p>
          </NumberedPanel>
          <NumberedPanel number="0.2" title="Verdicts and signals" gloss="released · review · removed">
            <div className="cc-kit-row">{verdicts.map(verdict => <VerdictChip key={verdict} verdict={verdict} />)}
              <GatehouseChip armed={2} watching={3} shield={false} href="#kit" />
              <GatehouseChip armed={0} watching={5} shield href="#kit" /></div>
            <div className="cc-kit-row">{chipVariants.map(variant => <StatusChip key={variant} variant={variant}>{variant}</StatusChip>)}</div>
          </NumberedPanel>
          <NumberedPanel number="0.3" title="The rules" gloss="watching reports only">
            <RuleTable rules={rules} onModeChange={(id, mode) => setRules(rows => rows.map(rule => rule.id === id ? { ...rule, mode } : rule))} />
          </NumberedPanel>
          <div className="cc-kit-columns">
            <NumberedPanel number="0.4" title="Ink buttons" meta={<Mark />}>
              <div className="cc-kit-row">{(['outline', 'primary', 'plate', 'ghost', 'danger'] as const).map(variant => <InkButton key={variant} variant={variant} onClick={() => setNotice(`${variant} button activated`)}>{variant}</InkButton>)}
                <InkButton disabled>Disabled</InkButton><InkButton size="small">Small</InkButton></div>
            </NumberedPanel>
            <NumberedPanel number="0.5" title="Empty state">
              <EmptyState title="The portcullis is clear" description="No messages are held for review." />
            </NumberedPanel>
          </div>
          <Suspense fallback={<p className="cc-kit-note">Loading component examples…</p>}><PromotedGallery /></Suspense>
          <p className="cc-kit-note">Generated, simulated fixtures. Working name. Not affiliated with Twitch. Focus a control to use 1–4 or /.</p>
        </div>
      </KitShell>
    </ThemeFrame>
  </section>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Kit root missing');
createRoot(root).render(<div id="kit"><KitTheme initial_theme="paper" /><KitTheme initial_theme="stock" /></div>);
