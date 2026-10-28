import type { ReactNode, Ref } from 'react';
import './steward-bar.css';

export type StewardBarProps = {
  mode?: 'simulated' | 'live';
  message: string;
  value: string;
  suggestions: readonly string[];
  on_change: (text: string) => void;
  on_tell: () => void;
  on_suggest: (text: string) => void;
  input_ref?: Ref<HTMLInputElement>;
  on_speak_start?: () => void;
  on_speak_end?: () => void;
  identity?: { name: string; state: string; figure?: ReactNode };
  proposal?: ReactNode;
};

function StewardFigure() {
  return <svg viewBox="0 0 56 56" aria-hidden="true" focusable="false" className="cc-steward-figure">
    <path d="M23 9v-3h10v3m-15 5h20l-3 31H21zM17 49h22M16 13h24" />
    <ellipse className="cc-steward-light" cx="28" cy="31" rx="6" ry="10" />
  </svg>;
}

/** One presentational input; conversation and proposals belong to its owner. */
export function StewardBar(props: StewardBarProps) {
  const live = props.mode === 'live';
  const identity = props.identity ?? { name: 'The Steward', state: live ? 'Live co-pilot' : 'Simulated co-pilot' };
  const has_proposal = props.proposal !== undefined && props.proposal !== null && props.proposal !== false;
  return <section className={`cc-steward-bar${has_proposal ? ' cc-steward-with-proposal' : ''}`} aria-label="The Steward">
    <div className="cc-steward-identity" role="group" aria-label="Steward identity">
      {identity.figure ?? <StewardFigure />}
      <strong>{identity.name}</strong><span>{identity.state}</span>
      <b>{live ? 'LIVE STEWARD' : 'SIMULATED STEWARD · SAMPLE DATA'}</b>
    </div>
    <div className="cc-steward-controls" role="group" aria-label="Steward conversation controls">
      <div className="cc-steward-message"><p role="status">{props.message}</p></div>
      <form onSubmit={event => { event.preventDefault(); if (props.value.trim()) props.on_tell(); }}>
        <label><span>Talk to the Steward...</span>
          <input ref={props.input_ref} aria-label="Talk to the Steward..." value={props.value}
            onChange={event => props.on_change(event.currentTarget.value)} placeholder="Talk to the Steward..." />
        </label>
        <button type="button" disabled={!props.on_speak_start || !props.on_speak_end}
          title="Speech input is not wired yet" onPointerDown={props.on_speak_start}
          onPointerUp={props.on_speak_end} onPointerCancel={props.on_speak_end} onBlur={props.on_speak_end}>Hold to speak</button>
        <button type="submit" disabled={!props.value.trim()}>Tell</button>
      </form>
      <div className="cc-steward-suggestions" role="group" aria-label="Steward suggestions">
        {props.suggestions.map(text => <button type="button" key={text} onClick={() => props.on_suggest(text)}>{text}</button>)}
      </div>
    </div>
    {has_proposal && <aside className="cc-steward-proposal" aria-label="Steward proposal">{props.proposal}</aside>}
  </section>;
}
