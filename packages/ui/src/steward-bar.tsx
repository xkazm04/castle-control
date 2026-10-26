import type { Ref } from 'react';
import './steward-bar.css';

export type StewardBarProps = {
  message: string;
  value: string;
  suggestions: readonly string[];
  on_change: (text: string) => void;
  on_tell: () => void;
  on_suggest: (text: string) => void;
  input_ref?: Ref<HTMLInputElement>;
  on_speak_start?: () => void;
  on_speak_end?: () => void;
};

/** One presentational input; conversation and proposals belong to its owner. */
export function StewardBar(props: StewardBarProps) {
  return <section className="cc-steward-bar" aria-label="The Steward">
    <div className="cc-steward-message">
      <b>SIMULATED STEWARD · SAMPLE DATA</b>
      <p role="status">{props.message}</p>
    </div>
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
    <div className="cc-steward-suggestions" aria-label="Steward suggestions">
      {props.suggestions.map(text => <button type="button" key={text} onClick={() => props.on_suggest(text)}>{text}</button>)}
    </div>
  </section>;
}
