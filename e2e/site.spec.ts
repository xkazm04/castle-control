import { expect, test } from '@playwright/test';

test('the overview keeps one drawing across twenty hover/focus changes and resets its headline', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/?hover=lots');
  const drawing = page.locator('#castle > svg');
  await expect(drawing).toHaveCount(1);
  await drawing.evaluate((svg) => svg.setAttribute('data-simulated-identity', 'original'));
  const inventory = await drawing.locator('*').count();
  expect(inventory).toBeGreaterThan(400);
  const rooms = ['lots', 'gate', 'beacons', 'map'];
  for (let index = 0; index < 20; index++) {
    const room = rooms[index % rooms.length];
    const hit = page.locator(`.hit[data-room="${room}"]`);
    if (index % 2) await hit.focus();
    else await hit.hover();
    await expect(page.locator('#castle')).toHaveClass(/focus/);
    await expect(drawing).toHaveAttribute('data-simulated-identity', 'original');
    expect(await drawing.locator('*').count()).toBe(inventory);
  }
  await page.locator('[data-role="cta"]').focus();
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-role="headline-name"]')).toHaveText('Castle Control');
  await expect(page.locator('#castle')).not.toHaveClass(/focus/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('chambers, nested features, cycling, invalid route and origin focus survive the cutover', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.hit[data-room="lots"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.hit[data-room="gate"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#lots$/);
  await expect(page.locator('#broadside')).toBeFocused();
  await expect(page.locator('.hit:enabled')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/#map$/);
  await page.goto('/#map/features');
  await expect(page.locator('[data-role="stage"]')).toHaveAttribute('data-level', '2');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#lots\/features$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#lots$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-role="stage"]')).toHaveAttribute('data-level', '0');
  await expect(page.locator('.hit[data-room="lots"]')).toBeFocused();
  await page.goto('/#lots/unrecognised');
  await expect(page.locator('[data-role="stage"]')).toHaveAttribute('data-level', '0');
  await page.getByRole('button', { name: 'Use dark stock theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'stock');
  await page.getByRole('button', { name: 'Use paper theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

test('the footer stays in one poster row and the study owns the visible project notices', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('#footer');
  const layout = await footer.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, height: bounds.height,
      items: Array.from(element.children, (child) => {
        const item = child.getBoundingClientRect();
        return { left: item.left, right: item.right, top: item.top, bottom: item.bottom };
      }) };
  });
  expect(layout).toMatchObject({ left: 28, right: 1412, bottom: 890, height: 40 });
  expect(layout.items).toHaveLength(4);
  for (const [index, item] of layout.items.entries()) {
    // The shared SAMPLE stamp's fixed tilt has a small optical overhang.
    expect(item.left).toBeGreaterThanOrEqual(index === 0 ? 26 : 28);
    expect(item.right).toBeLessThanOrEqual(1412);
    expect(item.top).toBeGreaterThanOrEqual(850);
    expect(item.bottom).toBeLessThanOrEqual(890);
  }
  const cta = footer.getByRole('link', { name: 'Get the app: the same keep, with live state →' });
  await expect(cta).toHaveAttribute('href', 'https://github.com/xkazm04/castle-control/releases');
  await expect(page.locator('[data-role="topbar"] #theme')).toHaveAccessibleName('Use dark stock theme');
  await expect(page.locator('[data-role="keys"] kbd')).toHaveText(['1', '4', '0', 'Esc']);
  await page.getByRole('link', { name: 'The Steward’s study' }).click();
  const notices = page.locator('.steward-notices');
  await expect(notices).toBeVisible();
  await expect(notices).toContainText('Castle Control is a working name.');
  await expect(notices).toContainText('Not affiliated with or endorsed by Twitch.');
  await expect(notices).toContainText('check releases for signing status');
  await expect(notices).toContainText('Public Extension availability awaits Twitch approval and review.');
  await expect(notices.getByRole('link', { name: 'Docs' })).toBeVisible();
  await expect(notices.getByRole('link', { name: 'Source', exact: true })).toBeVisible();
  await expect(cta).toBeHidden();
});

test('native Skip is early, survives keyboard/pointer activation, and returns focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const activation of ['Enter', 'Space', 'pointer']) {
    await page.goto('/');
    const skip = page.getByRole('button', { name: 'Skip intro' });
    await expect(skip).toBeVisible();
    if (activation === 'pointer') {
      const box = await skip.boundingBox();
      if (!box) throw new Error('Skip has no hit box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(skip).toBeVisible();
      await page.mouse.up();
    } else {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
      await page.keyboard.down(activation);
      // Enter clicks on press; Space must survive until release.
      if (activation === 'Space') await expect(skip).toBeVisible();
      await page.keyboard.up(activation);
    }
    await expect(skip).toBeHidden();
    await expect(page.locator('.hit[data-room="lots"]')).toBeFocused();
    await expect(page.locator('[data-role="stage"]')).toHaveAttribute('data-phase', 'overview');
  }
});

for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [390, 844]] as const) {
  test(`stage fit and calm reduced motion at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const actual = await page.locator('#stage').evaluate((stage) => {
      const rect = stage.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, top: rect.top,
        overflow: document.documentElement.scrollWidth > innerWidth,
        animations: document.getAnimations().filter((animation) => animation.playState === 'running').length };
    });
    const scale = Math.min(width / 1440, height / 900);
    expect(actual.width).toBeCloseTo(1440 * scale, 2);
    expect(actual.height).toBeCloseTo(900 * scale, 2);
    expect(actual.left).toBeGreaterThanOrEqual(-.01);
    expect(actual.top).toBeGreaterThanOrEqual(-.01);
    expect(actual.overflow).toBe(false);
    expect(actual.animations).toBe(0);
    await expect(page.getByRole('button', { name: 'Skip intro' })).toBeHidden();
  });
}
