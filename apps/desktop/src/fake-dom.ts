// Minimal DOM so React can mount and re-render in the node test environment.
// It paints nothing: tests count calls made while React re-renders.
export class FakeNode {
  nodeType: number; nodeName: string; tagName: string; namespaceURI = 'http://www.w3.org/1999/xhtml';
  childNodes: FakeNode[] = []; parentNode: FakeNode | null = null;
  style: Record<string, unknown> = { setProperty: () => {}, removeProperty: () => {} };
  nodeValue: string | null = null; ownerDocument: FakeNode | undefined;
  attributes = new Map<string, string>(); activeElement: FakeNode | null = null; options: FakeNode[] = [];
  constructor(nodeType: number, name: string, doc?: FakeNode) {
    this.nodeType = nodeType; this.nodeName = name; this.tagName = name.toUpperCase(); this.ownerDocument = doc;
  }
  get firstChild(): FakeNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): FakeNode | null { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): FakeNode | null { const peers = this.parentNode?.childNodes ?? []; return peers[peers.indexOf(this) + 1] ?? null; }
  get previousSibling(): FakeNode | null { const peers = this.parentNode?.childNodes ?? []; return peers[peers.indexOf(this) - 1] ?? null; }
  set textContent(value: string) {
    this.childNodes.forEach(child => { child.parentNode = null; }); this.childNodes = [];
    if (value) { const text = new FakeNode(3, '#text', this.ownerDocument); text.nodeValue = value; this.appendChild(text); }
  }
  get textContent(): string { return this.nodeValue ?? this.childNodes.map(child => child.textContent).join(''); }
  appendChild(child: FakeNode) { return this.insertBefore(child, null); }
  insertBefore(child: FakeNode, before: FakeNode | null) {
    child.parentNode?.removeChild(child);
    const at = before ? this.childNodes.indexOf(before) : -1;
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child); child.parentNode = this; return child;
  }
  removeChild(child: FakeNode) { this.childNodes = this.childNodes.filter(item => item !== child); child.parentNode = null; return child; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  setAttributeNS(_ns: string | null, name: string, value: string) { this.setAttribute(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  removeEventListener() {}
  getRootNode() { return this; }
}

export function installFakeDom(): { container: Element; uninstall: () => void } {
  const document = new FakeNode(9, '#document');
  document.ownerDocument = document;
  const doc = document as FakeNode & Record<string, unknown>;
  doc['createElement'] = (name: string) => new FakeNode(1, name, document);
  doc['createElementNS'] = (_ns: string, name: string) => new FakeNode(1, name, document);
  doc['createTextNode'] = (text: string) => { const node = new FakeNode(3, '#text', document); node.nodeValue = text; return node; };
  doc['createComment'] = (text: string) => { const node = new FakeNode(8, '#comment', document); node.nodeValue = text; return node; };
  const saved = { window: Reflect.get(globalThis, 'window'), document: Reflect.get(globalThis, 'document'),
    act: Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT') };
  Reflect.set(globalThis, 'window', globalThis); Reflect.set(globalThis, 'document', document);
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true); Reflect.set(globalThis, 'HTMLIFrameElement', class {});
  const container: unknown = new FakeNode(1, 'div', document);
  return { container: container as Element, uninstall() {
    Reflect.set(globalThis, 'window', saved.window); Reflect.set(globalThis, 'document', saved.document);
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', saved.act); Reflect.deleteProperty(globalThis, 'HTMLIFrameElement');
  } };
}
