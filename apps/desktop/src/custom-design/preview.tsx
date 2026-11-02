import { lazy, Suspense } from 'react';
import type { PreviewArt } from '@castle-control/ui/living-preview';

// The living preview (and its styles) load with the first preview, never with the shell.
const Living = lazy(async () => ({ default: (await import('@castle-control/ui/living-preview')).LivingPreview }));

export function CustomPreview({ art, note }: { art: PreviewArt; note?: string | undefined }) {
  return <Suspense fallback={<p role="status">Opening the preview...</p>}>
    <Living art={art} {...(note ? { note } : {})} />
  </Suspense>;
}
