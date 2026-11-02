import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import type { PrintStyle } from './heraldic-options.js';
import './heraldic-field.css';

/** Point the control at the hint unless the caller already chose its own description. */
function describe(children: ReactNode, hintId: string, hinted: boolean): ReactNode {
  if (!hinted || !isValidElement<{ 'aria-describedby'?: string }>(children)
    || children.props['aria-describedby'] !== undefined) return children;
  return cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': hintId });
}

export function FieldGroup({ label, control_id, hint, result, children, variant = 'input', style }: {
  label: string; control_id: string; hint?: ReactNode; result?: ReactNode; children: ReactNode;
  variant?: 'input' | 'select'; style?: PrintStyle;
}) {
  const hint_id = `${control_id}-hint`;
  return <div className="cc-field" data-field={variant} style={style}>
    <label htmlFor={control_id}>{label}</label>{describe(children, hint_id, hint !== undefined)}
    {hint !== undefined && <p className="cc-field-hint" id={hint_id}>{hint}</p>}
    {result !== undefined && <p className="cc-field-result" role="status">{result}</p>}
  </div>;
}
