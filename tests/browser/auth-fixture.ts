import {test as base, expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import {globSync} from 'node:fs';
import {randomBytes, createHash} from 'node:crypto';

export const origin = 'http://127.0.0.1:8788';
type Session = {userId: string; db: DatabaseSync};
// These fixtures only access a local D1 database. No real Google credentials or users.
export const test = base.extend<{session: Session}>({
  session: async ({context}, runTest) => {
    const paths = globSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite').filter(p => !p.endsWith('metadata.sqlite'));
    expect(paths).toHaveLength(1);
    const db = new DatabaseSync(paths[0]);
    const token = randomBytes(32).toString('base64url');
    const userId = 'google:browser-fixture-' + randomBytes(8).toString('hex');
    db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(createHash('sha256').update(token).digest('base64url'), userId, 'fixture@example.test', 'Fictional browser user', Date.now() + 600000);
    await context.addCookies([{name: '15min-session', value: token, url: origin, httpOnly: true, sameSite: 'Lax'}]);
    try { await runTest({userId, db}); }
    finally {
      db.prepare('DELETE FROM planner_items WHERE owner=?').run(userId);
      db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
      db.close();
    }
  },
});
export {expect};
