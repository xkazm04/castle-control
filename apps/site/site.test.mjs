// Acceptance tests execute the actual script with a small DOM adapter.
// This checks behavior and real timer handover, not browser layout or pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';

const source = readFileSync(new URL('site.js', import.meta.url), 'utf8');
function fixture({ reduced = false, hash = '' } = {}) {
  const elements = new Map();
  const events = new Map();
  const motionEvents = new Map();
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
    location: { hash }, scrollY: 0, clearTimeout, setTimeout,
    matchMedia: () => motion, scrollTo: () => undefined,
    addEventListener: (event, callback) => events.set(`window:${event}`, callback),
  };
  const document = {
    body: element('body'), documentElement: element('html'),
    getElementById: element,
    querySelector: (selector) => {
      if (selector === '.banner a') return links[0];
      const match = /data-chamber="([^"]+)"/.exec(selector);
      return match ? links[ids.indexOf(match[1])] : element(selector);
    },
    querySelectorAll: () => links,
    addEventListener: (event, callback) => events.set(`document:${event}`, callback),
  };
  const start = performance.now();
  runInNewContext(source, { document, window, performance: { now: () => performance.now() - start } });
  const key = (value) => events.get('document:keydown')({ key: value, target: element('target'), preventDefault: () => undefined });
  const route = (value) => { window.location.hash = value; events.get('window:hashchange')(); };
  return { document, window, element, events, motion, motionEvents, key, route, links, focused: () => focused };
}

test('normal intro hands over within four seconds using the real event loop', async () => {
  const page = fixture();
  assert.equal(page.document.body.dataset.phase, 'printing');
  assert.equal(page.element('home').hidden, false);
  assert.ok(Number(page.document.body.dataset.navigationReadyMs) < 1000);
  await new Promise((accept) => setTimeout(accept, 2900));
  const measured = Number(page.document.body.dataset.controlReadyMs);
  assert.equal(page.document.body.dataset.phase, 'done');
  assert.ok(measured >= 2750 && measured < 4000, `Actual handover ${measured} ms`);
  console.log(`Measured script visual handover ${measured} ms; browser timing still requires Director verification.`);
});
test('keyboard and pointer input finish printing immediately; skip restores focus', () => {
  const keyboard = fixture(); keyboard.key('Tab');
  assert.equal(keyboard.document.body.dataset.phase, 'done');
  const pointer = fixture(); pointer.events.get('document:pointerdown')();
  assert.equal(pointer.document.body.dataset.phase, 'done');
  const skip = fixture(); skip.element('skip-intro').listeners.get('click')();
  assert.equal(skip.focused(), skip.links[0]);
  assert.equal(skip.element('skip-intro').hidden, true);
});
test('reduced motion starts calm; changing preference also stops the intro', () => {
  const calm = fixture({ reduced: true });
  assert.equal(calm.document.body.dataset.phase, 'done');
  assert.equal(calm.element('skip-intro').hidden, true);
  const change = fixture(); change.motion.matches = true; change.motionEvents.get('change')();
  assert.equal(change.document.body.dataset.phase, 'done');
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
