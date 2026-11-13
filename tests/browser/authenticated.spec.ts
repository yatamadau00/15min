import {test, expect, origin} from './auth-fixture';
test.use({baseURL: origin});

test('browser logout sends same-origin POST, removes cookie and revokes session', async ({page, context, session}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: '▶ 15分はじめる'})).toBeEnabled();
  const before = (await context.cookies()).find(c => c.name === '15min-session')!;
  await page.getByRole('button', {name: '設定を開く'}).click();
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/auth/logout'));
  await page.getByRole('button', {name: 'ログアウト', exact: true}).click();
  const response = await responsePromise;
  expect(response.status()).toBe(303);
  expect((await response.request().allHeaders()).origin).toBe(origin);
  await expect(page.getByRole('link', {name: 'Googleでログイン'})).toBeVisible();
  expect((await context.cookies()).some(c => c.name === '15min-session')).toBe(false);
  expect(session.db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(session.userId)?.n).toBe(0);
  // Even a copied, previously valid cookie can no longer access records.
  expect((await context.request.get('/api/items', {headers: {cookie: '15min-session=' + before.value}})).status()).toBe(401);
});

test('logout still rejects missing, null and foreign origins', async ({context, session}) => {
  for (const headers of [{}, {origin: 'null'}, {origin: 'https://evil.test'}] as Record<string, string>[]) {
    expect((await context.request.post('/auth/logout', {headers, maxRedirects: 0})).status()).toBe(403);
  }
  expect(session.db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(session.userId)?.n).toBe(1);
});
