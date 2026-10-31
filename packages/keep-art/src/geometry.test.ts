import { expect, test } from 'vitest';
import {
  appOverviewFrame, appOverviewTarget, appRoomTarget, frameTransform, keepRooms,
  keepViewBox, siteOverviewFrame, siteOverviewTarget, siteRoomTarget,
} from './geometry.js';
import type { Rect } from './geometry.js';

test('room geometry preserves the winner numbers under product room ids', () => {
  const rows = Object.entries(keepRooms).map(([id, value]) => [
    id, Object.values(value.rect), Object.values(value.frame), Object.values(value.hit),
    value.plaque ? Object.values(value.plaque) : null,
    value.appFrame ? Object.values(value.appFrame) : null, value.ink,
  ]);
  expect(rows).toEqual([
    ['studio', [422, 92, 356, 200], [410, 60, 380, 240], [422, 92, 356, 200], [436, 104], null, 'key'],
    ['lottery', [422, 312, 356, 228], [410, 300, 380, 252], [422, 312, 356, 228], [436, 320], null, 'gules'],
    ['moderator', [116, 360, 242, 180], [20, 346, 350, 226], [78, 360, 280, 180], [124, 368], [60, 346, 310, 200], 'azure'],
    ['visuals', [842, 160, 256, 180], [836, 4, 268, 346], [842, 20, 256, 320], [852, 168], [836, 140, 268, 210], 'or'],
    ['herald', [102, 180, 256, 160], [96, 170, 268, 180], [102, 180, 256, 160], null, null, 'key'],
    ['steward', [842, 360, 256, 180], [836, 350, 268, 200], [842, 360, 256, 180], null, null, 'key'],
  ]);
  expect(keepViewBox).toEqual([0, 0, 1200, 640]);
  expect(Object.hasOwn(keepRooms.herald, 'plaque')).toBe(false);
  expect(Object.hasOwn(keepRooms.lottery, 'appFrame')).toBe(false);
});

function expectTransform(
  rect: Rect, target: Rect, mode: 'contain' | 'cover', expected: readonly [number, number, number],
): void {
  const actual = frameTransform(rect, target, mode);
  expect(actual.s).toBeCloseTo(expected[0], 12);
  expect(actual.ox).toBeCloseTo(expected[1], 10);
  expect(actual.oy).toBeCloseTo(expected[2], 10);
}

// Golden numbers obtained by running the winner's frameTransform and app.html cam formula in Node.
test('contain matches site and app overview and site room cameras', () => {
  expectTransform(siteOverviewFrame, siteOverviewTarget, 'contain',
    [0.8955223880597015, 182.6865671641791, 288.86567164179104]);
  expectTransform(appOverviewFrame, appOverviewTarget, 'contain', [0.8666666666666667, 10, 136]);
  expectTransform(keepRooms.lottery.frame, siteRoomTarget, 'contain', [2.3, -913, -615.8]);
});

test('cover matches app width padding, centering and scale cap', () => {
  expectTransform(appOverviewFrame, appOverviewTarget, 'cover',
    [0.7973333333333334, 51.59999999999991, 156.79999999999998]);
  const moderator = keepRooms.moderator.appFrame;
  const visuals = keepRooms.visuals.appFrame;
  if (!moderator || !visuals) throw new Error('App room camera frames missing');
  expectTransform(moderator, appRoomTarget, 'cover', [2.3, 35.5, -900.8]);
  expectTransform(visuals, appRoomTarget, 'cover', [2.3, -1701, -438.5]);
  expectTransform({ x: 0, y: 0, w: 1200, h: 640 }, appRoomTarget, 'cover',
    [0.8126666666666666, 42.400000000000034, -135.05333333333334]);
});
