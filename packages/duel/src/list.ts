export type DuelItemId = string & { readonly __brand: 'DuelItemId' };
export interface DuelItem {
  readonly id: DuelItemId;
  readonly title: string;
  readonly by: string;
  readonly note?: string;
}
export interface DuelList {
  readonly title: string;
  readonly prompt?: string;
  readonly items: readonly DuelItem[];
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Expected a plain object');
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key))) {
    throw new TypeError('Unknown key');
  }
  return value as Record<string, unknown>;
}

function nonblank(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be nonblank`);
  return value.trim();
}

/** Shared slug validation; only the list door brands a validated slug as an item id. */
export function parseSlug(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new TypeError('Expected a slug');
  }
  return value;
}

/** The sole minting door for contestant ids; callers supply objects, never JSON text. */
export function parseDuelList(value: unknown): DuelList {
  const list = record(value, ['title', 'prompt', 'items']);
  const title = nonblank(list.title, 'List title');
  const prompt = Object.hasOwn(list, 'prompt') ? nonblank(list.prompt, 'Prompt') : undefined;
  if (!Array.isArray(list.items) || list.items.length < 2 || list.items.length > 64) {
    throw new TypeError('A list needs 2 to 64 items');
  }
  const ids = new Set<string>();
  const items = Array.from(list.items, (value: unknown): DuelItem => {
    const item = record(value, ['id', 'title', 'by', 'note']);
    const id = parseSlug(item.id);
    if (ids.has(id)) throw new TypeError('Duplicate item id');
    ids.add(id);
    if (Object.hasOwn(item, 'note') && typeof item.note !== 'string') {
      throw new TypeError('Note must be text');
    }
    return Object.freeze({
      id: id as DuelItemId,
      title: nonblank(item.title, 'Item title'),
      by: nonblank(item.by, 'Item by'),
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    });
  });
  return Object.freeze({ title, ...(prompt === undefined ? {} : { prompt }), items: Object.freeze(items) });
}

/** Winner's mk rule, including leading/trailing hyphens; the list door validates the result. */
export function slugId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
