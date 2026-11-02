/** OBS browser-source sizes. A leaf module: Steward flows read it without loading the setup model. */
export const streamPresets = Object.freeze({
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
  '720p': Object.freeze({ width: 1280, height: 720 }),
  vertical: Object.freeze({ width: 1080, height: 1920 }),
});
export type StreamPreset = keyof typeof streamPresets;
