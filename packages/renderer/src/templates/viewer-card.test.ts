import { describe, expect, it } from 'vitest';
import { buildViewerCardScene, parseViewerCard, VIEWER_CARD_TEMPLATE } from './viewer-card.ts';

describe('viewer-card renderer-local data (simulated)', () => {
  it('shows the approved display name and preserves the string Twitch id', () => {
    const data = { twitch_user_id: '9007199254740993123', display_name: 'Simulated Viewer',
      approved: true, image_path: './assets/viewer.png' };
    const scene = buildViewerCardScene(data);
    expect(scene).toEqual(data);
    expect(scene).not.toBe(data);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(buildViewerCardScene(VIEWER_CARD_TEMPLATE).display_name).toBe('Simulated Viewer');
    expect(Object.isFrozen(VIEWER_CARD_TEMPLATE)).toBe(true);
  });

  it('refuses unapproved content, missing Twitch ids and missing displayed usernames', () => {
    for (const approved of [false, undefined, 'true', 1, null]) {
      expect(() => buildViewerCardScene({ ...VIEWER_CARD_TEMPLATE, approved })).toThrow(/approved/);
    }
    for (const twitch_user_id of ['', '  ', undefined, null, 123]) {
      expect(() => parseViewerCard({ ...VIEWER_CARD_TEMPLATE, twitch_user_id })).toThrow(/twitch_user_id/);
    }
    for (const display_name of ['', ' ', undefined, null, 123]) {
      expect(() => parseViewerCard({ ...VIEWER_CARD_TEMPLATE, display_name })).toThrow(/display_name/);
    }
    expect(() => parseViewerCard({ display_name: 'Simulated Viewer', approved: true })).toThrow();
    expect(() => parseViewerCard({ twitch_user_id: '123', display_name: 'Simulated Viewer' })).toThrow();
  });

  it('denies all unknown fields including Bits pricing', () => {
    for (const key of ['bits', 'cost', 'unexpected']) {
      expect(() => buildViewerCardScene({ ...VIEWER_CARD_TEMPLATE, [key]: 1 })).toThrow(/unknown/i);
    }
  });

  it('refuses remote and nonlocal viewer images', () => {
    for (const image_path of ['http://host/a', 'https://host/a', 'data:image/png,x',
      'javascript:alert(1)', '//host/a', '/a', '../a', 'a/../b', 'C:/a', 'a\\b', '', undefined]) {
      expect(() => parseViewerCard({ ...VIEWER_CARD_TEMPLATE, image_path })).toThrow();
    }
  });
});
