import { Stamp } from '../src/stamp/stamp.jsx';
import { stampKinds } from '../src/stamp/table.js';
import './stamps.css';

/** Every fixed meaning, in both type contexts; all examples are simulated. */
export default function Stamps() {
  return <section className="cc-kit-stamps" aria-label="Status stamps · simulated examples">
    <h3>One status language · simulated examples</h3>
    {(['shell', 'stage'] as const).map(size => <section key={size} data-size={size} aria-label={`${size} stamps`}>
      <h4>{size} size</h4>
      <div>{stampKinds.map(kind => <Stamp key={kind} kind={kind} land />)}</div>
    </section>)}
  </section>;
}
