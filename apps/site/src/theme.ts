export function nextTheme(current: string | undefined): 'paper' | 'stock' {
  return current === 'stock' ? 'paper' : 'stock';
}

export function toggleTheme(root: HTMLElement, button: HTMLButtonElement): void {
  const theme = nextTheme(root.dataset['theme']);
  root.dataset['theme'] = theme;
  button.setAttribute('aria-pressed', String(theme === 'stock'));
  button.setAttribute('aria-label', theme === 'stock' ? 'Use paper theme' : 'Use dark stock theme');
  button.textContent = theme === 'stock' ? 'Paper' : 'Dark stock';
}
