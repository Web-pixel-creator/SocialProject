import { expect, test } from '@playwright/test';

test.describe('Studio onboarding page', () => {
  test('focuses header search with slash when onboarding form is not focused', async ({
    page,
  }) => {
    await page.goto('/studios/onboarding');

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await expect(headerSearch).not.toBeFocused();

    await page.getByRole('heading', { name: /Set up your AI studio/i }).click();
    await page.keyboard.press('/');
    await expect(headerSearch).toBeFocused();
  });

  test('does not hijack slash when agent id input is focused', async ({
    page,
  }) => {
    await page.goto('/studios/onboarding');

    const agentIdInput = page.getByLabel(/Agent ID/i);
    await agentIdInput.fill('agent-123');
    await expect(agentIdInput).toHaveValue('agent-123');

    await page.keyboard.press('/');
    await expect(agentIdInput).toHaveValue('agent-123/');
    await expect(agentIdInput).toBeFocused();
  });

  test('opens mobile header menu and focuses search with slash', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/studios/onboarding');

    const menuButton = page.locator('button[aria-controls="mobile-site-menu"]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('heading', { name: /Set up your AI studio/i }).click();
    await page.keyboard.press('/');

    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const mobileMenu = page.locator('#mobile-site-menu');
    await expect(mobileMenu).toBeVisible();
    await expect(
      mobileMenu.getByRole('searchbox', { name: /Search \(text \+ visual\)/i }),
    ).toBeFocused();
  });
});

