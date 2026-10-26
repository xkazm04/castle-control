import { localImage, record, text } from './validation.ts';

export interface ViewerCardData {
  readonly twitch_user_id: string;
  readonly display_name: string;
  readonly approved: true;
  readonly image_path?: string;
}

export function parseViewerCard(value: unknown): ViewerCardData {
  const fields = record(value, ['twitch_user_id', 'display_name', 'approved', 'image_path'], 'viewer-card');
  if (fields.approved !== true) throw new Error('viewer-card must be approved by the streamer');
  return Object.freeze({
    twitch_user_id: text(fields.twitch_user_id, 'twitch_user_id'),
    display_name: text(fields.display_name, 'display_name'),
    approved: true, ...localImage(fields),
  });
}

/** The displayed username is mandatory foreground scene data; hosts must render it as text. */
export function buildViewerCardScene(value: unknown): ViewerCardData {
  return parseViewerCard(value);
}

/** Original simulated data, not a real viewer or proof of approval/identity. Hosts verify those. */
export const VIEWER_CARD_TEMPLATE: ViewerCardData = parseViewerCard({
  twitch_user_id: '9007199254740993123', display_name: 'Simulated Viewer', approved: true,
});
