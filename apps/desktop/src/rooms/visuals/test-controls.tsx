import { Children, isValidElement } from 'react';
import type { FormEvent, ReactNode } from 'react';

export type Control = { children?: ReactNode; name?: string; defaultValue?: string | number;
  onClick?: () => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void | Promise<void> };

export function controls(tree: ReactNode): Control[] {
  const found: Control[] = [];
  Children.forEach(tree, child => {
    if (isValidElement<Control>(child)) found.push(child.props, ...controls(child.props.children));
  });
  return found;
}

export function submitEvent(): FormEvent<HTMLFormElement> {
  return { preventDefault: () => undefined, currentTarget: {} } as FormEvent<HTMLFormElement>;
}
