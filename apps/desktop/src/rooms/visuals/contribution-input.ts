import type { ContributionSource, VisualInput } from '@castle-control/contract';

export const contribution_sources: readonly ContributionSource[] = ['gift', 'subscribe', 'resub', 'cheer', 'bits_use',
  'hype_train', 'channel_points', 'charity', 'goal', 'power_up'];

export const source_labels: Record<ContributionSource, string> = {
  cheer: 'Bits cheer', bits_use: 'Bits use', subscribe: 'subscriptions', gift: 'gift subscriptions',
  resub: 'resubscriptions', hype_train: 'Hype Train level', channel_points: 'channel points',
  charity: 'charity minor currency units', goal: 'goal minor currency units', power_up: 'power-ups',
};

/** Match the contract's source/unit union; no conversion or routing is implied. */
export function contributionInput(source: ContributionSource): VisualInput {
  switch (source) {
    case 'cheer': case 'bits_use': return { source, unit: 'bits' };
    case 'subscribe': case 'gift': case 'resub': case 'power_up': return { source, unit: 'count' };
    case 'hype_train': return { source, unit: 'level' };
    case 'channel_points': return { source, unit: 'points' };
    case 'charity': case 'goal': return { source, unit: 'minor_currency' };
  }
}

export function inputDescription(input: VisualInput | undefined): string {
  return input ? `${source_labels[input.source]} (${input.unit})` : 'Not routed';
}
