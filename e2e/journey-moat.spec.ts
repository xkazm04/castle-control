import { test, expect } from '@playwright/test';
import { guardPage } from './network.ts';
import { auditStyles, desktopSurfaces } from './styles.ts';

const drill = '/#/chamber/moderator/drill';
const held = 'Held 3 of 40 · simulated';

test('the drill opens on a finished moat: three stamps, a labelled gap and one live count', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
    await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1);
    await expect(moat.getByRole('button', { name: /^Held, not on air: simulated-message-\d+, rule [a-z-]+\. Inspect\.$/ })).toHaveCount(3);
    await expect(moat.locator('.moat-gap-label')).toHaveText('RECORDING GAP');
    await expect(moat.locator('.moat-gap-note')).toHaveText('missing, not replayed');
    await expect(page.getByText('message text is never shown')).toBeVisible();
    // The table is still the accessible equivalent, and it names the same rules.
    await expect(page.getByRole('table', { name: 'Simulated replay outcomes', exact: true })).toContainText('rule · links · Delete message');
    // The e2e lane runs with reduced motion: the finished frame, Play off, the scrubber live.
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.getByText('Reduced motion is on')).toBeVisible();
    await auditStyles(page, desktopSurfaces);
  } finally { verify(); }
});

test('a stamp opens its inspector, and the inspector opens the rule bench on that rule', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const inspector = page.getByRole('complementary', { name: 'Selected message', exact: true });
    await expect(inspector).toContainText('Nothing selected');
    const stamp = page.getByRole('button', { name: /rule repeats\. Inspect\.$/ });
    await stamp.focus();
    await page.keyboard.press('Enter');
    await expect(stamp).toHaveAttribute('aria-pressed', 'true');
    await expect(inspector).toContainText('Time out');
    await expect(inspector).toContainText('repeats');
    await expect(inspector).toContainText('No message text is stored or shown');
    // The table scrolls the same message into its window and marks it.
    const row = page.locator('.moat-row[data-selected="true"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('simulated-message-17');
    await expect.poll(() => row.evaluate(element => {
      const box = element.closest('.cc-window')?.getBoundingClientRect();
      const at = element.getBoundingClientRect();
      return !!box && at.top >= box.top - 1 && at.bottom <= box.bottom + 1;
    })).toBe(true);
    await inspector.getByRole('link', { name: 'Open rule repeats in the rule bench', exact: true }).click();
    await expect(page).toHaveURL(/#\/chamber\/moderator$/);
    const bench = page.getByRole('region', { name: 'Rule bench', exact: true });
    await expect(bench.getByRole('combobox', { name: 'Watching rule' })).toHaveValue('repeats');
  } finally { verify(); }
});

test('Next and Previous stop walk the stamps in order and select each one', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const inspector = page.getByRole('complementary', { name: 'Selected message', exact: true });
    await page.getByRole('slider', { name: 'Replay position', exact: true }).fill('0');
    await expect(page.getByRole('button', { name: 'Previous stop', exact: true })).toBeDisabled();
    const next = page.getByRole('button', { name: 'Next stop', exact: true });
    for (const id of ['simulated-message-7', 'simulated-message-17', 'simulated-message-18']) {
      await next.click();
      await expect(inspector).toContainText(id);
      await expect(page.getByRole('button', { name: new RegExp(`${id}, rule`) })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: 'Previous stop', exact: true }).click();
    await expect(inspector).toContainText('simulated-message-17');
    await expect(page.getByRole('status').filter({ hasText: 'Held 2 of 40' })).toHaveCount(1);
  } finally { verify(); }
});

test('the Keep moat bar loops a labelled sample and leads to the full replay', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/keep');
    const bar = page.locator('.keep-moat');
    await expect(bar.getByRole('img', { name: 'Sample replay loop · simulated', exact: true })).toBeVisible();
    await expect(bar).toContainText('Sample replay · simulated');
    // A loop that starts by itself can be stopped (reduced motion, which this lane runs under, never starts it).
    await expect(bar.getByRole('button', { name: /sample loop/ })).toHaveCount(0);
    await auditStyles(page, desktopSurfaces);
    await bar.getByRole('link', { name: 'Watch the full replay', exact: true }).click();
    await expect(page).toHaveURL(/#\/chamber\/moderator\/drill$/);
    await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1);
  } finally { verify(); }
});

test('the Keep tour reads the Map Room as a chat duel and its chips open each chamber with its demo ready', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto('/#/keep');
    const plaque = page.locator('[data-role="plaque"][data-room="studio"]');
    await expect(plaque.locator('[data-role="plaque-word"]')).toHaveText('Chat duel');
    await expect(plaque).not.toContainText(/sand table|war table|local test/i);
    // The Keep has no Steward; the tour of the chambers lives in the Steward on the overview.
    await expect(page.locator('.cc-steward-dock')).toHaveCount(0);
    await page.goto('/#/overview');
    const dock = page.locator('.cc-steward-dock');
    await dock.getByRole('button', { name: 'Play demo', exact: true }).first().click();
    for (const option of ['Start with the Lot Chamber', 'Next: the Gatehouse', 'Next: Beacons and the Map Room', 'Show me the Map Room']) {
      await dock.locator('.cc-steward-option', { hasText: option }).first().click();
    }
    const seal = dock.getByRole('button', { name: /hold to/i }).first();
    await seal.focus(); await page.keyboard.down('Space');
    try { await expect(dock.getByRole('button', { name: 'Play the Map Room demo', exact: true })).toBeVisible(); }
    finally { await page.keyboard.up('Space'); }
    for (const name of ['Lot Chamber', 'Gatehouse', 'Beacons']) await expect(dock.getByRole('button', { name: `Play the ${name} demo`, exact: true })).toBeVisible();
    await dock.getByRole('button', { name: 'Play the Map Room demo', exact: true }).click();
    await expect(page).toHaveURL(/#\/chamber\/studio$/);
    await expect(page.locator('.cc-steward-dock[data-chamber="studio"] .cc-steward-step')).toBeVisible();
  } finally { verify(); }
});

test('spotlighting a rule keeps its stamp, dims the rest, and Next stop walks only that rule', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
    const spotlight = page.getByRole('group', { name: 'Spotlight a rule', exact: true });
    const repeats = spotlight.getByRole('button', { name: 'repeats · 1', exact: true });
    await expect(repeats).toHaveAttribute('aria-pressed', 'false');
    await repeats.click();
    await expect(repeats).toHaveAttribute('aria-pressed', 'true');
    await expect(spotlight).toContainText('Stamps for rule repeats only');
    await expect(moat.getByRole('button', { name: /Held, not on air/ })).toHaveCount(1);
    await expect(moat.getByRole('button', { name: /rule repeats\. Inspect\.$/ })).toHaveCount(1);
    await expect(moat.locator('.moat-marker[data-dim="true"]')).toHaveCount(2);
    // The live count is about the whole night, not the spotlight.
    await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1);
    await page.getByRole('slider', { name: 'Replay position', exact: true }).fill('0');
    await page.getByRole('button', { name: 'Next stop', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Selected message', exact: true })).toContainText('simulated-message-17');
    await expect(page.getByRole('button', { name: 'Next stop', exact: true })).toBeDisabled();
    // Back to every rule: the playhead sits at the repeats stop, so links has landed and blocked-terms has not.
    await repeats.click();
    await expect(moat.getByRole('button', { name: /Held, not on air/ })).toHaveCount(2);
    await expect(moat.locator('.moat-marker[data-dim="true"]')).toHaveCount(0);
  } finally { verify(); }
});

test('a busy night of 2,000 simulated messages pages the strip, says what it merged, and goes back', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    const busy = page.getByRole('button', { name: 'Replay a busy night · 2,000 simulated messages', exact: true });
    const compare = page.getByRole('button', { name: 'Compare with a simulated candidate', exact: true });
    await expect(busy).toHaveAttribute('aria-pressed', 'false');
    await busy.click();
    await expect(busy).toHaveAttribute('aria-pressed', 'true');
    await expect(compare).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Held 150 of 2,000 · simulated' })).toHaveCount(1);
    await expect(page.getByText('Showing part of the night; the view turns with the playhead.')).toBeVisible();
    // The stamps on screen stay a readable handful, however long the night is.
    const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
    expect(await moat.getByRole('button', { name: /Held, not on air/ }).count()).toBeLessThanOrEqual(9);
    await expect(page.getByRole('group', { name: 'Spotlight a rule', exact: true }).getByRole('button')).toHaveCount(3);
    await auditStyles(page, desktopSurfaces);
    await busy.click();
    await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1);
    await expect(compare).toBeVisible();
  } finally { verify(); }
});

test('a simulated candidate is drawn under the baseline on one playhead, and a ringed dot shows what changed', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.goto(drill);
    await expect(page.getByRole('group', { name: 'Baseline and candidate moats, simulated replay' })).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Compare with a simulated candidate', exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const both = page.getByRole('group', { name: 'Baseline and candidate moats, simulated replay', exact: true });
    await expect(both.locator('.moat-scene')).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: 'Baseline held 3 of 40 · candidate held 6 of 40 · simulated' })).toHaveCount(1);
    await expect(both.locator('.moat-changed').first()).toBeVisible();
    // A new stop in the candidate: its stamp opens a side-by-side inspector.
    const stamp = both.locator('.moat-scene').nth(1).locator('button.moat-stamp[data-changed="true"]').first();
    await stamp.click();
    const inspector = page.getByRole('complementary', { name: 'Selected message', exact: true }).last();
    await expect(inspector).toContainText('Changed by the candidate');
    await expect(inspector).toContainText('Aired');
    await toggle.click();
    await expect(both).toHaveCount(0);
  } finally { verify(); }
});

test('the night report is not on screen and prints on its own sheet', async ({ page }) => {
  const verify = await guardPage(page);
  try {
    await page.addInitScript(() => {
      // Keep the report that print would have received, so the sheet can be inspected.
      window.print = () => { document.body.append(document.querySelector('[data-moat-report]')?.cloneNode(true) ?? ''); };
    });
    await page.goto(drill);
    await expect(page.locator('[data-moat-report]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Print night report', exact: true }).click();
    const sheet = page.locator('[data-moat-report]');
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Gatehouse night report' })).toBeVisible();
    await expect(sheet.getByRole('row')).toHaveCount(4);
    await expect(page.locator('.moderator-drill')).toBeHidden();
  } finally { verify(); }
});

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('Play runs the replay and the count climbs to the end; the scrubber and End key step it', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto(drill);
      const moat = page.getByRole('group', { name: 'Moat timeline, simulated replay', exact: true });
      const stamps = moat.getByRole('button', { name: /^Held, not on air:/ });
      await expect(stamps).toHaveCount(3);
      await page.getByRole('button', { name: '60×', exact: true }).click();
      await expect(page.getByRole('button', { name: '60×', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      // The replay restarts from the beginning, so the stamps leave and drop again.
      await expect(page.getByRole('status').filter({ hasText: 'Held 0 of 40' })).toHaveCount(1);
      await expect(page.getByRole('status').filter({ hasText: held })).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(stamps).toHaveCount(3);
      const slider = page.getByRole('slider', { name: 'Replay position', exact: true });
      await slider.fill('0');
      await expect(stamps).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: 'Held 0 of 40' })).toHaveCount(1);
      // A replay that has ended must stay put: no frame loop outlives it and walks the playhead on by itself.
      await page.waitForTimeout(700);
      await expect(slider).toHaveAttribute('aria-valuetext', /· 1 of 40$/);
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await slider.press('End');
      await expect(stamps).toHaveCount(3);
      // End is the true end: the last crossing has landed too, so every aired dot is on the stream bank.
      await expect(moat.locator('.moat-marker[data-phase="aired"]')).toHaveCount(35);
      await expect(slider).toHaveAttribute('aria-valuetext', /40 of 40$/);
    } finally { verify(); }
  });

  test('on a busy night the spoken count settles while the eye still sees every stop', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto(drill);
      await page.getByRole('button', { name: 'Replay a busy night · 2,000 simulated messages', exact: true }).click();
      await page.getByRole('button', { name: '60×', exact: true }).click();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const spoken = page.getByRole('status').filter({ hasText: 'Held' });
      const chip = page.locator('.moat-live');
      const heard = new Set<string>(); const seen = new Set<string>(); const began = Date.now();
      for (let sample = 0; sample < 40; sample += 1) {
        heard.add((await spoken.textContent()) ?? ''); seen.add((await chip.textContent()) ?? '');
        await page.waitForTimeout(100);
      }
      // A 60x replay of 150 stops: the chip follows the replay, and the live region moves at most once per two seconds
      // (measured against the clock, so a slow machine cannot make the budget too tight).
      expect(seen.size).toBeGreaterThan(heard.size);
      expect(heard.size).toBeLessThanOrEqual(Math.ceil((Date.now() - began) / 2000) + 2);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect.poll(async () => (await spoken.textContent()) === (await chip.textContent())).toBe(true);
    } finally { verify(); }
  });

  test('the Keep sample loop plays by itself and its button stops it', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto('/#/keep');
      const bar = page.locator('.keep-moat');
      const pause = bar.getByRole('button', { name: 'Pause the sample loop', exact: true });
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
      const at = () => bar.locator('.moat-playhead').first().getAttribute('x1');
      const before = await at();
      await expect.poll(at).not.toBe(before);
      await pause.click();
      const play = bar.getByRole('button', { name: 'Play the sample loop', exact: true });
      await expect(play).toHaveAttribute('aria-pressed', 'true');
      const frozen = await at();
      await page.waitForTimeout(500);
      expect(await at()).toBe(frozen);
      await play.click();
      await expect.poll(at).not.toBe(frozen);
    } finally { verify(); }
  });

  test('Space on the focused Play button plays and never seals', async ({ page }) => {
    const verify = await guardPage(page);
    try {
      await page.goto(drill);
      await page.getByRole('button', { name: 'Play', exact: true }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    } finally { verify(); }
  });
});


test.describe('Keep desktop bounds', () => {
  test.use({ reducedMotion: 'no-preference' });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    test(`Keep moat card, plaques and window fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const verify = await guardPage(page);
      try {
        await page.setViewportSize(viewport);
        await page.goto('/#/keep');
        await expect(page.getByRole('button', { name: 'Pause the sample loop', exact: true })).toBeVisible();
        for (const theme of ['day', 'night']) {
          if (theme === 'night') await page.getByRole('button', { name: 'Toggle day and night' }).click();
          await expect.poll(() => page.locator('.keep-home').evaluate(element => {
            const requireNode = (selector: string) => {
              const node = element.querySelector(selector);
              if (!node) throw new Error(`Missing Keep element: ${selector}`);
              return node;
            };
            const issues: string[] = [];
            const inside = (inner: DOMRect, outer: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.width > 0;
            // The moat card holds its label, replay strip, Pause and the full-replay link inside its own box.
            const card = requireNode('.keep-moat').getBoundingClientRect();
            for (const selector of ['.keep-moatlab', '.moat-heartbeat small', '.moat-heartbeat-strip', '.moat-heartbeat button', '.keep-moat-link']) {
              if (!inside(requireNode(selector).getBoundingClientRect(), card)) issues.push(`moat item outside its card: ${selector}`);
            }
            // The intro column stacks eyebrow, title, moat and actions without overlap.
            const column = requireNode('.ki').getBoundingClientRect();
            const blocks = ['[data-role="keep-eyebrow"]', '[data-role="keep-name"]', '.keep-moat', '.ki__actions'].map(selector => requireNode(selector).getBoundingClientRect());
            for (const [index, block] of blocks.entries()) {
              if (!inside(block, column)) issues.push(`intro block ${index} leaves its column`);
              const next = blocks[index + 1];
              if (next && block.bottom > next.top + 1) issues.push(`intro block ${index} overlaps the next`);
            }
            // Plaques sit side by side under the window, none wrapped or cut off.
            const plaques = [...element.querySelectorAll('[data-role="plaque"]')].map(node => node.getBoundingClientRect());
            const stage = requireNode('.kh__stage').getBoundingClientRect();
            for (const [index, plaque] of plaques.entries()) {
              if (!inside(plaque, stage)) issues.push(`plaque ${index} outside the stage`);
              const next = plaques[index + 1];
              if (next && plaque.right > next.left + 1) issues.push(`plaque ${index} overlaps its neighbour`);
            }
            const title = requireNode('[data-role="plaque"][data-room="lottery"] [data-role="plaque-name"]');
            const range = document.createRange(); range.selectNodeContents(title);
            if (new Set([...range.getClientRects()].map(at => Math.round(at.top))).size > 1) issues.push('Lot Chamber title wrapped');
            if (title.scrollWidth > title.clientWidth + 1) issues.push('Lot Chamber title overflows');
            // The Keep never scrolls the page, and the program column keeps its own scroll.
            const home = requireNode('.shell-program-column').getBoundingClientRect();
            if (home.bottom > innerHeight + 1) issues.push('program column runs off the window');
            return issues;
          })).toEqual([]);
        }
      } finally { await page.goto('about:blank'); verify(); }
    });
  }
});
