export class JsonParseError extends SyntaxError {
  constructor(message?: string);
}
export function parseJson(text: string, options?: Readonly<{ max_bytes?: number }>): unknown;
