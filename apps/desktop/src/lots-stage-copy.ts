import { lotsCopy } from './lots-copy.js';

export const stageCopy = {
  title: 'Lot Chamber stage', description: 'The roll takes the stage. Open one detail at a time.',
  stage: 'Lot Chamber overview', breadcrumb: 'Breadcrumb', home: 'Castle Control', chamber: 'Lot Chamber',
  back: 'Back to the stage', reference: 'Open the reference layout',
  state: 'Roll state', count: 'Eligible entries', cooldown: 'Cooldown exclusions',
  preset: 'Visual preset', restyle: 'Restyle', custom: 'Custom design',
  presets_title: 'Restyle the draw', presets_note: 'Fixture presets change style data only. The roll and its odds stay the same.',
  presets: { wax: 'Wax-seal urn', blue: 'Azure wheel', gold: 'Gilded deck', custom: 'Fixture lantern urn' },
  prompt: 'Describe your custom design', prompt_hint: 'For example: a gold lantern urn with a blue paper background.',
  fixture: 'Fixture: no LLM call', generate: 'Generate', generating: 'Preparing fixture design…',
  custom_note: 'Your prompt is kept in this view only. Generate always returns the same canned style data.',
  current: 'Current look', preview: 'Proposed look', no_preview: 'Generate a fixture to preview it beside the current look.',
  seal: 'Seal', tear: 'Tear up', applied: 'Fixture design sealed locally.', discarded: 'Fixture design discarded. Current look kept.',
  history: 'Past draws', history_note: 'One saved simulated proof is available. It is separate from this editable roll.',
  sample: 'Saved simulated draw', artifact: 'Draw artifact',
  entries: [
    { id: '1.1', title: lotsCopy.saved }, { id: '1.2', title: lotsCopy.roll },
    { id: '1.3', title: lotsCopy.setup }, { id: '1.4', title: lotsCopy.fairness },
    { id: '1.5', title: lotsCopy.stream }, { id: '1.6', title: 'Past draws' },
    { id: 'writ', title: lotsCopy.writ },
  ],
} as const;
