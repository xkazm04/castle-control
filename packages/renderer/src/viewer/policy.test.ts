import { expect, it } from 'vitest';
import { allowedImageUrl, allowsViewerContent } from './policy.ts';
import { VIEWER_CARD_TEMPLATE } from '../templates/viewer-card.ts';

it('allows only HTTPS images on the exact configured host', () => {
  expect(allowedImageUrl('https://images.example.test/assets/a.png', 'images.example.test'))
    .toBe('https://images.example.test/assets/a.png');
  for (const url of ['https://other.example.test/a', 'https://images.example.test.evil.test/a',
    'https://sub.images.example.test/a', 'https://images.example.test@evil.test/a',
    'https://user@images.example.test/a', 'http://images.example.test/a', '//images.example.test/a',
    'https://images.example.test:444/a', 'data:image/png,x', 'javascript:alert(1)', '/a', '', null,
    'https://images.example.test/\na']) {
    expect(allowedImageUrl(url, 'images.example.test')).toBeUndefined();
  }
  for (const host of ['', '*', '*.example.test', 'https://images.example.test', 'images.example.test/a']) {
    expect(allowedImageUrl('https://images.example.test/a', host)).toBeUndefined();
  }
});

it('requires an approved viewer card with Twitch identity and a displayed username', () => {
  expect(allowsViewerContent(VIEWER_CARD_TEMPLATE)).toBe(true);
  for (const changes of [{ approved: false }, { approved: undefined }, { twitch_user_id: '' },
    { twitch_user_id: 123 }, { display_name: '' }, { display_name: undefined }, { bits: 1 }]) {
    expect(allowsViewerContent({ ...VIEWER_CARD_TEMPLATE, ...changes })).toBe(false);
  }
  expect(allowsViewerContent(null)).toBe(false);
});
