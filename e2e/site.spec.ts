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

for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
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

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test.describe(`stacked landing at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test('rooms, routes, labelled toys and type floor work offline with reduced motion', async ({ page }, testInfo) => {
      const external: string[] = [], errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => {
        if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      await page.goto('/?seed=lanterns');
      const stacked = page.locator('[data-role="stacked"]');
      await expect(stacked).toBeVisible(); await expect(page.locator('#stage')).toBeHidden();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Castle Control');
      await expect(stacked.locator('kbd')).toHaveCount(0);
      await expect(stacked.locator('header .cta')).toHaveAttribute('href', 'https://github.com/xkazm04/castle-control/releases');
      const overlays = stacked.locator('.stacked-art .dim, .stacked-art .litglow');
      expect(await overlays.count()).toBeGreaterThan(0);
      const visibleOverlays = () => overlays.evaluateAll((nodes) => nodes.filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && Number(style.opacity) !== 0;
      }).map((node) => ({ room: node.getAttribute('data-room'), cls: node.getAttribute('class') })));
      expect(await visibleOverlays()).toEqual([]);
      const wheel = page.locator('#lots [id="stacked-lots-lotWheel"]');
      await expect(wheel).toHaveCount(1);
      // The wheel group inherits SVG's default fill; its painted interior is explicit.
      const wheelInterior = wheel.locator('[style*="fill:"]').first();
      await expect(wheelInterior).toBeVisible();
      await expect(wheelInterior).not.toHaveCSS('fill', 'rgb(0, 0, 0)');
      await expect(wheelInterior).not.toHaveCSS('fill', 'none');
      await page.getByRole('button', { name: 'Use dark stock theme' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'stock');
      expect(await visibleOverlays()).toEqual([]);
      await expect(wheelInterior).not.toHaveCSS('fill', 'rgb(0, 0, 0)');
      await page.getByRole('button', { name: 'Use paper theme' }).click();
      for (const [id, name, stamp] of [
        ['lots', 'Lot Chamber', 'sample'], ['gate', 'Gatehouse', 'simulated'],
        ['beacons', 'Beacons', 'simulated'], ['map', 'Map Room', 'sample'],
      ]) {
        const section = page.locator(`#${id}`);
        await expect(section).toBeVisible();
        await expect(section.getByRole('heading', { level: 2 })).toHaveText(name!);
        await expect(section.locator(`.tlab [data-stamp="${stamp}"]`)).toBeVisible();
        await expect(section.locator('.stacked-art > svg')).toHaveCount(1);
      }
      const lots = page.locator('#lots');
      await expect(lots.locator('[data-role="toy-result"]')).toHaveText('cindergate44');
      await expect(lots.locator('[data-role="toy-proof"]')).toContainText('7e90abd4');
      await expect(lots.locator('[data-stamp="sealed"]')).toHaveAccessibleName(/Drawn$/);
      await expect(lots.locator('[data-stamp="sealed"]')).toBeVisible();
      await lots.getByLabel('Seed word').fill('lanterns'); await lots.getByRole('button', { name: 'Draw', exact: true }).tap();
      await expect(lots.locator('[data-role="toy-result"]')).toHaveText('cindergate44');
      const gate = page.locator('#gate');
      await gate.getByLabel('A chat line').fill('example.com'); await gate.getByRole('button', { name: 'Read it' }).tap();
      await expect(gate.locator('[data-role="toy-result"]')).toHaveText('Held · not on air');
      await expect(gate.locator('[data-stamp="held"]')).toBeVisible();
      await gate.getByLabel('A chat line').fill('hello keep'); await gate.getByRole('button', { name: 'Read it' }).tap();
      await expect(gate.locator('[data-role="toy-result"]')).toHaveText('Pass');
      await expect(gate.locator('[data-stamp="pass"]')).toBeVisible();
      const beacons = page.locator('#beacons'), slider = beacons.getByRole('slider', { name: 'Gifted subs: 18' });
      const flame = beacons.locator('[id="stacked-beacons-altarFlame"]');
      const before = await flame.getAttribute('style');
      await slider.focus(); await page.keyboard.press('End');
      await expect(beacons.locator('[data-role="toy-result"]')).toHaveText('100% blaze');
      await expect(flame).not.toHaveAttribute('style', before ?? '');
      await expect(flame).toHaveCSS('transition-property', 'none');
      const hex = page.locator('#map .stacked-hexes button').first();
      await expect(hex).toHaveAccessibleName('Hex 1: open ground');
      await hex.tap(); await expect(hex).toHaveAccessibleName('Hex 1: House Gules');
      await hex.focus(); await page.keyboard.press('Enter'); await expect(hex).toHaveAccessibleName('Hex 1: House Azure');
      await expect(page.locator('#map [data-role="toy-result"]')).toContainText('Azure');
      for (const id of ['lots', 'gate', 'beacons', 'map', 'steward', 'lots/features', 'gate/features', 'beacons/features', 'map/features']) {
        await page.evaluate((hash) => { location.hash = hash; }, id);
        const section = page.locator(`#${id.split('/')[0]}`);
        await expect(section).toBeFocused();
        await expect.poll(() => section.evaluate((node) => Math.abs(node.getBoundingClientRect().top))).toBeLessThan(2);
        if (id.endsWith('/features')) await expect(section.locator('details')).toHaveAttribute('open', '');
      }
      await expect(page.locator('#steward [data-role="principle"]')).toHaveCount(6);
      const audit = await stacked.evaluate((root) => {
        const sizes: number[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode, element = node.parentElement;
          // The keep's lettering is texture; every name and state also has HTML text.
          if (!node.textContent?.trim() || !element || element.closest('[aria-hidden="true"]') || !element.checkVisibility()) continue;
          sizes.push(parseFloat(getComputedStyle(element).fontSize));
        }
        const targets = [...root.querySelectorAll<HTMLElement>('a,button,input,summary')]
          .filter((node) => node.checkVisibility() && !node.classList.contains('skiplink') && !node.closest('[aria-hidden="true"]'))
          .map((node) => { const box = node.getBoundingClientRect(); return { label: node.textContent, width: box.width, height: box.height }; });
        return { smallest: Math.min(...sizes), count: sizes.length,
          undersized: targets.filter((box) => box.width < 44 || box.height < 44),
          overflow: document.documentElement.scrollWidth > innerWidth,
          reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          running: document.getAnimations().filter((animation) => animation.playState === 'running').length };
      });
      expect(audit.count).toBeGreaterThan(100); expect(audit.smallest).toBeGreaterThanOrEqual(13);
      expect(audit.undersized).toEqual([]); expect(audit.overflow).toBe(false); expect(audit.reduced).toBe(true); expect(audit.running).toBe(0);
      for (const width of [360, 390, 768, 1024, 1279]) {
        await page.setViewportSize({ width, height: viewport.height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.setViewportSize(viewport); await page.goto('/?seed=lanterns#lots');
      await expect(page.locator('#lots')).toBeFocused();
      await testInfo.attach('stacked-room', { body: await page.screenshot(), contentType: 'image/png' });
      expect(external).toEqual([]); expect(errors).toEqual([]);
    });
  });
}

test('resize switches at 1280 and preserves toy nodes and results across rotation', async ({ page }) => {
  await page.goto('/?seed=lanterns#lots');
  const seed = page.getByLabel('Seed word');
  await seed.evaluate((node) => node.setAttribute('data-simulated-identity', 'same-input'));
  await expect(page.locator('#toy [data-role="toy-result"]').first()).toHaveText('cindergate44');
  await page.setViewportSize({ width: 1279, height: 900 });
  await expect(page.locator('[data-role="stacked"]')).toBeVisible();
  await expect(page.locator('#lots [data-role="toy-result"]')).toHaveText('cindergate44');
  await expect(seed).toHaveAttribute('data-simulated-identity', 'same-input');
  await seed.fill('banner'); await page.locator('#lots').getByRole('button', { name: 'Draw', exact: true }).click();
  const winner = await page.locator('#lots [data-role="toy-result"]').textContent();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(seed).toHaveValue('banner');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('[data-role="stacked"]')).toHaveCount(0);
  await expect(page.locator('#stage')).toBeVisible();
  await expect(page.locator('#toy [data-role="toy-result"]').first()).toHaveText(winner!);
  await expect(seed).toHaveAttribute('data-simulated-identity', 'same-input');
});
