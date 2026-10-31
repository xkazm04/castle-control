// Small simulated document for the site's DOM contract; no browser layout is claimed.
class FakeStyle {
  readonly properties = new Map<string, string>();
  transform = ''; color = ''; background = ''; left = ''; top = ''; width = ''; height = '';
  transition = ''; fill = ''; transformBox = ''; transformOrigin = '';
  setProperty(name: string, value: string): void { this.properties.set(name, value); }
  getPropertyValue(name: string): string { return this.properties.get(name) ?? ''; }
}

export class FakeNode {
  readonly attrs = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  textContent: string | null = null;
  id = ''; className = ''; type = ''; href = ''; tabIndex = 0; hidden = false; disabled = false;
  value = ''; scrollTop = 0; clientHeight = 0; scrollHeight = 0;
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  readonly classList = {
    contains: (cls: string): boolean => this.className.split(' ').includes(cls),
    toggle: (cls: string, force?: boolean): boolean => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      const on = force ?? !classes.has(cls);
      if (on) classes.add(cls); else classes.delete(cls);
      this.className = [...classes].join(' ');
      return on;
    },
  };

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  appendChild(node: FakeNode): FakeNode { this.append(node); return node; }
  get lastChild(): FakeNode | null { return this.children.at(-1) ?? null; }
  insertBefore(node: FakeNode, before: FakeNode | null): void {
    const index = before === null ? -1 : this.children.indexOf(before);
    if (index < 0) this.append(node); else this.children.splice(index, 0, node);
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = value;
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
  }
  removeAttribute(name: string): void { this.attrs.delete(name); }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  addEventListener(name: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], listener]);
  }
  emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) {
      if (typeof listener === 'function') listener(new Event(name));
      else listener.handleEvent(new Event(name));
    }
  }
  click(): void { this.emit('click'); }
  focus(): void {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement?.blur();
    this.ownerDocument.activeElement = this;
    this.emit('focus');
  }
  blur(): void { this.ownerDocument.activeElement = null; this.emit('blur'); }
  querySelectorAll(selector: string): FakeNode[] {
    const selectors = selector.split(',');
    return this.children.flatMap((child) => [
      ...(selectors.some((part) => part.startsWith('#') ? child.id === part.slice(1)
        : child.classList.contains(part.slice(1))) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string): FakeNode | null { return this.querySelectorAll(selector)[0] ?? null; }
}

export class FakeDocument {
  readonly created: FakeNode[] = [];
  readonly body = new FakeNode(this, 'BODY');
  readonly documentElement = new FakeNode(this, 'HTML');
  activeElement: FakeNode | null = null;
  createElement(tag: string): FakeNode {
    const node = new FakeNode(this, tag.toUpperCase());
    this.created.push(node);
    return node;
  }
  createElementNS(_namespace: string, tag: string): FakeNode { return this.createElement(tag); }
}
