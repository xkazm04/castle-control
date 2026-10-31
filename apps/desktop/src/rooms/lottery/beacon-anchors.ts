/** Trust anchors for in-room beacon authentication, compiled in (never learned from a writ or a round).
 * `public` is the drand quicknet chain (as recorded in packages/verifier-web/src/public-writs.json);
 * `simulated` is verifier-web's simulated chain, used only for the fixture specimen. Pinned by test. */
export type BeaconAnchor = Readonly<{
  name: 'public' | 'simulated';
  chain: Readonly<{ genesis_time: string; hash: string; period_s: number; public_key: string; scheme: string }>;
}>;

export const quicknet_anchor: BeaconAnchor = Object.freeze({
  name: 'public',
  chain: Object.freeze({
    genesis_time: '2023-08-23T15:09:27Z', hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971', period_s: 3,
    public_key: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
    scheme: 'bls-unchained-g1-rfc9380',
  }),
});

export const simulated_anchor: BeaconAnchor = Object.freeze({
  name: 'simulated',
  chain: Object.freeze({
    genesis_time: '2026-10-25T00:00:00Z', hash: '818a3dcb4cd43a33d1b78de80805a0a677b0579be02d540310fb1f91a094cdc2', period_s: 3,
    public_key: 'ac7fa63dfc38bbf3712e27a180391bca4ccabf609c5967a0592eff420b6235f3f2b323051cb099acc3969aca310f7ff4191b2d6db43fafc2c9592f7e5f73981107975d3d92b843891e724dbc9f05b5eee5a3b2b1fc782ede8149f30830b84444',
    scheme: 'bls-unchained-g1-rfc9380',
  }),
});
