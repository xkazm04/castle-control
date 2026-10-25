/** Bind a plain intensity number to CSS variables on one root, without rebuilding DOM. */
export function bindIntensity(
  root: { readonly style: Pick<CSSStyleDeclaration, 'setProperty'> },
  properties: readonly `--${string}`[] = ['--intensity'],
): (intensity: number) => boolean {
  const names = [...new Set(properties)];
  if (names.length === 0 || names.some((name) => !/^--[A-Za-z_][A-Za-z0-9_-]*$/.test(name))) {
    throw new TypeError('Intensity bindings require CSS custom property names');
  }
  let previous: number | undefined;
  return (intensity) => {
    if (!Number.isFinite(intensity)) throw new RangeError('Intensity must be finite');
    const next = Math.max(0, Math.min(1, intensity));
    if (next === previous) return false;
    for (const name of names) root.style.setProperty(name, String(next));
    previous = next;
    return true;
  };
}
