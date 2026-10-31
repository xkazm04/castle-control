// Small simulated document for the site's DOM contract; no browser layout is claimed.
class FakeStyle {
  readonly properties = new Map<string, string>();
  transform = ''; color = ''; background = ''; left = ''; top = ''; width = ''; height = '';
  setProperty(name: string, value: string): void { this.properties.set(name, value); }
}

export class FakeNode {
  readonly attrs = new Map<string, string>();
  readonly children: FakeNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  textContent: string | null = null;
  id = ''; className = ''; type = ''; href = ''; tabIndex = 0; hidden = false; disabled = false;
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
    const classes = selector.split(',').map((part) => part.slice(1));
    return this.children.flatMap((child) => [
      ...(classes.some((cls) => child.classList.contains(cls)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
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
