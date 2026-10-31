import { HeraldicCard, SectionHeading } from '@castle-control/ui';
import { studioCopy as copy, studioStages } from '../../studio-copy.js';

export const ladderRungs = studioStages;

function StageIcon({ locked }: { locked: boolean }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" data-stage-icon={locked ? 'lock' : 'flag'}>
    {locked ? <><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>
      : <path d="M4 15V1.5M4 2.5h8.5l-2 3 2 3H4" />}
  </svg>;
}

export function TestLadder({ selected, on_select }: { selected: number; on_select: (index: number) => void }) {
  return <section className="cc-ladder" aria-label={copy.ladder_label}>
    <SectionHeading variant="ruled" title={copy.ladder} count={copy.current} />
    <p className="cc-side-lede">{copy.ladder_hint}</p>
    <div className="cc-tablets" role="group" aria-label={copy.stages_label}>
      {ladderRungs.map((rung, index) => {
        const state_id = `studio-ladder-state-${rung.title.toLowerCase().replaceAll(' ', '-')}`;
        return <HeraldicCard variant="tablet" key={rung.title} selected={selected === index}
          current={index === 0} locked={index !== 0} data-rung={index}
          aria-label={copy.inspect_stage(rung.title)} aria-describedby={state_id} on_select={() => on_select(index)}>
          <span className="cc-tablet-no">{index + 1}</span><b>{rung.title}</b><i>{rung.function}</i>
          <span className="cc-tablet-state" id={state_id}><StageIcon locked={index !== 0} />{index === 0 ? copy.local : copy.locked}</span>
        </HeraldicCard>;
      })}
    </div>
    <div className="cc-proclamation" role="status">
      <p className="cc-proclamation-label">{copy.requirements(ladderRungs[selected]?.title ?? ladderRungs[0].title)}</p>
      <p>{ladderRungs[selected]?.detail}</p>
    </div>
    <p className="cc-side-fine">{copy.pending}</p>
  </section>;
}
