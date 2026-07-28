import { test, expect, Page } from '@playwright/test';
import { dismissAlphaModal } from './fixtures';

async function navigateToChat(page: Page) {
  await dismissAlphaModal(page);
  await page.locator('header button').first().click();
  await page.getByRole('button', { name: 'Chat' }).click();
  await expect(page.getByRole('heading', { name: /Chat/i, level: 1 })).toBeVisible();
  await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 10000 });
}

test.describe('Chat core flows', () => {
  let accessToken: string;
  let testUserEmail: string;

  test.beforeEach(async ({ page, request }) => {
    testUserEmail = `e2e-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
    await request.post('/api/v0/auth/register', {
      data: { email: testUserEmail, password: 'TestPassword123!', confirm_password: 'TestPassword123!' },
    });
    const res = await request.post('/api/v0/auth/login', {
      data: { email: testUserEmail, password: 'TestPassword123!' },
    });
    const data = await res.json();
    accessToken = data.access_token;

    await page.goto('/');
    await page.context().addCookies([
      { name: 'access_token', value: accessToken, path: '/', domain: 'localhost' },
      { name: 'session_exists', value: 'true', path: '/', domain: 'localhost' },
    ]);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Your Journal/i })).toBeVisible({ timeout: 10000 });
  });

  test('navigates to chat view', async ({ page }) => {
    await navigateToChat(page);
  });

  test('sends a message and shows it in the chat', async ({ page }) => {
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', 'Hello from Playwright test!');
    await page.click('button:has(svg.lucide-send)');

    await expect(page.getByText('Hello from Playwright test!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder('Type a message...')).toHaveValue('');
  });

  test('opens and closes chat history sidebar', async ({ page }) => {
    await navigateToChat(page);

    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('aside:has(h2)')).toContainText('Chat History');

    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('div.fixed.inset-0[class*="bg-black"]')).toHaveCount(0);
  });

  test('starts a new chat with New button in sidebar', async ({ page }) => {
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', 'This chat will be reset');
    await page.click('button:has(svg.lucide-send)');
    await expect(page.getByText('This chat will be reset').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button[title="Chat History"]').click();
    await page.locator('aside:has(h2) button:has(svg.lucide-plus)').click();

    await expect(page.getByText('Ask me anything')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('main div.chat-typography').getByText('This chat will be reset')).not.toBeVisible();
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    await navigateToChat(page);

    await expect(page.locator('button:has(svg.lucide-send)')).toBeDisabled();
  });

  test('send button stays disabled with whitespace-only input', async ({ page }) => {
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', '   ');
    await expect(page.locator('button:has(svg.lucide-send)')).toBeDisabled();
  });

  test('sends a very long message', async ({ page }) => {
    await navigateToChat(page);

    const longMessage = 'A'.repeat(500);
    await page.fill('textarea[placeholder="Type a message..."]', longMessage);
    await page.click('button:has(svg.lucide-send)');

    await expect(page.getByText(longMessage).first()).toBeVisible({ timeout: 5000 });
  });

  test('deletes a chat from sidebar', async ({ page }) => {
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', 'Delete me');
    await page.click('button:has(svg.lucide-send)');
    await expect(page.getByText('Delete me').first()).toBeVisible({ timeout: 10000 });

    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('aside:has(h2)')).toContainText('Chat History');

    await page.locator('button[aria-label*="Delete chat"]').first().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('No chats yet')).toBeVisible({ timeout: 5000 });
  });

  test('multiple chats appear in sidebar', async ({ page }) => {
    test.slow();
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', 'First chat message');
    await page.click('button:has(svg.lucide-send)');
    await expect(page.getByText('First chat message').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button[title="Chat History"]').click();
    await page.locator('aside:has(h2) button:has(svg.lucide-plus)').click();
    await expect(page.getByText('Ask me anything')).toBeVisible({ timeout: 5000 });

    await page.locator('button[title="Chat History"]').click();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5000 });

    await page.fill('textarea[placeholder="Type a message..."]', 'Second chat message');
    await page.click('button:has(svg.lucide-send)');
    await expect(page.getByText('Second chat message').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('aside:has(h2)')).toContainText('2 chats');
  });

  test('messages persist after closing and reopening sidebar', async ({ page }) => {
    await navigateToChat(page);

    await page.fill('textarea[placeholder="Type a message..."]', 'Persist this message');
    await page.click('button:has(svg.lucide-send)');
    await expect(page.getByText('Persist this message').first()).toBeVisible({ timeout: 5000 });

    // Toggle sidebar open
    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('aside:has(h2)')).toContainText('Chat History');

    // Close sidebar
    await page.locator('button[title="Chat History"]').click();
    await expect(page.locator('div.fixed.inset-0[class*="bg-black"]')).toHaveCount(0);

    // Message still visible
    await expect(page.getByText('Persist this message').first()).toBeVisible();
  });
});
