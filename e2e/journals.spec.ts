import { test, expect, Page } from '@playwright/test';
import { dismissAlphaModal } from './fixtures';

async function createEntry(page: Page, title: string, content: string) {
  const titleInput = page.locator('input[placeholder="Title..."]');
  if (!(await titleInput.isVisible({ timeout: 1000 }).catch(() => false))) {
    await page.getByRole('button', { name: 'New Entry' }).click();
  }
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  await page.fill('input[placeholder="Title..."]', title);
  await page.locator('.ProseMirror').fill(content);
  await page.getByLabel('Back to journal').click();
  await expect(page.locator('h2').filter({ hasText: title }).first()).toBeVisible({ timeout: 5000 });
}

test.describe('Journal CRUD', () => {
  let accessToken: string;

  test.beforeEach(async ({ page, request }) => {
    const email = `e2e-journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    await request.post('/api/v0/auth/register', {
      data: { email, password: 'TestPassword123!', confirm_password: 'TestPassword123!' },
    });
    const res = await request.post('/api/v0/auth/login', {
      data: { email, password: 'TestPassword123!' },
    });
    const data = await res.json();
    accessToken = data.access_token;

    await page.context().addCookies([
      { name: 'access_token', value: accessToken, path: '/', domain: 'localhost' },
      { name: 'session_exists', value: 'true', path: '/', domain: 'localhost' },
    ]);
    await page.goto('/');
    await dismissAlphaModal(page);
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible({ timeout: 10000 });
  });

  test('creates a new journal entry', async ({ page }) => {
    await createEntry(page, 'E2E Test Entry', 'Created by e2e test.');
  });

  test('edits an existing journal entry', async ({ page }) => {
    await createEntry(page, 'Entry to Edit', 'Original content.');

    // Click on the entry card to view/edit it
    await page.locator('h2').filter({ hasText: 'Entry to Edit' }).first().click();

    // Modify content in the Tiptap editor
    await page.locator('.ProseMirror').fill('Updated content after editing.');

    // Save and go back
    await page.getByLabel('Back to journal').click();

    await expect(page.locator('span').filter({ hasText: 'Updated content after editing.' })).toBeVisible();
  });

  test('deletes a journal entry', async ({ page }) => {
    await createEntry(page, 'Entry to Delete', 'This will be deleted.');
    await page.waitForTimeout(500);

    // Click on the entry card to view/edit it
    await page.locator('h2').filter({ hasText: 'Entry to Delete' }).first().click();

    // Open options menu and click delete
    await page.getByRole('button', { name: 'Entry options' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    
    // Accept confirm modal
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    // After deletion, we should be back on the timeline view
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible();
    await expect.poll(
      async () => page.locator('h2').filter({ hasText: 'Entry to Delete' }).count(),
      { timeout: 10000 }
    ).toBe(0);
  });
});
