export function element<K extends keyof HTMLElementTagNameMap>(
  document: Document, tag: K, options: { id?: string; cls?: string; role?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.cls) node.className = options.cls;
  if (options.role) node.dataset['role'] = options.role;
  if (options.text) node.textContent = options.text;
  return node;
}

export function button(document: Document, text: string, run: () => void): HTMLButtonElement {
  const node = element(document, 'button', { text });
  node.type = 'button';
  node.addEventListener('click', run);
  return node;
}
