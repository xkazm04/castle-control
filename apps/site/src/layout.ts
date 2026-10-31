// CSS follows the root class set by this query; there is no second CSS breakpoint.
export const stackedQuery = '(max-width: 1279px)';

export function bindLayout(media: MediaQueryList, change: (stacked: boolean) => void): () => void {
  const update = (): void => change(media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
