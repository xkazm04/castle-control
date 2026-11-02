import { useId } from 'react';
import type { LotsDraw } from '@castle-control/contract';
import type { ReactNode } from 'react';
import { capFigure } from './flow-model.js';

/** Compact edits use the existing rules, including cooldown-derived held-out counts. */
export function DrawControls({ draw, held_out, disabled, on_edit, on_tools, children, winner_control }: {
  draw: LotsDraw | undefined; held_out: ReactNode; disabled: boolean;
  on_edit: (draw: LotsDraw) => void; on_tools: () => void; children: ReactNode; winner_control?: ReactNode;
}) {
  const id = useId();
  const cap = draw?.rules.cohort_caps.find(item => item.cohort === 'raider');
  return <>
    <div className="lottery-rule-chips">
      <div className="lottery-rule-chip" data-role="lot-stat">{winner_control ?? <>
        <span id={`${id}-winners`}>Winners</span>
        <div className="lottery-stepper" role="group" aria-labelledby={`${id}-winners`}>
          <button type="button" aria-label="Fewer winners" disabled={disabled || !draw || draw.rules.winner_count <= 1}
            onClick={() => { if (draw) on_edit({ ...draw, rules: { ...draw.rules, winner_count: draw.rules.winner_count - 1 } }); }}>−</button>
          <b>{draw?.rules.winner_count ?? '—'}</b>
          <button type="button" aria-label="More winners" disabled={disabled || !draw || draw.rules.winner_count >= 65535}
            onClick={() => { if (draw) on_edit({ ...draw, rules: { ...draw.rules, winner_count: draw.rules.winner_count + 1 } }); }}>+</button>
        </div>
      </>}</div>
      <button type="button" className="lottery-rule-chip" data-role="lot-stat" onClick={on_tools}
        title="Held out by cooldown · edit the cooldown in draw tools">Held out<b>{held_out}</b><small>cooldown</small></button>
      <div className="lottery-rule-chip" data-role="lot-stat"><label htmlFor={`${id}-cap`}>Raider cap</label>
        <select id={`${id}-cap`} value={cap ? `${cap.numerator}/${cap.denominator}` : 'none'} disabled={disabled || !draw}
          onChange={event => {
            const index = ['0/3', '1/3', '2/3', '3/3', 'none'].indexOf(event.currentTarget.value);
            if (draw && index >= 0) on_edit({ ...draw, rules: { ...draw.rules,
              cohort_caps: [...draw.rules.cohort_caps.filter(item => item.cohort !== 'raider'),
                ...(index === 4 ? [] : [{ cohort: 'raider', numerator: index, denominator: 3 }])] } });
          }}>
          {draw && cap && !['0/3', '1/3', '2/3', '3/3'].includes(`${cap.numerator}/${cap.denominator}`)
            && <option value={`${cap.numerator}/${cap.denominator}`}>{capFigure(draw)}</option>}
          {['0/3', '1/3', '2/3', '3/3', 'none'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    {children}
  </>;
}
