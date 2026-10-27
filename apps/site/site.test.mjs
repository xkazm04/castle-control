// Acceptance tests execute the actual script with a small DOM adapter.
// A controlled clock checks the real script without sleeping or browser paint.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('site.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('index.html', import.meta.url), 'utf8');
function fixture({ reduced = false, hash = '', start = 0 } = {}) {
  const elements = new Map();
  const events = new Map();
  const motionEvents = new Map();
  const timers = new Map();
  let now = start;
  let nextTimer = 0;
  let focused;
  function element(name) {
    if (elements.has(name)) return elements.get(name);
    const listeners = new Map();
    const children = new Map();
    const attributes = new Map();
    const node = {
      name, hidden: false, dataset: {}, isConnected: true, listeners, attributes,
      textContent: '',
      addEventListener: (event, callback) => listeners.set(event, callback),
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: (key) => attributes.delete(key),
      focus: () => { focused = node; },
      closest: () => false,
      contains: (target) => target === node,
      querySelector: (selector) => {
        if (!children.has(selector)) children.set(selector, element(`${name} ${selector}`));
        return children.get(selector);
      },
    };
    elements.set(name, node);
    return node;
  }
  const ids = ['lots','gate','beacons','map'];
  const links = ids.map((id) => {
    const link = element(`banner-${id}`);
    link.dataset.chamber = id;
    return link;
  });
  const motion = { matches: reduced, addEventListener: (event, callback) => motionEvents.set(event, callback) };
  const window = {
    location: { hash }, scrollY: 0,
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    matchMedia: () => motion, scrollTo: () => undefined,
    addEventListener: (event, callback) => events.set(`window:${event}`, callback),
  };
  const document = {
    body: element('body'), documentElement: element('html'),
    get activeElement() { return focused; },
    getElementById: element,
    querySelector: (selector) => {
      if (selector === '.banner a') return links[0];
      const match = /data-chamber="([^"]+)"/.exec(selector);
      return match ? links[ids.indexOf(match[1])] : element(selector);
    },
    querySelectorAll: () => links,
    addEventListener: (event, callback) => events.set(`document:${event}`, callback),
  };
  runInNewContext(source, { document, window, performance: { now: () => now } });
  const key = (value, target = element('target')) => {
    const event = { key: value, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    events.get('document:keydown')(event);
    return event;
  };
  const advance = (elapsed) => {
    const end = now + elapsed;
    for (;;) {
      const due = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end);
      if (!due) break;
      const [id, timer] = due;
      now = timer.at;
      timers.delete(id);
      timer.callback();
    }
    now = end;
  };
  const route = (value) => { window.location.hash = value; events.get('window:hashchange')(); };
  return { document, window, element, events, motion, motionEvents, key, route, links, advance,
    pending: () => timers.size, focused: () => focused };
}

test('unattended intro hands over at 2800 ms with a controlled clock', () => {
  const page = fixture();
  assert.equal(page.document.body.dataset.phase, 'printing');
  assert.equal(page.element('home').hidden, false);
  assert.equal(page.document.body.dataset.navigationReadyMs, '0');
  assert.equal(page.element('skip-intro').hidden, false);
  page.advance(2799);
  assert.equal(page.document.body.dataset.phase, 'printing');
  assert.equal(page.document.body.dataset.controlReadyMs, undefined);
  page.advance(1);
  const measured = Number(page.document.body.dataset.controlReadyMs);
  assert.equal(page.document.body.dataset.phase, 'done');
  assert.equal(measured, 2800);
  assert.ok(measured <= 4000);
  assert.equal(page.pending(), 0);
  console.log(`Controlled-clock visual handover: ${measured} ms; no real sleep.`);
});

test('late script startup respects the 4000 ms navigation deadline', () => {
  const page = fixture({ start: 2500 });
  page.advance(1499);
  assert.equal(page.document.body.dataset.phase, 'printing');
  page.advance(1);
  assert.equal(page.document.body.dataset.phase, 'done');
  assert.equal(Number(page.document.body.dataset.controlReadyMs), 4000);
});

test('skip is a named native button in the early keyboard tab order', () => {
  const button = /<button\b([^>]*\bid="skip-intro"[^>]*)>([^<]+)<\/button>/.exec(html);
  assert.ok(button, 'Real skip button');
  assert.match(button[1], /type="button"/);
  assert.doesNotMatch(button[1], /disabled|inert|tabindex="-1"/);
  assert.equal(button[2], 'Skip intro');
  assert.ok(button.index < html.indexOf('<header'), 'Skip is before the header and chamber links');
});

test('Tab keeps skip reachable; native Enter and Space activation finish and restore focus', () => {
  for (const activation of ['Enter', ' ']) {
    const page = fixture();
    const skip = page.element('skip-intro');
    assert.equal(page.key('Tab').defaultPrevented, false);
    assert.equal(skip.hidden, false, 'Tab must not hide the skip button');
    skip.focus();
    const event = page.key(activation, skip);
    assert.equal(event.defaultPrevented, false, 'Native button activation must not be cancelled');
    assert.equal(skip.hidden, false, 'Button must survive keydown until its native click');
    skip.listeners.get('click')();
    assert.equal(page.document.body.dataset.phase, 'done');
    assert.equal(skip.hidden, true);
    assert.equal(page.focused(), page.links[0]);
    assert.equal(page.pending(), 0);
    page.advance(4000);
    assert.equal(page.document.body.dataset.controlReadyMs, '0', 'Cancelled timer cannot repeat handover');
  }
});

test('skip survives pointerdown until click; other input and shortcuts finish immediately', () => {
  const keyboard = fixture(); keyboard.key('1');
  assert.equal(keyboard.document.body.dataset.phase, 'done');
  const pointer = fixture(); pointer.events.get('document:pointerdown')({ target: pointer.links[0] });
  assert.equal(pointer.document.body.dataset.phase, 'done');
  const skip = fixture();
  skip.events.get('document:pointerdown')({ target: skip.element('skip-intro') });
  assert.equal(skip.element('skip-intro').hidden, false, 'Pointerdown must not hide the click target');
  skip.element('skip-intro').listeners.get('click')();
  assert.equal(skip.focused(), skip.links[0]);
  assert.equal(skip.element('skip-intro').hidden, true);
});

test('automatic handover returns focus when the skip button is focused', () => {
  const page = fixture();
  page.element('skip-intro').focus();
  page.advance(2800);
  assert.equal(page.focused(), page.links[0]);
});

test('reduced motion starts calm; changing preference also stops the intro', () => {
  const calm = fixture({ reduced: true });
  assert.equal(calm.document.body.dataset.phase, 'done');
  assert.equal(calm.element('skip-intro').hidden, true);
  assert.equal(calm.document.body.dataset.controlReadyMs, '0');
  assert.equal(calm.pending(), 0, 'Reduced motion schedules no intro');
  const change = fixture(); change.advance(800); change.motion.matches = true; change.motionEvents.get('change')();
  assert.equal(change.document.body.dataset.phase, 'done');
  assert.equal(change.document.body.dataset.controlReadyMs, '800');
  assert.equal(change.pending(), 0);
});

test('chamber, nested features, Back, focus return and invalid route', () => {
  const page = fixture({ reduced: true });
  page.links[0].listeners.get('click')();
  page.route('#lots');
  assert.equal(page.element('home').hidden, true);
  assert.equal(page.element('lots').hidden, false);
  assert.equal(page.element('gate').hidden, true);
  assert.equal(page.links[0].attributes.get('aria-current'), 'page');
  page.key('ArrowLeft'); assert.equal(page.window.location.hash, 'map');
  page.key('ArrowRight'); assert.equal(page.window.location.hash, 'gate');
  page.route('#lots/features');
  assert.equal(page.element('lots').querySelector('.overview').hidden, true);
  assert.equal(page.element('lots').querySelector('.feature-list').hidden, false);
  page.key('Escape'); assert.equal(page.window.location.hash, 'lots');
  page.route('#lots'); page.key('Escape'); assert.equal(page.window.location.hash, 'home');
  page.route('#home'); assert.equal(page.focused(), page.links[0]);
  page.route('#lots/unrecognised'); assert.equal(page.element('home').hidden, false);
});
test('all chamber shortcuts, hover reset and both themes work', () => {
  const page = fixture({ reduced: true });
  ['lots','gate','beacons','map'].forEach((id, index) => {
    page.key(String(index + 1)); assert.equal(page.window.location.hash, id);
    page.links[index].listeners.get('pointerenter')();
    assert.equal(page.element('.poster').dataset.focus, id);
    page.links[index].listeners.get('pointerleave')();
    assert.equal(page.element('.poster').dataset.focus, '');
  });
  const theme = page.element('theme'); theme.listeners.get('click')();
  assert.equal(page.document.documentElement.dataset.theme, 'stock');
  assert.equal(theme.attributes.get('aria-pressed'), 'true');
  theme.listeners.get('click')();
  assert.equal(page.document.documentElement.dataset.theme, 'paper');
});
