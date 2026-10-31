import { expect, test } from 'vitest';
import { artRoom, encode, parse, parseReview, roomIds, writeRoute } from './route.ts';

test('route parse/encode round trip keeps all public hashes and the features suffix', () => {
  expect(parse('')).toEqual({ room: null, features: false });
  expect(parse(encode({ room: null, features: true }))).toEqual({ room: null, features: false });
  for (const room of roomIds) for (const features of [false, true]) {
    const route = { room, features: room !== 'steward' && features };
    expect(parse(encode(route))).toEqual(route);
    expect(encode(route)).toBe(`#${room}${route.features ? '/features' : ''}`);
    const location = { hash: '' };
    writeRoute(route, location);
    expect(location.hash).toBe(encode(route));
  }
});

test.each(['#home', '#herald', '#unknown', '#lots/inside', '#lots/no', '#lots/features/more', '#lots/', '#LOTS', '#%6cots', 'lots', '#lots?draft', '#steward/features'])('invalid route %s returns to overview', (hash) => {
  expect(parse(hash)).toEqual({ room: null, features: false });
});

test('review parameters are decoded and validated at the URL door; absent keys are omitted', () => {
  expect(parseReview('?hover=gate&seed=lanterns_42')).toEqual({ hover: 'gate', seed: 'lanterns_42' });
  expect(parseReview('?hover=%6cots&seed=%61bc')).toEqual({ hover: 'lots', seed: 'abc' });
  for (const room of roomIds) expect(parseReview(`?hover=${room}`)).toEqual({ hover: room });
  for (const query of ['', '?hover=herald', '?hover=lots/features', '?seed=', '?seed=two+words', '?seed=a-b', '?seed=%3Cscript%3E', `?seed=${'x'.repeat(41)}`]) {
    expect(parseReview(query)).toEqual({});
  }
  expect(parseReview(`?seed=${'x'.repeat(40)}`)).toEqual({ seed: 'x'.repeat(40) });
});

test('the URL door maps site aliases to unchanged product art ids', () => {
  expect(artRoom).toEqual({ lots: 'lottery', gate: 'moderator', beacons: 'visuals', map: 'studio', steward: 'steward' });
});
