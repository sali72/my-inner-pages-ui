import { test, expect } from '@playwright/test';
import { createUser, loginAsUser } from './fixtures';

test.describe('Auth flow', () => {
  test('registers a new user and shows success screen', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Meet Yourself on the Page')).toBeVisible({ timeout: 10000 });

    await page.getByText('Start Writing').first().click();
    await expect(page.getByText('Welcome Back')).toBeVisible();

    await page.getByText('Create one').click();
    await expect(
      page.getByRole('heading', { name: 'Create Account' })
    ).toBeVisible();

    const email = `e2e-${Date.now()}@test.com`;
    await page.fill('#email', email);
    await page.fill('#password', 'TestPassword123!');
    await page.fill('#confirmPassword', 'TestPassword123!');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Check Your Email')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test('logs in with registered credentials and can navigate', async ({
    page,
  }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    await page.locator('header button').first().click();
    await page
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    const user = await createUser(page);

    await page.goto('/');
    await page.getByText('Start Writing').first().click();
    await expect(page.getByText('Welcome Back')).toBeVisible();

    await page.fill('#email', user.email);
    await page.fill('#password', 'wrong-password-999');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('session persists on page reload', async ({ page }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    await page.reload();

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('logs out and returns to landing page', async ({ page }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    await page.locator('header button').first().click();
    await page
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();

    await page.getByText('Logout').first().click();

    await expect(
      page.getByRole('dialog', { name: 'Logout' })
    ).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Logout' })
      .getByRole('button', { name: 'Logout', exact: true })
      .click();

    await expect(
      page.getByText('Meet Yourself on the Page')
    ).toBeVisible();
  });

  test('shows Google Sign-In button', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start Writing').first().click();

    const googleButton = page.getByRole('button', { name: /sign in with google/i });
    await expect(googleButton).toBeVisible();
  });

  test('shows Forgot Password link', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start Writing').first().click();

    await expect(
      page.getByText('Forgot password?')
    ).toBeVisible();
  });

  test('shows empty field validation error on login', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start Writing').first().click();
    await expect(page.getByText('Welcome Back')).toBeVisible();

    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByText('Please fill in all fields')).toBeVisible();
  });



  test('performs silent refresh when access token is removed or expired', async ({ page }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    // Simulate access token expiration by clearing only the access_token cookie
    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find(c => c.name === 'refresh_token');

    await page.context().clearCookies();

    if (refreshCookie) {
      await page.context().addCookies([
        { name: 'refresh_token', value: refreshCookie.value, path: '/api/v0/auth/refresh', domain: 'localhost' },
        { name: 'session_exists', value: '1', path: '/', domain: 'localhost' },
      ]);
    }

    // Trigger an authenticated API request by navigating to Settings
    await page.locator('header button').first().click();
    await page
      .getByRole('button', { name: 'Settings', exact: true })
      .click();

    // Silent refresh should have fetched a new access token seamlessly
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible({ timeout: 10000 });
  });

  test('redirects to landing page when refresh token is invalid or deleted', async ({ page }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    // Clear all cookies (both access_token and refresh_token)
    await page.context().clearCookies();

    // Trigger page reload
    await page.reload();

    // Should redirect back to landing page
    await expect(
      page.getByText('Meet Yourself on the Page')
    ).toBeVisible({ timeout: 10000 });
  });

  test('displays active devices and sessions section in settings', async ({ page }) => {
    const user = await createUser(page);
    await loginAsUser(page, user);

    await expect(
      page.getByRole('heading', { name: /Your Journal/i })
    ).toBeVisible({ timeout: 10000 });

    await page.locator('header button').first().click();
    await page
      .getByRole('button', { name: 'Settings', exact: true })
      .click();

    await expect(page.getByText('Active Devices & Sessions')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('This Device')).toBeVisible({ timeout: 10000 });
  });
});
