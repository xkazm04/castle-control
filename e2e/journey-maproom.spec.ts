import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditFields, auditStyles, desktopSurfaces } from './styles.ts';

test('local Map Room journey: inspect tiles and banners, edit the map, inspect locked stages', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    await expect(page.locator('.cc-sample')).toHaveText('Simulated');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await expect(room).toBeVisible();
    const tile = room.locator('[data-hex-tile="D4"]');
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('Now: inspecting D4');
    await page.keyboard.press('ArrowRight');
    await expect(room.getByRole('status').filter({ hasText: 'Now: inspecting E4' })).toBeVisible();
    const banner = room.getByRole('button', { name: 'Inspect House Tallow banner', exact: true });
    await banner.focus();
    await page.keyboard.press('Space');
    await expect(banner).toHaveAttribute('aria-pressed', 'true');
    await expect(room.locator('[data-hex-tile="F1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('House Tallow');

    const size = room.getByLabel('Map size', { exact: true });
    await size.selectOption('l');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(96);
    await room.locator('[data-hex-tile="L8"]').click();
    await size.selectOption('s');
    await expect(room.locator('[data-hex-tile]')).toHaveCount(24);
    await expect(room.locator('[data-hex-tile="A1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(room.getByLabel('Selected tile', { exact: true })).toContainText('Now: inspecting A1');
    // Native selects/number fields use the same keyboard path as other kit fields.
    await room.getByLabel('Map anchor', { exact: true }).selectOption('bottom_right');
    await room.getByLabel('Preset colour', { exact: true }).selectOption('azure');
    await room.getByLabel('Art style', { exact: true }).selectOption('pixel');
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('850');
    const preview = room.getByRole('figure', { name: 'Session-only map preview' });
    await expect(preview).toHaveAttribute('data-size', 's');
    await expect(preview).toHaveAttribute('data-anchor', 'bottom_right');
    await expect(preview).toHaveAttribute('data-colour', 'azure');
    await expect(preview).toHaveAttribute('data-reveal-ms', '850');
    await expect(preview.locator('img')).toHaveAttribute('src', '/art/preset-pixel-hexmap.webp');
    await expect(preview).toContainText('SIMULATED');
    await expect(room.getByText('Session only', { exact: false })).toBeVisible();
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('-1');
    await expect(room.getByRole('alert')).toContainText('whole number from 0 to 60000');
    await expect(preview).toHaveAttribute('data-reveal-ms', '850');
    await room.getByLabel('Reveal timing (ms)', { exact: true }).fill('0');
    await expect(preview).toHaveAttribute('data-reveal-ms', '0');
    await room.getByRole('button', { name: 'Replay local reveal', exact: true }).click();
    await expect(preview).toHaveAttribute('data-reveal-run', '1');

    for (const stage of ['Muster', 'Proclaimed', 'Sand table']) {
      const control = room.getByRole('button', { name: `Inspect ${stage} requirements`, exact: true });
      await control.focus();
      await page.keyboard.press('Enter');
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await expect(room.locator('.cc-proclamation')).toContainText(`Requirements · ${stage}`);
      if (stage === 'Muster') await expect(room.locator('.cc-proclamation')).toContainText(
        'Locked. Hosted testing waits for Twitch’s answer on the Extension policy. No Extension is built or connected.');
      await expect(room).not.toContainText('WP 4.0');
      await expect(room.locator('[data-rung="0"]')).toHaveAttribute('data-current', 'true');
      await expect(room.locator('[data-rung="1"]')).toHaveAttribute('data-locked', 'true');
      await expect(room.locator('[data-rung="2"]')).toHaveAttribute('data-locked', 'true');
    }
    await expect(room).toContainText('The room awaits Twitch’s answer on the Extension policy. It makes no network call and cannot advance the test stage.');
    await expect(room).not.toContainText('WP 4.0');
    await auditStyles(page, desktopSurfaces);
    await auditFields(page);
    await room.getByRole('button', { name: 'Reset local design', exact: true }).click();
    await expect(room.locator('[data-hex-tile]')).toHaveCount(54);
    await expect(preview).toHaveAttribute('data-anchor', 'centre');
    await expect(preview.locator('img')).toHaveAttribute('src', '/art/preset-heraldic-hexmap.webp');
  } finally { await page.goto('about:blank'); verify(); }
});

test('Map Room Spyglass: viewer sizes, isolated picks, current/draft review, seal and tear-up', async ({ page }, info) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/chamber/studio');
    const room = page.getByRole('region', { name: 'Map Room work', exact: true });
    await expect(room).toBeVisible();
    await room.locator('[data-hex-tile="D4"]').click();
    const inspector = room.getByLabel('Selected tile', { exact: true });
    await expect(inspector).toContainText('Now: inspecting D4');
    const ownership = await room.locator('[data-hex-tile]').evaluateAll(nodes => nodes.map(node =>
      [node.getAttribute('data-hex-tile'), node.getAttribute('data-house'), node.getAttribute('data-ink')]));
    const toggle = room.getByRole('button', { name: 'Spyglass', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const spyglass = room.getByRole('region', { name: 'Spyglass', exact: true });
    const frames = spyglass.locator('[data-viewer-frame]');
    await expect(frames).toHaveCount(1);
    await expect(frames).toContainText('SIMULATED VIEWER PREVIEW · no Extension is built');
    await expect(spyglass.getByRole('button')).toHaveCount(58);
    await expect(spyglass.getByRole('button', { name: /Submit/ })).toHaveCount(0);
    for (const [label, id, pixels] of [['Panel', 'panel', '33'], ['Mobile', 'mobile', '37'],
      ['Video overlay', 'video-overlay', '130'], ['OBS 1080p', 'obs-1080p', '196']] as const) {
      await spyglass.getByRole('button', { name: label, exact: true }).click();
      await expect(frames).toHaveAttribute('data-viewer-frame', id);
      await expect(frames.locator('.studio-frame-readout')).toContainText(`${pixels} px hexes`);
      await expect(frames.locator('[data-hex-tile]')).toHaveCount(54);
      if (id === 'panel' || id === 'mobile') await expect(frames).toContainText('below the 44 px tap target');
      else await expect(frames).toContainText('Labels legible at source size');
    }
    await expect(frames).toBeVisible();
    // Detect clipping or unscaled labels: the CSS canvas must really fit the frame.
    const measured = await frames.evaluate(element => {
      const frame = element.querySelector('.studio-viewer-frame')?.getBoundingClientRect();
      const canvas = element.querySelector('.studio-viewer-canvas')?.getBoundingClientRect();
      const tile = element.querySelector('[data-hex-tile]')?.getBoundingClientRect();
      if (!frame || !canvas || !tile) throw new Error('Missing viewer canvas geometry');
      return { width_error: Math.abs(frame.width - canvas.width), height_error: Math.abs(frame.height - canvas.height),
        source_hex: tile.width * 1920 / frame.width };
    });
    expect(measured.width_error).toBeLessThan(1); expect(measured.height_error).toBeLessThan(1);
    expect(Math.floor(measured.source_hex)).toBe(196);
    await frames.locator('[data-hex-tile="C3"]').focus(); await page.keyboard.press('Space');
    await expect(spyglass.getByRole('status', { name: 'Simulated viewer pick' })).toContainText('Your pick: C3 · simulated viewer');
    await expect(inspector).toContainText('Now: inspecting D4');
    await expect(room.locator('.room-proposal-draft')).toHaveCount(0);
    expect(await frames.locator('[data-hex-tile]').evaluateAll(nodes => nodes.map(node =>
      [node.getAttribute('data-hex-tile'), node.getAttribute('data-house'), node.getAttribute('data-ink')]))).toEqual(ownership);
    for (const [size, count] of [['l', 96], ['s', 24], ['m', 54]] as const) {
      await room.getByLabel('Map size', { exact: true }).selectOption(size);
      await expect(frames.locator('[data-hex-tile]')).toHaveCount(count);
      await expect(frames.locator('.cc-hexfield')).toHaveAttribute('data-map-size', size);
    }
    await page.screenshot({ path: info.outputPath('maproom-spyglass-obs.png'), fullPage: true, animations: 'disabled', caret: 'hide' });

    const dialog = page.getByRole('dialog', { name: 'War-table panel design', exact: true });
    const open = async () => room.getByRole('group', { name: 'War-table panel design', exact: true })
      .getByRole('button', { name: 'Custom design', exact: true }).click();
    const draft = async (prompt: string) => {
      await open();
      await dialog.getByRole('textbox', { name: 'Describe a style', exact: true }).fill(prompt);
      await dialog.getByRole('button', { name: 'Custom design', exact: true }).click();
      await dialog.getByRole('button', { name: 'Preview draft', exact: true }).click();
    };
    const seal = async () => {
      const hold = dialog.getByRole('button', { name: 'Hold to seal and proclaim', exact: true });
      await hold.focus(); await page.keyboard.down('Space');
      await expect(dialog.getByRole('button', { name: 'Preview draft', exact: true })).toHaveCount(0);
      await page.keyboard.up('Space');
      await dialog.getByRole('button', { name: 'Back to the room', exact: true }).click();
    };
    await draft('A quiet engraved map');
    await dialog.getByRole('button', { name: 'Back to the room', exact: true }).click();
    await expect(frames).toHaveCount(2);
    await expect(frames.nth(0)).toContainText('Current');
    await expect(frames.nth(1)).toContainText('Draft · NOT ON AIR');
    await expect(frames.nth(0).locator('[data-look-ink]')).toHaveAttribute('data-treatment', 'halftone');
    await expect(frames.nth(1).locator('[data-look-ink]')).toHaveAttribute('data-treatment', 'engraved');
    await expect(frames.nth(1).locator('[data-look-ink]')).toHaveAttribute('data-density', 'quiet');
    await room.getByRole('button', { name: 'Review design', exact: true }).click();
    await seal();
    await expect(frames).toHaveCount(1);
    await room.getByRole('button', { name: 'Table', exact: true }).click();
    const table = room.locator('.studio-table-work [data-look-ink]');
    await expect(table).toHaveAttribute('data-treatment', 'engraved');
    await expect(table).toHaveAttribute('data-density', 'quiet');
    await expect(table).toHaveAttribute('data-look-ink', 'key');
    await toggle.click();

    // Two previews against one base: sealing the second must mark the first STALE.
    await draft('A bold plain map');
    await dialog.getByRole('button', { name: 'Back to the room', exact: true }).click();
    await draft('A quiet engraved map'); await seal();
    await expect(frames.nth(1)).toContainText('STALE');
    await room.getByRole('button', { name: 'Review design', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Hold to seal and proclaim', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Tear it up', exact: true }).click();
    await dialog.getByRole('button', { name: 'Back to the room', exact: true }).click();
    await expect(frames).toHaveCount(1);
    await expect(frames.locator('[data-look-ink]')).toHaveAttribute('data-treatment', 'engraved');
    await expect(frames.locator('[data-look-ink]')).toHaveAttribute('data-density', 'quiet');
    await expect(room).toContainText('The room awaits Twitch’s answer on the Extension policy. It makes no network call and cannot advance the test stage.');
    await expect(room).not.toContainText('WP 4.0');
    await auditStyles(page, desktopSurfaces); await auditFields(page);
  } finally { await page.goto('about:blank'); verify(); }
});
