import '@castle-control/tokens';
import '@castle-control/keep-art/keep-art.css';
import '@castle-control/ui/stamp.css';
import './site.css';
import './broadside.css';
import './toys.css';
import { bindFit } from './fit.ts';
import { createIntro } from './intro.ts';
import { bindKeys } from './keymap.ts';
import type { Action } from './keymap.ts';
import { initialState, level, routeOf, transition } from './machine.ts';
import type { Event } from './machine.ts';
import { encode, parse, parseReview, writeRoute } from './route.ts';
import { buildStage } from './stage.ts';
import { toggleTheme } from './theme.ts';
import { createView } from './view.ts';

const nodes = buildStage(document);
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const review = parseReview(window.location.search);
let state = initialState(motion.matches, parse(window.location.hash));
const view = createView(nodes, () => motion.matches, state.room === 'lots' ? review.seed : undefined);
view.update(state);
view.reviewHover(review.hover ?? null);

const intro = createIntro({
  schedule: (run, delay) => window.setTimeout(run, delay),
  cancel: (timer) => window.clearTimeout(timer),
  handover: (event) => { state = transition(state, event); view.update(state); },
  showSkip: (show) => { nodes.skip.hidden = !show; },
  skipFocused: () => document.activeElement === nodes.skip,
  focusFirst: view.focusFirst,
}, state.phase === 'intro');

function dispatch(event: Event): void {
  state = transition(state, event);
  intro.sync(state.phase === 'intro');
  view.update(state);
  const route = routeOf(state);
  if (encode(parse(window.location.hash)) !== encode(route)) writeRoute(route, window.location);
}

function act(action: Action): void {
  if (action.type === 'focus') view.moveFocus(action.direction);
  else if (action.type === 'claim') view.claimHex();
  else dispatch(action);
}

nodes.skip.addEventListener('click', intro.skip);
nodes.skip.addEventListener('blur', intro.blur);
nodes.mark.addEventListener('click', (event) => { event.preventDefault(); dispatch({ type: 'home' }); });
nodes.skiplink.addEventListener('click', (event) => {
  event.preventDefault(); dispatch({ type: 'home' }); nodes.hits.get('lots')?.focus({ preventScroll: true });
});
nodes.crumbs.room.addEventListener('click', () => dispatch({ type: 'back' }));
nodes.theme.addEventListener('click', () => toggleTheme(document.documentElement, nodes.theme));
for (const [room, hit] of nodes.hits) {
  hit.addEventListener('click', () => dispatch({ type: 'open', room }));
  hit.addEventListener('pointerenter', () => view.hover(room));
  hit.addEventListener('pointerleave', () => view.hover(null));
  hit.addEventListener('focus', () => view.focus(room));
  hit.addEventListener('blur', () => view.focus(null));
}
document.addEventListener('pointerdown', (event) => intro.pointer(event.target === nodes.skip), { passive: true });
motion.addEventListener('change', () => { if (motion.matches) intro.reduce(); view.update(state); });
window.addEventListener('hashchange', () => {
  const route = parse(window.location.hash);
  // Route changes pass through the same transition table as clicks and keys.
  state = transition(state, route.room === null ? { type: 'home' } : { type: 'open', room: route.room });
  if (route.features) state = transition(state, { type: 'features' });
  intro.sync(false);
  view.update(state);
});
bindKeys(document, () => ({ level: level(state), liveHex: view.liveHex() }), act,
  (key, target) => intro.key(key, target === nodes.skip));
bindFit(window, nodes.stage);
