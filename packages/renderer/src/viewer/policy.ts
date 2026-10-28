import { parseViewerCard } from '../templates/viewer-card.ts';

/**
 * The bundled host supplies its reviewed hostname, never design/config data.
 * This checks an initial image URL; host CSP must enforce the same allowlist
 * for actual loads and redirects. No fetching or privilege grant happens here.
 */
export function allowedImageUrl(value: unknown, allowed_host: string): string | undefined {
  try {
    if (typeof value !== 'string' || /[\s\\]/u.test(value)
        || !/^[a-z0-9.-]+$/i.test(allowed_host)) return undefined;
    const host = new URL(`https://${allowed_host}`);
    if (host.hostname !== allowed_host.toLowerCase() || host.port !== '' || host.pathname !== '/') {
      return undefined;
    }
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== host.hostname || url.port !== ''
        || url.username !== '' || url.password !== '') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Reuses the viewer-card schema: Twitch ID, streamer approval and displayed
 * username are mandatory. The shell still authenticates identity/approval,
 * renders display_name as text and removes content when approval is revoked.
 */
export function allowsViewerContent(value: unknown): boolean {
  try {
    parseViewerCard(value);
    return true;
  } catch {
    return false;
  }
}
