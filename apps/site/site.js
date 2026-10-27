/* Standalone landing behavior. No app connection, storage, network or sample feed. */
/* global document, window, performance */
const chambers = Object.freeze({
  lots: { name: 'Lot Chamber', function: 'Lottery manager' },
  gate: { name: 'Gatehouse', function: 'AI moderator' },
  beacons: { name: 'Beacons', function: 'Contribution visuals' },
  map: { name: 'Map Room', function: 'Extension studio' },
});
const body = document.body;
const home = document.getElementById('home');
const poster = document.querySelector('.poster');
const skip = document.getElementById('skip-intro');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const theme = document.getElementById('theme');
let trigger;
let current = 'home';
let homeScroll = 0;
let introTimer;

function finishIntro() {
  window.clearTimeout(introTimer);
  body.dataset.phase = 'done';
  if (document.activeElement === skip) document.querySelector('.banner a').focus();
  skip.hidden = true;
  if (!body.dataset.controlReadyMs) {
    body.dataset.controlReadyMs = String(Math.round(performance.now()));
  }
}

function highlight(id = '') {
  poster.dataset.focus = id;
  const chamber = chambers[id];
  document.getElementById('chamber-label').textContent = chamber ? chamber.name : 'Four chambers · free, open source, desktop';
  document.getElementById('chamber-function').textContent = chamber ? chamber.function : 'Your channel is your keep.';
  const title = document.querySelector('.chamber-title use');
  if (chamber) title.setAttribute('href', `art.svg#title-${id}`);
}

// The hash has one validation door. Unknown paths return to the whole keep.
function readRoute() {
  const match = /^#(lots|gate|beacons|map)(\/features)?$/.exec(window.location.hash);
  return match ? { chamber: match[1], features: Boolean(match[2]) } : { chamber: 'home', features: false };
}

function showRoute({ focus = true } = {}) {
  const route = readRoute();
  if (route.chamber !== 'home') finishIntro();
  if (current === 'home' && route.chamber !== 'home') homeScroll = window.scrollY;
  home.hidden = route.chamber !== 'home';
  for (const id of Object.keys(chambers)) {
    const scene = document.getElementById(id);
    scene.hidden = route.chamber !== id;
    scene.querySelector('.overview').hidden = route.features;
    scene.querySelector('.feature-list').hidden = !route.features;
  }
  document.querySelectorAll('.banner [data-chamber]').forEach((link) => {
    if (link.dataset.chamber === route.chamber) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (focus) {
    if (route.chamber === 'home') {
      window.scrollTo(0, homeScroll);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      const selector = route.features ? '.feature-list .back' : '.scene-copy > .back';
      document.getElementById(route.chamber).querySelector(selector).focus({ preventScroll: true });
    }
  }
  current = route.chamber;
}

// A single registry owns shortcuts and the one keyboard event subscription.
const keymap = Object.freeze({
  event: 'keydown',
  bindings: [
    { key: 'Escape', run: () => {
      const route = readRoute();
      window.location.hash = route.features ? route.chamber : 'home';
    } },
    ...[['ArrowLeft', -1], ['ArrowRight', 1]].map(([key, direction]) => ({
      key, when: () => current !== 'home', run: () => {
        const ids = Object.keys(chambers);
        window.location.hash = ids[(ids.indexOf(current) + direction + ids.length) % ids.length];
      },
    })),
    ...Object.keys(chambers).map((id, index) => ({ key: String(index + 1), run: () => {
      if (current === 'home') trigger = document.querySelector(`.banner [data-chamber="${id}"]`);
      window.location.hash = id;
    } })),
  ],
});
if (new Set(keymap.bindings.map((binding) => binding.key)).size !== keymap.bindings.length) {
  throw new Error('Duplicate landing shortcut');
}
document.addEventListener(keymap.event, (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const binding = keymap.bindings.find((candidate) => candidate.key === event.key && (!candidate.when || candidate.when()));
  if (binding) { finishIntro(); event.preventDefault(); binding.run(); }
});
document.addEventListener('pointerdown', (event) => {
  // Keep the native button present until pointer-up dispatches its click.
  if (body.dataset.phase === 'printing' && !skip.contains(event.target)) finishIntro();
}, { passive: true });
skip.addEventListener('click', () => {
  finishIntro();
  document.querySelector('.banner a').focus();
});
document.querySelectorAll('[data-chamber]').forEach((link) => {
  link.addEventListener('click', () => { if (current === 'home') trigger = link; finishIntro(); });
  link.addEventListener('pointerenter', () => highlight(link.dataset.chamber));
  link.addEventListener('pointerleave', () => highlight());
  link.addEventListener('focus', () => highlight(link.dataset.chamber));
  link.addEventListener('blur', () => highlight());
});
theme.addEventListener('click', () => {
  const stock = document.documentElement.dataset.theme !== 'stock';
  document.documentElement.dataset.theme = stock ? 'stock' : 'paper';
  theme.setAttribute('aria-pressed', String(stock));
  theme.setAttribute('aria-label', stock ? 'Use paper theme' : 'Use dark stock theme');
  theme.querySelector('span').textContent = stock ? 'Paper' : 'Dark stock';
});
motion.addEventListener('change', () => { if (motion.matches) finishIntro(); });
window.addEventListener('hashchange', () => showRoute());
showRoute({ focus: window.location.hash !== '' });

// Navigation is never disabled during printing. This timestamp marks the end
// of the visual handover, so the acceptance measurement is conservative.
body.dataset.navigationReadyMs = String(Math.round(performance.now()));
const introDurationMs = Math.min(2800, 4000 - performance.now());
if (!motion.matches && current === 'home' && introDurationMs > 0) {
  body.dataset.phase = 'printing';
  skip.hidden = false;
  introTimer = window.setTimeout(finishIntro, introDurationMs);
} else finishIntro();
