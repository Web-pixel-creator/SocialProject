import { type Locator, type Page, expect, test } from '@playwright/test';
import { navigateWithRetry } from './utils/navigation';

const json = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface StudioOnboardingApiMockOptions {
  profileBody?: unknown;
  profileStatus?: number;
  saveBody?: unknown;
  saveStatus?: number;
}

const installStudioOnboardingApiMocks = async (
  page: Page,
  options: StudioOnboardingApiMockOptions = {},
) => {
  const {
    profileBody = {
      avatar_url: 'https://example.com/avatar.png',
      personality: 'Clean and systematic',
      studio_name: 'Studio Prime',
      style_tags: ['Editorial'],
    },
    profileStatus = 200,
    saveBody = { ok: true },
    saveStatus = 200,
  } = options;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const path = requestUrl.pathname;

    if (method === 'GET' && path.startsWith('/api/studios/')) {
      return route.fulfill(json(profileBody, profileStatus));
    }

    if (method === 'PUT' && path.startsWith('/api/studios/')) {
      return route.fulfill(json(saveBody, saveStatus));
    }

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({}));
  });
};

const seedAgentCredentials = async (
  page: Page,
  credentials: { agentId: string; apiKey: string },
) => {
  await page.addInitScript(
    ({ agentId, apiKey }) => {
      localStorage.setItem('finishit_agent_id', agentId);
      localStorage.setItem('finishit_agent_key', apiKey);
    },
    credentials,
  );
};

const focusHeaderSearchWithSlash = async (
  page: Page,
  headerSearch: Locator,
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('/');
    const isFocused = await headerSearch.evaluate((element) => {
      return element === document.activeElement;
    });
    if (isFocused) {
      return;
    }
    await page.waitForTimeout(120);
  }
};

test.describe('Studio onboarding page', () => {
  test('connects agent, saves profile and reaches checklist step', async ({
    page,
  }) => {
    await installStudioOnboardingApiMocks(page);
    await seedAgentCredentials(page, {
      agentId: 'agent-007',
      apiKey: 'key-007',
    });
    await navigateWithRetry(page, '/studios/onboarding', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    const agentIdInput = page.getByLabel(/Agent ID/i);
    const apiKeyInput = page.getByLabel(/Agent API key/i);
    await expect(agentIdInput).toHaveValue('agent-007');
    await expect(apiKeyInput).toHaveValue('key-007');
    await page.getByRole('button', { name: /^Connect$/i }).click();

    await expect(
      page.getByRole('heading', { name: /Studio profile/i }),
    ).toBeVisible();

    await page.getByLabel(/Studio name/i).fill('  Studio Prime Updated  ');
    await page
      .getByLabel(/Avatar URL/i)
      .fill('  https://example.com/new-avatar.png  ');
    const styleTagsInput = page.getByLabel(/Style tags/i);
    await styleTagsInput.fill('Futuristic');
    await styleTagsInput.press('Enter');
    await page.getByRole('button', { name: /Editorial/i }).click();
    await page.getByLabel(/Personality/i).fill('  Precision-first  ');

    const saveRequestPromise = page.waitForRequest((request) => {
      return (
        request.method() === 'PUT' &&
        request.url().endsWith('/api/studios/agent-007')
      );
    });

    await page.getByRole('button', { name: /Save profile/i }).click();
    const saveRequest = await saveRequestPromise;

    expect(saveRequest.headers()['x-agent-id']).toBe('agent-007');
    expect(saveRequest.headers()['x-api-key']).toBe('key-007');
    expect(saveRequest.postDataJSON()).toEqual({
      avatarUrl: 'https://example.com/new-avatar.png',
      personality: 'Precision-first',
      studioName: 'Studio Prime Updated',
      styleTags: ['Futuristic'],
    });

    await expect(page.getByText(/Profile saved/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /First actions checklist/i }),
    ).toBeVisible();
  });

  test('shows save error and supports skipping optional steps', async ({
    page,
  }) => {
    await installStudioOnboardingApiMocks(page, {
      saveBody: { message: 'Save failed on API' },
      saveStatus: 500,
    });
    await seedAgentCredentials(page, {
      agentId: 'agent-save-error',
      apiKey: 'key-save-error',
    });
    await navigateWithRetry(page, '/studios/onboarding', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    const agentIdInput = page.getByLabel(/Agent ID/i);
    const apiKeyInput = page.getByLabel(/Agent API key/i);
    await expect(agentIdInput).toHaveValue('agent-save-error');
    await expect(apiKeyInput).toHaveValue('key-save-error');
    await page.getByRole('button', { name: /^Connect$/i }).click();

    await expect(
      page.getByRole('heading', { name: /Studio profile/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Save profile/i }).click();
    await expect(page.getByText(/Save failed on API/i)).toBeVisible();

    await page.getByRole('button', { name: /Skip optional steps/i }).click();
    await expect(
      page.getByRole('heading', { name: /First actions checklist/i }),
    ).toBeVisible();
  });

  test('focuses header search with slash when onboarding form is not focused', async ({
    page,
  }) => {
    await navigateWithRetry(page, '/studios/onboarding', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

    const headerSearch = page
      .locator('header')
      .first()
      .getByRole('searchbox', { name: /Search \(text \+ visual\)/i });

    await expect(headerSearch).toBeVisible();
    await expect(headerSearch).not.toBeFocused();

    await page.getByRole('heading', { name: /Set up your AI studio/i }).click();
    await focusHeaderSearchWithSlash(page, headerSearch);
    await expect(headerSearch).toBeFocused();
  });

  test('does not hijack slash when agent id input is focused', async ({
    page,
  }) => {
    await navigateWithRetry(page, '/studios/onboarding', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

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
    await navigateWithRetry(page, '/studios/onboarding', {
      gotoOptions: { waitUntil: 'domcontentloaded' },
    });

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

