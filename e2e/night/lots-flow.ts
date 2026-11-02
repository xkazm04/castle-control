import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NightCore } from './launch.ts';
import { holdToSeal, viteOrigin } from './support.ts';

/**
 * The Lot Chamber journey in CORE mode: create the no-prize question draw,
 * configure two winners and a SIMULATED name, admit six generated !join viewers,
 * check, hold to seal on the public drand quicknet, then cast once the round
 * arrives. Returns the winners (Twitch user-id handles) the UI shows.
 */
export async function castQuestionsDrawInUi(page: Page, core: NightCore): Promise<string[]> {
    await core.openDesktop(page, viteOrigin(), '#/chamber/lottery');
    const room = page.getByRole('region', { name: 'Core Lot Chamber', exact: true });
    const notice = room.locator('p.cc-status[role="status"]').last();
    await room.getByRole('button', { name: 'Create no-prize question draw', exact: true }).click();
    await expect(room.getByRole('combobox', { name: 'Draw', exact: true })).toHaveValue('questions');

    // Configure: two winners, a SIMULATED name, saved through one upsert.
    const winners = room.getByRole('spinbutton', { name: 'Number of winners', exact: true });
    await winners.fill('2');
    await winners.press('Enter');
    // The full rule editor and the entry lookup sit behind the chamber's one More disclosure.
    await room.locator('[data-role="lot-more"] > summary').click();
    const rules = room.getByRole('article', { name: 'Draw rules', exact: true });
    await expect(rules.getByRole('status')).toHaveText('These rules match the core.');
    await rules.getByRole('textbox', { name: 'Draw name', exact: true }).fill('SIMULATED night questions');
    await rules.getByRole('button', { name: 'Save rules to the core', exact: true }).click();
    await expect(rules.getByRole('status')).toHaveText('These rules match the core.');
    await expect(room.getByRole('combobox', { name: 'Draw', exact: true }).locator('option:checked'))
      .toHaveText('SIMULATED night questions');

    // Six generated viewers type !join; the UI's own lookup proves the last one entered.
    core.chat('join', 6);
    const lookup = room.getByRole('textbox', { name: 'Twitch user ID', exact: true });
    await lookup.fill('9006');
    await expect(async () => {
      await room.getByRole('button', { name: 'Look up entry', exact: true }).click();
      await expect(room.locator('.lottery-lookup-result')).toHaveText('Eligible · weight 1', { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    await room.getByRole('button', { name: 'Check giveaway guardrails', exact: true }).click();
    await expect(room.getByRole('button', { name: 'Hold to seal', exact: true })).toBeEnabled();
    await holdToSeal(page, room.getByRole('button', { name: 'Hold to seal', exact: true }),
      room.getByText('Seal announced · entry list frozen before cast. Keep the announcement and OBS capture.', { exact: true }));
    await expect(room.getByText('6 frozen entries · drand_quicknet', { exact: true })).toBeVisible();

    // The cast waits for the announced public round (seal + 6 s margin).
    const cast = room.getByRole('button', { name: 'Cast the lots', exact: true });
    const result = room.getByRole('table', { name: 'Draw winners', exact: true });
    await expect(async () => {
      if (await cast.isEnabled()) await cast.click();
      await expect(room.getByText(/^Winners · /)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    // The cast lands, then the room loads the core's proof bundle.
    await expect(notice).toHaveText('Proof bundle loaded from the core. Use an independent verifier to check it.');
    const handles = (await result.getByRole('cell').allTextContents()).map(text => text.trim());
    expect(handles).toHaveLength(2);
    for (const handle of handles) expect(Number(handle)).toBeGreaterThanOrEqual(9001);
  return handles;
}
