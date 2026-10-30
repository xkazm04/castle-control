/** Compile-only API subset for the uninstalled lane, never a runtime substitute.
 * tsconfig.json resolves the real installed Playwright declarations instead.
 */
export interface Locator {
  click(): Promise<void>;
  count(): Promise<number>;
}
export interface Page {
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): void;
  on(event: 'pageerror', listener: (error: Error) => void): void;
  context(): {
    route(pattern: string, handler: (route: {
      request(): { url(): string }; continue(): Promise<void>; abort(reason: string): Promise<void>;
    }) => Promise<void>): Promise<void>;
    routeWebSocket(pattern: string, handler: (socket: {
      url(): string; connectToServer(): void; close(options: { code: number; reason: string }): Promise<void>;
    }) => void): Promise<void>;
  };
  goto(url: string): Promise<unknown>;
  locator(selector: string): Locator;
  getByText(text: string, options: { exact: boolean }): Locator;
  getByRole(role: string, options: { name: string; exact?: boolean }): Locator;
  evaluate<Result>(fn: () => Result | Promise<Result>): Promise<Awaited<Result>>;
  evaluate<Result, Arg>(fn: (arg: Arg) => Result | Promise<Result>, arg: Arg): Promise<Awaited<Result>>;
  screenshot(options: { path: string; fullPage: boolean; animations: 'disabled'; caret: 'hide' }): Promise<unknown>;
}
type TestBody = (fixtures: { page: Page }, info: { title: string; project: { name: string } }) => Promise<void>;
export const test: {
  (title: string, body: TestBody): void;
  beforeAll(body: () => Promise<void>): void;
  afterAll(body: () => Promise<void>): void;
  beforeEach(body: TestBody): void;
  afterEach(body: TestBody): void;
};
export function expect(actual: unknown, message?: string): {
  toHaveText(text: string): Promise<void>;
  toBeVisible(): Promise<void>;
  toHaveCount(count: number): Promise<void>;
  toHaveURL(pattern: RegExp): Promise<void>;
  toHaveAttribute(name: string, value: string): Promise<void>;
  toBeFocused(): Promise<void>;
  toContainText(text: string): Promise<void>;
  toBeGreaterThan(value: number): void;
};
export function defineConfig(config: {
  testDir: string; testMatch: string; tsconfig: string; outputDir: string;
  fullyParallel: boolean; workers: number; retries: number; forbidOnly: boolean; timeout: number; reporter: string;
  use: { channel: 'chrome'; headless: boolean; baseURL: string; serviceWorkers: 'block'; reducedMotion: 'reduce'; trace: 'retain-on-failure' };
  projects: { name: string; use: { viewport: { width: number; height: number } } }[];
  webServer: { command: string; cwd: string; url: string; reuseExistingServer: boolean; timeout: number; stdout: 'pipe'; stderr: 'pipe' };
}): unknown;
