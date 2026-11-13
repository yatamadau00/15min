import handler from 'vinext/server/fetch-handler';
import { authRoute, config, validOrigin } from '../lib/auth/core';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    let response: Response;
    try {
      if (url.pathname.startsWith('/auth/')) response = await authRoute(request, env);
      else if ((url.pathname === '/' || url.pathname.startsWith('/api/')) && !config(env)) {
        response = new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><title>15min — 設定が必要です</title><h1>Google認証の設定が必要です</h1><p>データへのアクセスは無効です。</p><a href="/demo">架空データのデモを見る</a></html>', {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
      } else if (!['GET', 'HEAD'].includes(request.method) && !validOrigin(request, config(env)?.origin || '')) {
        response = new Response('Invalid origin', {status:403});
      } else if (url.pathname.startsWith('/api/') && request.method === 'POST' && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        response = new Response('JSON required', {status:415});
      } else if (url.pathname.startsWith('/api/') && request.method === 'POST') {
        const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        if (reader) { while (true) { const {done, value} = await reader.read(); if(done) break; size += value.byteLength; if(size > 16384) { await reader.cancel(); return new Response('Payload too large', {status:413}); } chunks.push(value); } }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
        response = await handler.fetch(new Request(request, {body: bytes}), env, ctx);
      } else response = await handler.fetch(request, env, ctx);
    } catch {
      // Never expose tokens, request URLs, database errors, or personal data.
      response = new Response('サービスを利用できません。設定と接続を確認してください。', {status:503});
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
  },
};
