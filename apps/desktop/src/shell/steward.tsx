import { useState } from 'react';
import type { Ref } from 'react';
import { StewardBar } from '@castle-control/ui';
import { stewardStub, unwiredReply } from './steward-stub.js';
import type { StewardContext } from './steward-stub.js';

export function ShellSteward({ context, input_ref }: { context: StewardContext; input_ref?: Ref<HTMLInputElement> }) {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState(unwiredReply);
  return <StewardBar message={message} value={value} suggestions={['Catch me up', 'Draft a question draw', 'What does chat want?']}
    on_change={setValue} on_tell={() => { setMessage(stewardStub.ask(value, context).reply); setValue(''); }}
    on_suggest={text => {
      setValue(text);
      if (input_ref && 'current' in input_ref) input_ref.current?.focus();
    }} {...(input_ref ? { input_ref } : {})} />;
}
