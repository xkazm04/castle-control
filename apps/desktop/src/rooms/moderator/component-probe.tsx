import * as React from 'react';
import type { ReactElement, ReactNode, ChangeEvent, MouseEvent, SubmitEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { Drawer } from '@castle-control/ui/chamber';
import { GatehouseDrawerState } from './drawer-state.js';
import type { GatehouseDrawerControl } from './drawer-state.js';

type Props = { children?: ReactNode; id?: string; htmlFor?: string; value?: string | number;
  disabled?: boolean; className?: string; type?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>) => void;
  onClick?: (event: MouseEvent<HTMLElement>) => void; onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void };
const captured = vi.hoisted(() => ({ elements: [] as ReactElement<unknown>[] }));
vi.mock('react', async original => ({ ...await original<typeof React>() }));
vi.mock('react/jsx-runtime', async original => {
  const runtime = await original<typeof import('react/jsx-runtime')>();
  const record = (create: typeof runtime.jsx): typeof runtime.jsx => (...args) => {
    const element = create(...args); captured.elements.push(element); return element;
  };
  return { ...runtime, jsx: record(runtime.jsx), jsxs: record(runtime.jsxs) };
});
vi.mock('react/jsx-dev-runtime', async original => {
  const runtime = await original<typeof import('react/jsx-dev-runtime')>();
  return { ...runtime, jsxDEV: (...args: Parameters<typeof runtime.jsxDEV>) => {
    const element = runtime.jsxDEV(...args); captured.elements.push(element); return element;
  } };
});

/** Node-only event/effect probe: real components render through React, never as
 * plain functions. Retain hook slots between SSR probes and flush effects after
 * each render; timers and production event handlers remain real. */
export function componentProbe(view: () => ReactNode, { effects: run_effects = true } = {}) {
  const states: unknown[] = []; const refs: { current: unknown }[] = [];
  const effects: { deps: React.DependencyList | undefined; cleanup: void | (() => void) }[] = [];
  let state_index = 0; let ref_index = 0; let effect_index = 0;
  let pending: (() => void)[] = [];
  const state_spy = vi.spyOn(React, 'useState').mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => {
    const index = state_index++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  });
  const ref_spy = vi.spyOn(React, 'useRef').mockImplementation(initial => {
    const index = ref_index++; return refs[index] ??= { current: initial };
  });
  const effect_spy = vi.spyOn(React, 'useEffect').mockImplementation((effect, deps) => {
    if (!run_effects) return;
    const index = effect_index++; const before = effects[index];
    if (before && deps && before.deps && deps.length === before.deps.length && deps.every((dep, i) => Object.is(dep, before.deps?.[i]))) return;
    pending.push(() => { before?.cleanup?.(); effects[index] = { deps, cleanup: effect() }; });
  });
  function render() {
    state_index = 0; ref_index = 0; effect_index = 0; pending = []; captured.elements = [];
    const html = renderToStaticMarkup(view());
    for (const effect of pending) effect();
    return html;
  }
  function control(predicate: (element: ReactElement<Props>) => boolean) {
    const found = captured.elements.filter((element): element is ReactElement<Props> => React.isValidElement<Props>(element)).find(predicate);
    if (!found) throw new Error('Missing rendered control'); return found.props;
  }
  return { render,
    click(text: string) {
      const button = control(element => element.type === 'button'
        && React.Children.toArray(element.props.children).filter(child => typeof child === 'string').join('') === text);
      button.onClick?.({} as MouseEvent<HTMLElement>);
    },
    change(label: string, value: string) {
      const field = control(element => element.type === 'label' && React.Children.toArray(element.props.children).filter(child => typeof child === 'string').join('') === label);
      // The old wrapped-label markup has no htmlFor. Its child is the control.
      const nested = React.Children.toArray(field.children).find(child => React.isValidElement<Props>(child) && ['input', 'textarea', 'select'].includes(String(child.type)));
      const input = field.htmlFor ? control(element => typeof element.type === 'string' && element.props.id === field.htmlFor)
        : React.isValidElement<Props>(nested) ? nested.props : undefined;
      if (!input) throw new Error(`Missing field ${label}`);
      input.onChange?.({ currentTarget: { value } } as ChangeEvent<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>);
    },
    submit() { control(element => element.type === 'form').onSubmit?.({ preventDefault: () => undefined } as SubmitEvent<HTMLFormElement>); },
    dispose() {
      for (const effect of effects) effect.cleanup?.();
      state_spy.mockRestore(); ref_spy.mockRestore(); effect_spy.mockRestore();
    },
  };
}

/** Render with native React hooks. Only drawer state is controlled, so opening a
 * seal slot can add arbitrary hooks without shifting another component's state. */
export function drawerProbe(view: ReactNode, { controlled = true } = {}) {
  const drawer: GatehouseDrawerControl = { open: false, setOpen: open => { drawer.open = open; } };
  return {
    render() {
      captured.elements = [];
      return renderToStaticMarkup(controlled ? <GatehouseDrawerState.Provider value={drawer}>{view}</GatehouseDrawerState.Provider> : view);
    },
    click(text: string) {
      const button = captured.elements.find((element): element is ReactElement<Props> => React.isValidElement<Props>(element)
        && element.type === 'button' && React.Children.toArray(element.props.children).filter(child => typeof child === 'string').join('') === text);
      // An integrated surface can preload the shared primitive before JSX capture.
      // Its controlled close callback is still supplied by our own deck element.
      if (!button && text === 'Close') {
        const drawer = captured.elements.find((element): element is ReactElement<{ onClose: () => void }> =>
          React.isValidElement<{ onClose: () => void }>(element) && element.type === Drawer);
        if (drawer) { drawer.props.onClose(); return; }
      }
      if (!button?.props.onClick) throw new Error(`Missing rendered drawer control: ${text}`);
      button.props.onClick({} as MouseEvent<HTMLElement>);
    },
  };
}

/** Assert moved content after the production trigger, then exercise Close. No hook mocking. */
export function openGatehouseDrawer(view: ReactNode): string {
  const probe = drawerProbe(view);
  probe.render(); probe.click('Full chart');
  const html = probe.render();
  probe.click('Close'); probe.render();
  return html;
}
