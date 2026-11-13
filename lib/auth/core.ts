import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';

export interface AuthEnv {
  DB?: D1Database;
  APP_ORIGIN?: string;
  APP_ENV?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_ALLOWED_EMAILS?: string;
}
export type User = { userId: string; email: string; displayName: string };
export function config(env: AuthEnv) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_ORIGIN) return null;
  try {
    const url = new URL(env.APP_ORIGIN);
    const local = env.APP_ENV === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || url.origin !== env.APP_ORIGIN || url.username || url.password) return null;
    return { origin: url.origin, secure: !local, session: local ? '15min-session' : '__Host-15min-session', flow: local ? '15min-flow' : '__Host-15min-flow' };
  } catch { return null; }
}
export function cookieValue(header: string | null, name: string) {
  return (header || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function cookie(name: string, value: string, secure: boolean, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
export const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function hash(value: string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function validOrigin(request: Request, origin: string) { return request.headers.get('origin') === origin && new URL(request.url).origin === origin; }
export async function getUser(header: string | null, env: AuthEnv): Promise<User | null> {
  const c = config(env); if (!c) return null;
  const token = cookieValue(header, c.session); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await env.DB!.prepare('SELECT user_id, email, display_name FROM auth_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token), Date.now()).first<{user_id: string; email: string; display_name: string}>();
  if (!row || !allowed(row.email, env)) return null;
  return { userId: row.user_id, email: row.email, displayName: row.display_name };
}
function allowed(email: string, env: AuthEnv) {
  const list = env.AUTH_ALLOWED_EMAILS?.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return !list?.length || list.includes(email.toLowerCase());
}
export function identity(payload: JWTPayload, nonce: string, clientId: string, env: AuthEnv): User {
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || typeof payload.email !== 'string' || !allowed(payload.email, env) || (payload.azp !== undefined && payload.azp !== clientId)) throw Error('Invalid identity');
  return { userId: 'google:' + payload.sub, email: payload.email, displayName: typeof payload.name === 'string' ? payload.name : payload.email };
}
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogle(token: string, nonce: string, env: AuthEnv, keySet: JWTVerifyGetKey = keys) {
  const { payload } = await jwtVerify(token, keySet, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID!, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'nonce'] });
  return identity(payload, nonce, env.GOOGLE_CLIENT_ID!, env);
}
export async function authRoute(request: Request, env: AuthEnv): Promise<Response> {
  const c = config(env); if (!c) return new Response('Google認証が設定されていません。', { status: 503 });
  const url = new URL(request.url), db = env.DB!;
  if (url.origin !== c.origin) return new Response('Invalid host', { status: 403 });
  if (url.pathname === '/auth/login' && request.method === 'GET') {
    const state = random(), browser = random(), nonce = random(), verifier = random();
    await db.batch([
      db.prepare('DELETE FROM oauth_flows WHERE expires_at<=?').bind(Date.now()),
      db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(Date.now()),
      db.prepare('INSERT INTO oauth_flows(state_hash,browser_hash,nonce,verifier,expires_at) VALUES(?,?,?,?,?)').bind(await hash(state), await hash(browser), nonce, verifier, Date.now() + 600000),
    ]);
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: c.origin + '/auth/callback', response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: await hash(verifier), code_challenge_method: 'S256', prompt: 'select_account'}).toString();
    return new Response(null, {status: 302, headers: {Location: target.href, 'Set-Cookie': cookie(c.flow, browser, c.secure, 600)}});
  }
  if (url.pathname === '/auth/callback' && request.method === 'GET') {
    const fail = () => new Response('認証を完了できませんでした。ログイン画面からやり直してください。', {status: 400, headers: {'Set-Cookie': cookie(c.flow, '', c.secure, 0)}});
    const state = url.searchParams.get('state') || '', browser = cookieValue(request.headers.get('cookie'), c.flow), code = url.searchParams.get('code');
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser) || !code || code.length > 4096) return fail();
    // DELETE RETURNING consumes the state atomically, including failed exchanges.
    const flow = await db.prepare('DELETE FROM oauth_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,verifier').bind(await hash(state), await hash(browser), Date.now()).first<{nonce: string; verifier: string}>();
    if (!flow) return fail();
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'authorization_code', code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: c.origin + '/auth/callback', code_verifier: flow.verifier}), signal: AbortSignal.timeout(10000)});
      if (!response.ok) return fail();
      const result = await response.json() as {id_token?: string}; if (!result.id_token) return fail();
      const user = await verifyGoogle(result.id_token, flow.nonce, env), token = random();
      const previous = cookieValue(request.headers.get('cookie'), c.session);
      await db.batch([
        db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(previous)),
        db.prepare('INSERT INTO auth_sessions(token_hash,user_id,email,display_name,expires_at) VALUES(?,?,?,?,?)').bind(await hash(token), user.userId, user.email, user.displayName, Date.now() + 604800000),
      ]);
      const headers = new Headers({Location:'/', 'Cache-Control':'no-store'});
      headers.append('Set-Cookie', cookie(c.session, token, c.secure, 604800));
      headers.append('Set-Cookie', cookie(c.flow, '', c.secure, 0));
      return new Response(null, {status: 303, headers});
    } catch { return fail(); }
  }
  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    if (!validOrigin(request, c.origin)) return new Response('Invalid origin', {status:403});
    await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(cookieValue(request.headers.get('cookie'), c.session))).run();
    return new Response(null, {status:303, headers:{Location:'/', 'Set-Cookie':cookie(c.session, '', c.secure, 0)}});
  }
  return new Response('Not found', {status:404});
}
