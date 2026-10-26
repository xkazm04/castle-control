import { finite, localImage, record } from './validation.ts';

export interface ContributionMeterData {
  readonly current: number;
  readonly goal: number;
  readonly image_path?: string;
}
export interface ContributionMeterScene extends ContributionMeterData { readonly fill_fraction: number }

export function parseContributionMeter(value: unknown): ContributionMeterData {
  const fields = record(value, ['current', 'goal', 'image_path'], 'contribution-meter');
  const current = finite(fields.current, 'current');
  const goal = finite(fields.goal, 'goal');
  if (goal <= 0) throw new Error('goal must be positive');
  return Object.freeze({ current, goal, ...localImage(fields) });
}

/** Display-only progress: no currency, pricing, admission or other template influence. */
export function buildContributionMeterScene(value: unknown): ContributionMeterScene {
  const data = parseContributionMeter(value);
  const fill_fraction = Math.max(0, Math.min(1, data.current / data.goal));
  return Object.freeze({ ...data, fill_fraction });
}

/** Original simulated, renderer-local data; units are chosen by the host. */
export const CONTRIBUTION_METER_TEMPLATE: ContributionMeterData = parseContributionMeter({ current: 0, goal: 100 });
