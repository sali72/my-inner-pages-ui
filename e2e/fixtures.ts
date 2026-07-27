import { Page } from '@playwright/test';

const API_BASE = '/api/v0/auth';
const TEST_PASSWORD = 'TestPassword123!';

export interface TestUser {
  email: string;
  password: string;
  access_token?: string;
}

export async function createUser(page: Page): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

  const res = await page.request.post(`${API_BASE}/register`, {
    data: { email, password: TEST_PASSWORD, confirm_password: TEST_PASSWORD },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to create user ${email}: ${res.status()} ${body}`);
  }

  return { email, password: TEST_PASSWORD };
}

export async function loginAsUser(page: Page, user: TestUser): Promise<void> {
  const res = await page.request.post(`${API_BASE}/login`, {
    data: { email: user.email, password: user.password },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Login failed for ${user.email}: ${res.status()} ${body}`);
  }

  const data = await res.json();
  const token = data.access_token;

  // Extract refresh_token from response headers if present
  const cookies = await page.context().cookies();
  const refreshCookie = cookies.find(c => c.name === 'refresh_token');

  await page.goto('/');
  const cookieList = [
    { name: 'access_token', value: token, path: '/api/v0', domain: 'localhost' },
    { name: 'session_exists', value: '1', path: '/', domain: 'localhost' },
  ];
  if (refreshCookie) {
    cookieList.push({ name: 'refresh_token', value: refreshCookie.value, path: '/api/v0/auth/refresh', domain: 'localhost' });
  }
  await page.context().addCookies(cookieList);
  await page.reload();
}
