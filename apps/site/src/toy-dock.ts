import { artHooks } from '@castle-control/keep-art';
import { element } from './dom.ts';
import { level } from './machine.ts';
import type { State } from './machine.ts';
import type { ChamberId } from './route.ts';
import { makeStamp } from './stamp.ts';
import { band, claimPaints, curve, cycleHex, draw, houses, initialClaims, readLine, tallyHex } from './toys.ts';

export function buildToyDock(host: HTMLElement, castle: HTMLElement, reduced: () => boolean, seed?: string) {
  const document = host.ownerDocument;
  host.dataset['role'] = 'toy';
  let wheel = castle.querySelector<SVGElement>(`#${artHooks.lotWheel}`)!;
  let flame = castle.querySelector<SVGElement>(`#${artHooks.altarFlame}`)!;
  let hexGroup = castle.querySelector<SVGElement>(`#${artHooks.hexes}`)!;
  let hexes = [...castle.querySelectorAll<SVGElement>(`.${artHooks.hex}`)];
  let stacked = false;
  const claims = initialClaims();
  let room: State['room'] = null, rotation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => void) | undefined;
  const history: string[] = [];
  const panels = new Map<ChamberId, HTMLElement>();
  let mapControls: HTMLElement | undefined;
  const mapButtons: HTMLButtonElement[] = [];

  function panel(id: ChamberId, title: string, note: string, simulated = false) {
    const node = element(document, 'div', { cls: 'toy-panel' }); node.hidden = true;
    node.dataset['room'] = id;
    const label = element(document, 'div', { cls: 'tlab' });
    label.append(element(document, 'b', { role: 'toy-title', text: title }),
      makeStamp(document, simulated ? 'simulated' : 'sample'), element(document, 'small', { role: 'toy-note', text: note }));
    const out = element(document, 'div', { cls: 'out' }); out.setAttribute('aria-live', 'polite');
    out.setAttribute('role', 'group'); out.setAttribute('aria-label', `${title}: result and explanation`);
    const result = element(document, 'div', { cls: 'big', role: 'toy-result' });
    const proof = element(document, 'div', { cls: 'proof', role: 'toy-proof' });
    const claim = element(document, 'div', { cls: 'claim', role: 'toy-claim' });
    out.append(result, proof, claim); node.append(label, out); host.append(node); panels.set(id, node);
    return { node, label, out, result, proof, claim };
  }
  function inputForm(node: HTMLElement, id: string, name: string, value: string, action: string, limit: number) {
    const form = element(document, 'form', { cls: 'ctl' }); form.autocomplete = 'off';
    const label = element(document, 'label', { cls: 'sr', text: name }); label.htmlFor = id;
    const input = element(document, 'input', { id, role: 'toy-input' });
    input.type = 'text'; input.value = value; input.maxLength = limit;
    const go = element(document, 'button', { cls: 'go', role: 'toy-go', text: action }); go.type = 'submit';
    form.append(label, input, go); node.insertBefore(form, node.lastChild);
    return { form, input, go };
  }
  function impression(out: HTMLElement, kind: 'sealed' | 'held' | 'pass', word?: string) {
    const slot = element(document, 'span', { cls: 'stampslot toy-impression' });
    const stamp = makeStamp(document, kind, word); slot.hidden = true;
    const bleed = element(document, 'span', { cls: 'toy-bleed' }); bleed.setAttribute('aria-hidden', 'true');
    bleed.style.setProperty('--bleed-ink', kind === 'sealed' ? 'var(--or)' : `var(--${kind === 'held' ? 'gules' : 'azure'})`);
    slot.append(stamp, bleed); out.append(slot);
    return { slot, show: (on: boolean): void => {
      slot.hidden = !on;
      if (on && !reduced()) stamp.dataset['land'] = '';
      else stamp.removeAttribute('data-land');
      slot.classList.toggle('print-again');
    } };
  }
  const lots = panel('lots', 'Try a draw', '12 invented handles on the wheel');
  const lotForm = inputForm(lots.node, 'seed', 'Seed word', 'lanterns', 'Draw', 40);
  lots.proof.textContent = 'Same word, same winner. Try it twice.';
  lots.claim.textContent = 'Decided by code. The animation only shows it.';
  const drawn = impression(lots.out, 'sealed', 'Drawn');
  const recent = element(document, 'div', { cls: 'hist', role: 'toy-history' }); lots.out.append(recent);

  function startDraw(): void {
    if (pending) return;
    // The pure decision and proof exist before any wheel style changes.
    const decision = draw(lotForm.input.value);
    if ('refusal' in decision) { lots.proof.textContent = decision.refusal; return; }
    lots.proof.textContent = decision.proof; lots.proof.title = decision.proof; drawn.show(false);
    lots.result.textContent = 'Turning…'; lotForm.go.disabled = true;
    const target = -(decision.index * 30 + 15);
    let delta = ((target - rotation) % 360 + 360) % 360;
    if (delta < 30) delta += 360;
    rotation += delta + (reduced() ? 0 : 1080);
    wheel.style.transition = reduced() ? 'none' : 'transform 2200ms cubic-bezier(.12,.62,.16,1)';
    wheel.style.transform = `rotate(${rotation}deg)`;
    pending = (): void => {
      lots.result.textContent = decision.winner;
      lots.result.classList.toggle('slip', !reduced()); lots.result.classList.toggle('slip-again');
      drawn.show(true); history.unshift(`${decision.seed} → ${decision.winner}`); history.length = Math.min(3, history.length);
      recent.textContent = history.join('   ·   '); lotForm.go.disabled = false; pending = undefined; timer = undefined;
    };
    if (reduced()) pending(); else timer = setTimeout(() => pending?.(), 2200);
  }
  lotForm.form.addEventListener('submit', (event) => { event.preventDefault(); startDraw(); });

  const gate = panel('gate', 'Test a line', 'Sample rules, not the AI. Nothing is sent.', true);
  const gateForm = inputForm(gate.node, 'line', 'A chat line', 'check my guide at example.com', 'Read it', 120);
  gate.proof.textContent = 'Links, shouting and blocked sample terms are held for a human.';
  gate.claim.textContent = 'Held lines never reach the stream, a draw, a vote or a consensus.';
  const held = impression(gate.out, 'held'), pass = impression(gate.out, 'pass');
  gateForm.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const verdict = readLine(gateForm.input.value), blocked = verdict.verdict === 'HELD';
    gate.result.textContent = blocked ? 'Held · not on air' : 'Pass';
    gate.result.style.color = blocked ? 'var(--gules-text)' : 'var(--azure-text)';
    gate.proof.textContent = verdict.reason; held.show(blocked); pass.show(!blocked);
  });

  const beacons = panel('beacons', 'Test fire', 'Offering Altar · kindling curve', true);
  const control = element(document, 'div', { cls: 'ctl' });
  const gifts = element(document, 'label'); gifts.htmlFor = 'gifts';
  const range = element(document, 'input', { id: 'gifts', role: 'toy-input' });
  range.type = 'range'; range.min = '0'; range.max = '120'; range.step = '1'; range.value = '18';
  control.append(gifts, range); beacons.node.insertBefore(control, beacons.out);
  beacons.claim.textContent = 'Money changes how it looks, never what it decides.';
  function blaze(): void {
    const n = Number(range.value), p = Math.round(curve(n));
    gifts.textContent = `Gifted subs: ${n}`; beacons.result.textContent = `${p}% blaze`;
    beacons.proof.textContent = band(n);
    flame.style.transformBox = 'fill-box'; flame.style.transformOrigin = '50% 100%';
    flame.style.transition = reduced() ? 'none' : 'transform .35s cubic-bezier(.34,1.5,.5,1)';
    flame.style.transform = `scale(${(.35 + p / 100 * 1.15).toFixed(3)})`;
  }
  range.addEventListener('input', blaze);

  const map = panel('map', 'Claim a hex', 'Invented territory · local test only');
  map.result.classList.toggle('houses', true);
  const counts = ['Gules', 'Azure', 'Or'].map((house) => {
    const count = element(document, 'span'); count.style.color = `var(--${house.toLowerCase()}-text)`;
    map.result.append(count); return count;
  });
  map.proof.textContent = 'Click, Enter or Space: Gules, Azure, Or, then open ground.';
  map.claim.textContent = 'A design expressed as data. Bits never buy random outcomes.';
  function tally(): void { tallyHex(claims).forEach((n, index) => { counts[index]!.textContent = `${['Gules', 'Azure', 'Or'][index]} ${n}`; }); }
  function paint(index: number): void {
    const hex = hexes[index]!, claim = claims[index]!;
    hex.style.fill = `var(--${claimPaints[claim]})`;
    const label = `Hex ${index + 1}: ${houses[claim]}`;
    if (!stacked) hex.setAttribute('aria-label', label);
    const button = mapButtons[index];
    if (button) {
      button.setAttribute('aria-label', label);
      button.textContent = `${index + 1}\n${['Open', 'Gules', 'Azure', 'Or'][claim]}`;
      button.style.background = `var(--${claimPaints[claim]})`;
    }
  }
  function claimAt(index: number): void { claims[index] = cycleHex(claims[index]!); paint(index); tally(); }
  function claimHex(hex: Element | null): void {
    if (stacked || room !== 'map') return;
    const index = hexes.findIndex((node) => node === hex);
    if (index < 0) return;
    claimAt(index);
  }
  hexes.forEach((hex) => hex.addEventListener('click', () => claimHex(hex)));
  tally();
  function update(state: State): void {
    room = level(state) > 0 ? state.room : null;
    host.hidden = stacked || room === null || room === 'steward';
    host.classList.toggle('on', !host.hidden);
    for (const [id, node] of panels) node.hidden = !stacked && id !== room;
    hexGroup.classList.toggle('live', !stacked && room === 'map');
    hexes.forEach((hex, index) => {
      if (!stacked && room === 'map') { hex.setAttribute('role', 'button'); hex.setAttribute('tabindex', '0'); paint(index); }
      else { hex.removeAttribute('role'); hex.removeAttribute('tabindex'); hex.removeAttribute('aria-label'); }
    });
    if (stacked || room === 'beacons') blaze();
    if (reduced() && pending) { clearTimeout(timer); wheel.style.transition = 'none'; pending(); }
    if (seed !== undefined) {
      if (stacked || room === 'lots') { lotForm.input.value = seed; startDraw(); }
      seed = undefined;
    }
  }
  function present(scenes?: ReadonlyMap<ChamberId, HTMLElement>, hosts?: ReadonlyMap<ChamberId, HTMLElement>): void {
    stacked = scenes !== undefined;
    const find = (id: ChamberId, hook: string): SVGElement => scenes
      ? scenes.get(id)!.querySelector<SVGElement>(`#stacked-${id}-${hook}`)!
      : castle.querySelector<SVGElement>(`#${hook}`)!;
    const nextWheel = find('lots', artHooks.lotWheel);
    nextWheel.style.transform = wheel.style.transform;
    nextWheel.style.transition = reduced() ? 'none' : wheel.style.transition;
    wheel = nextWheel; flame = find('beacons', artHooks.altarFlame); hexGroup = find('map', artHooks.hexes);
    hexes = [...(scenes?.get('map') ?? castle).querySelectorAll<SVGElement>(`.${artHooks.hex}`)];
    for (const [id, panel] of panels) (hosts?.get(id) ?? host).append(panel);
    if (stacked) {
      if (!mapControls) {
        mapControls = element(document, 'div', { cls: 'stacked-hexes' });
        mapControls.setAttribute('role', 'group'); mapControls.setAttribute('aria-label', 'Claim sample territory');
        claims.forEach((_claim, index) => {
          const button = element(document, 'button'); button.type = 'button';
          button.addEventListener('click', () => claimAt(index)); mapButtons.push(button); mapControls!.append(button);
        });
      }
      map.node.append(mapControls);
    } else mapControls?.remove();
    hexes.forEach((_hex, index) => paint(index));
  }
  return { update, present, claimHex,
    liveHex: (): boolean => !stacked && room === 'map' && hexes.some((hex) => hex === document.activeElement) };
}
