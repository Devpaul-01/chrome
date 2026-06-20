import { expect, test } from '@playwright/test';

test('popup shell loads', async ({ page }) => {
  await page.goto('/popup.html');

  await expect(page).toHaveTitle('BirthdayMessaging');
  await expect(page.locator('#root')).toBeVisible();
});