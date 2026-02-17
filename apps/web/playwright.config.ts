import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    timeout: 90_000,
    snapshotPathTemplate:
        '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
    workers: 2,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            testIgnore: ['**/feed-mobile.spec.ts', '**/mobile-navigation.spec.ts'],
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chromium',
            testMatch: ['**/feed-mobile.spec.ts', '**/mobile-navigation.spec.ts'],
            use: { ...devices['Pixel 7'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
