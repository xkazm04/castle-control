export const stageSize = { width: 1440, height: 900 } as const;

export function fit(width: number, height: number): number {
  return Math.min(width / stageSize.width, height / stageSize.height);
}

export function bindFit(window: Window, stage: HTMLElement): () => void {
  const resize = (): void => stage.style.setProperty('--fit', String(fit(window.innerWidth, window.innerHeight)));
  resize();
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}
