import type { ReactNode } from 'react';
import type { PrintStyle } from './heraldic-options.js';
import './heraldic-field.css';

export function FieldGroup({ label, control_id, hint, result, children, variant = 'input', style }: {
  label: string; control_id: string; hint?: ReactNode; result?: ReactNode; children: ReactNode;
  variant?: 'input' | 'select'; style?: PrintStyle;
}) {
  return <div className="cc-field" data-field={variant} style={style}>
    <label htmlFor={control_id}>{label}</label>{children}
    {hint !== undefined && <p className="cc-field-hint" id={`${control_id}-hint`}>{hint}</p>}
    {result !== undefined && <p className="cc-field-result" role="status">{result}</p>}
  </div>;
}
