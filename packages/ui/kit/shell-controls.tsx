import { useState } from 'react';
import type { Ref } from 'react';
import { Breadcrumb } from '../src/breadcrumb.jsx';
import { SealButton } from '../src/seal-button.jsx';
import { StewardBar } from '../src/steward-bar.jsx';
import type { ModuleId } from '../src/primitives.jsx';
import { RoomTitle } from '../src/room-title.jsx';
import { Kbd } from '../src/kbd.jsx';
import { chambers } from '../src/shell.jsx';
import { Stamp } from '../src/stamp/stamp.jsx';
import { entranceStyle } from '../src/entrance.js';
import SceneControls from './scene-controls.jsx';

/** Deferred examples keep the component kit inside its own first-load budget. */
export default function ShellControls({ chamber, input_ref, message, on_message, on_navigate }: {
  chamber: ModuleId; input_ref: Ref<HTMLInputElement>; message: string;
  on_message: (text: string) => void; on_navigate: (id: ModuleId) => void;
}) {
  const [text, setText] = useState('');
  return <>
    <Breadcrumb chamber={chamber} detail="Writ · draft · rev 1" back_href="#kit" on_navigate={on_navigate} />
    <div className="cc-kit-stack">{chambers.map((item, index) => <div className="cc-print-in" style={entranceStyle(index)} key={item.id}>
      <RoomTitle chamber={item.id} detail="Simulated room" stamp={<Stamp kind="simulated" />}
        back_label="Back to the keep" on_back={() => on_message('Back to the Keep · simulated navigation')} />
    </div>)}</div>
    <div className="cc-kit-row" aria-label="Shared keycaps"><Kbd>0</Kbd><Kbd>1</Kbd><Kbd>Esc</Kbd></div>
    <div className="cc-kit-row cc-kit-seals">
      <SealButton on_seal={() => on_message('Simulated seal completed. No live action.')} />
      <SealButton variant="proclaim" on_seal={() => on_message('Simulated proclaim completed. Nothing is on air.')} />
    </div>
    <StewardBar message={message} value={text} input_ref={input_ref} suggestions={['Draft a question draw', 'Catch me up']}
      on_change={setText} on_suggest={setText} on_tell={() => { on_message('The Steward is not wired yet. No changes have been made.'); setText(''); }} />
    <SceneControls />
  </>;
}
