// Structural types mirror cc-types design.rs (crates/cc-types/src/design.rs).
// Hosts parse transport data at the contract door; no contract dependency here.
export type DesignNumber = number;
export type DesignScale = number;
export interface BindingRange<T> {
  readonly at_zero: T;
  readonly at_one: T;
}
export interface LayerProperties {
  readonly x: DesignNumber;
  readonly y: DesignNumber;
  readonly width: number;
  readonly height: number;
  readonly scale: DesignScale;
  readonly opacity: number;
}
export type IntensityBinding =
  | { readonly property: 'opacity'; readonly output_range: BindingRange<number> }
  | { readonly property: 'scale'; readonly output_range: BindingRange<DesignScale> }
  | { readonly property: 'x'; readonly output_range: BindingRange<DesignNumber> }
  | { readonly property: 'y'; readonly output_range: BindingRange<DesignNumber> };

function clampIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) throw new RangeError('Intensity must be finite');
  return Math.max(0, Math.min(1, intensity));
}

/** Linear interpolation of contract-domain endpoints, including descending ranges. */
export function evaluateBinding(binding: IntensityBinding, intensity: number): number {
  const fraction = clampIntensity(intensity);
  const { at_zero, at_one } = binding.output_range;
  for (const endpoint of [at_zero, at_one]) {
    if (!Number.isFinite(endpoint)
      || (binding.property === 'opacity' && (endpoint < 0 || endpoint > 1))
      || (binding.property === 'scale' && endpoint < 0)) {
      throw new RangeError(`Invalid ${binding.property} binding endpoint`);
    }
  }
  if (fraction === 0) return at_zero;
  if (fraction === 1) return at_one;
  // Avoid overflowing the difference between opposite-sign finite endpoints.
  const value = (at_zero < 0) !== (at_one < 0)
    ? at_zero * (1 - fraction) + at_one * fraction
    : at_zero + (at_one - at_zero) * fraction;
  // Contain floating-point rounding within the endpoints' property domain.
  return Math.max(Math.min(at_zero, at_one), Math.min(Math.max(at_zero, at_one), value));
}

/** Return a fresh layout; bindings apply in list order (last duplicate wins). */
export function applyLayerBindings(
  baseProperties: LayerProperties,
  bindings: readonly IntensityBinding[],
  intensity: number,
): LayerProperties {
  const fraction = clampIntensity(intensity);
  const result = { ...baseProperties };
  for (const binding of bindings) result[binding.property] = evaluateBinding(binding, fraction);
  return result;
}

/**
 * Own the six --x/--y/--width/--height/--scale/--opacity custom properties on one
 * root. Values are plain numbers; host styles supply logical-pixel units.
 * Configuration is snapshotted. Recreate the binder when the layer changes.
 */
export function bindLayerBindings(
  root: { readonly style: Pick<CSSStyleDeclaration, 'setProperty'> },
  baseProperties: LayerProperties,
  bindings: readonly IntensityBinding[],
): (intensity: number) => boolean {
  const base = { ...baseProperties };
  const snapshot = bindings.map((binding) => ({ ...binding, output_range: { ...binding.output_range } }));
  let previous: number | undefined;
  return (intensity) => {
    const next = clampIntensity(intensity);
    if (next === previous) return false;
    const properties = applyLayerBindings(base, snapshot, next);
    for (const property of ['x', 'y', 'width', 'height', 'scale', 'opacity'] as const) {
      root.style.setProperty(`--${property}`, String(properties[property]));
    }
    previous = next;
    return true;
  };
}
