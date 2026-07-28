import { test, expect, Page } from '@playwright/test';
import { dismissAlphaModal } from './fixtures';

async function createEntry(page: Page, title: string, content: string) {
  const titleInput = page.locator('input[placeholder="Title..."]');
  if (!(await titleInput.isVisible({ timeout: 1000 }).catch(() => false))) {
    await page.getByRole('button', { name: /New entry/i }).click();
  }
  await expect(titleInput).toBeVisible({ timeout: 5000 });

  await page.fill('input[placeholder="Title..."]', title);
  await page.locator('.ProseMirror').fill(content);
  await page.getByLabel('Back to journal').click();
  await expect(page.locator('h2').filter({ hasText: title }).first()).toBeVisible({ timeout: 5000 });
}

test.describe('Local-first editor regressions', () => {
  test.beforeEach(async ({ page, request }) => {
    const email = `e2e-lf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    await request.post('/api/v0/auth/register', {
      data: { email, password: 'TestPassword123!', confirm_password: 'TestPassword123!' },
    });
    const res = await request.post('/api/v0/auth/login', {
      data: { email, password: 'TestPassword123!' },
    });
    const data = await res.json();
    const accessToken = data.access_token;

    await page.context().addCookies([
      { name: 'access_token', value: accessToken, path: '/', domain: 'localhost' },
      { name: 'session_exists', value: 'true', path: '/', domain: 'localhost' },
    ]);
    await page.goto('/');
    await dismissAlphaModal(page);
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible({ timeout: 10000 });
  });

  test('does not create duplicate entries from rapid save', async ({ page }) => {
    // Regression: the old autosave architecture could create duplicate
    // journal entries (one without title, one with) due to race conditions
    // between debounced saves. The local-first architecture must prevent this.
    await createEntry(page, 'First Entry Regr', 'Content of the first entry.');
    await createEntry(page, 'Second Entry Regr', 'Content of the second entry.');

    const firstEntry = page.locator('h2').filter({ hasText: 'First Entry Regr' }).first();
    const secondEntry = page.locator('h2').filter({ hasText: 'Second Entry Regr' }).first();

    await expect(firstEntry).toBeVisible();
    await expect(secondEntry).toBeVisible();
  });

  test('coalesces simultaneous online and focus draft sync triggers', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    const draftId = `draft-playwright-${Date.now()}`;
    const createdAt = new Date().toISOString();
    let postCount = 0;

    await page.route('**/api/v0/journals', async (route, request) => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }

      postCount += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `migrated-${draftId}`,
          title: 'Queued draft',
          content: 'Created once',
          tags: [],
          created_at: createdAt,
          updated_at: createdAt,
        }),
      });
    });

    await page.evaluate(({ draftId, createdAt }) => {
      localStorage.setItem('my-inner-pages-unsynced-journals', JSON.stringify({
        [draftId]: {
          id: draftId,
          title: 'Queued draft',
          content: 'Created once',
          tags: [],
          date: createdAt,
          created_at: createdAt,
        },
      }));
    }, { draftId, createdAt });

    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('focus'));
    });

    await expect.poll(() => postCount, { timeout: 5000 }).toBe(1);

    await expect.poll(async () => page.evaluate(() =>
      localStorage.getItem('my-inner-pages-unsynced-journals')
    ), { timeout: 5000 }).toBe('{}');
  });

  test('persists an unsynced edit on pagehide', async ({ page }) => {
    const title = 'Pagehide Persistence Entry';
    const modifiedContent = 'This edit is saved before the page is hidden.';

    await createEntry(page, title, 'Original content.');
    await page.locator('h2').filter({ hasText: title }).first().click();
    await page.waitForTimeout(300);
    await page.locator('.ProseMirror').fill(modifiedContent);

    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('my-inner-pages-unsynced-journals');
      if (!raw) return null;
      const entries = Object.values(JSON.parse(raw)) as Array<{ content?: string }>;
      return entries.find(entry => entry.content === 'This edit is saved before the page is hidden.')?.content ?? null;
    }), { timeout: 5000 }).toBe(modifiedContent);
  });

  test('persists content in IndexedDB across full page navigation', async ({ page }) => {
    // Regression: keystrokes must survive page unload/reload even when
    // no API save has occurred. Y.Doc + y-indexeddb should persist the
    // content locally, and the editor should restore it from IndexedDB
    // on remount — not from the stale backend response.
    const title = 'IDB Persist Content';
    await createEntry(page, title, 'Original content for IDB test.');

    // Re-open the entry and modify content without saving to backend
    await page.locator('h2').filter({ hasText: title }).first().click();
    await page.waitForTimeout(300);

    const modifiedTitle = 'IDB Persist Modified Title';
    const modifiedContent = 'This content was typed locally and must survive page reload.';
    await page.fill('input[placeholder="Title..."]', modifiedTitle);
    await page.locator('.ProseMirror').fill(modifiedContent);

    // Allow y-indexeddb to flush pending writes to IndexedDB
    await page.waitForTimeout(400);

    // Navigate away (full page unload — React tree destroyed, Y.Doc destroyed)
    await page.goto('/?view=settings');
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 10000 });

    // Navigate back (full page load — new React tree, new Y.Doc)
    await page.goto('/');
    await dismissAlphaModal(page);
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible({ timeout: 10000 });

    // Open the entry again (card shows modified title from local-first state)
    await page.locator('h2').filter({ hasText: modifiedTitle }).first().click();
    await page.waitForTimeout(400);

    // Editor should restore the modified content from IndexedDB
    await expect(page.locator('.ProseMirror')).toContainText(modifiedContent);

    // Title input should show the modified title from Y.Doc's Y.Text
    const titleInput = page.locator('input[placeholder="Title..."]');
    await expect(titleInput).toHaveValue(modifiedTitle);
  });

  test('persists title edit in Y.Doc across page reload', async ({ page }) => {
    // Regression: title changes are stored in Y.Text and must survive
    // full page navigation independently of backend state.
    const title = 'IDB Persist Title';
    await createEntry(page, title, 'Testing title persistence.');

    // Re-open and change the title
    await page.locator('h2').filter({ hasText: title }).first().click();
    await page.waitForTimeout(300);

    const newTitle = 'IDB PERSIST TITLE CHANGED';
    await page.fill('input[placeholder="Title..."]', newTitle);
    await page.waitForTimeout(400);

    // Navigate away and back
    await page.goto('/?view=settings');
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 10000 });
    await page.goto('/');
    await dismissAlphaModal(page);
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible({ timeout: 10000 });

    // Open the entry
    await page.locator('h2').filter({ hasText: newTitle }).first().click();
    await page.waitForTimeout(400);

    // Title must show the updated value from Y.Doc, not the backend value
    const titleInput = page.locator('input[placeholder="Title..."]');
    await expect(titleInput).toHaveValue(newTitle);
  });
});
