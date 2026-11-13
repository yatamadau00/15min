import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {config,cookie,getUser,random,hash,authRoute,identity,validOrigin,verifyGoogle} from '../lib/auth/core.ts';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE planner_items (id TEXT PRIMARY KEY, owner TEXT, data TEXT)');sqlite.exec(readFileSync(new URL('../drizzle/0001_auth.sql',import.meta.url),'utf8'));
 const prepare=(sql:string)=>{let args:any[]=[];const s={bind(...v:any[]){args=v;return s},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){return sqlite.prepare(sql).run(...args)}};return s};
 const env:any={DB:{prepare,async batch(items:any[]){return Promise.all(items.map(s=>s.run()))}},APP_ORIGIN:'https://example.test',GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret'};
 return {sqlite,env};
}
test('configuration fails closed and HTTP is restricted to explicit local development',()=>{
 const {env}=fixture();assert.equal(config({}),null);assert.equal(config({...env,GOOGLE_CLIENT_SECRET:''}),null);assert.equal(config({...env,APP_ORIGIN:'http://example.test'}),null);assert.equal(config({...env,APP_ORIGIN:'https://example.test/path'}),null);assert.equal(config({...env,APP_ORIGIN:'http://localhost:5173'}),null);assert.ok(config({...env,APP_ENV:'development',APP_ORIGIN:'http://localhost:5173'}));assert.match(cookie('__Host-15min-session','token',true,60),/HttpOnly; SameSite=Lax; Max-Age=60; Secure/);
});
test('session lookup rejects spoofed, unknown, expired, or disallowed users; logout revokes',async()=>{
 const {env,sqlite}=fixture();const token=random();const insert=sqlite.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)');insert.run(await hash(token),'google:fixture','demo@example.test','Demo',Date.now()+60000);
 assert.equal(await getUser('oai-authenticated-user-id=fixture',env),null);assert.equal(await getUser('__Host-15min-session='+random(),env),null);
 assert.equal((await getUser('__Host-15min-session='+token,env))?.userId,'google:fixture');
 assert.equal(await getUser('__Host-15min-session='+token,{...env,AUTH_ALLOWED_EMAILS:'other@example.test'}),null);
 const response=await authRoute(new Request('https://example.test/auth/logout',{method:'POST',headers:{origin:'https://evil.test',cookie:'__Host-15min-session='+token}}),env);assert.equal(response.status,403);
 assert.equal((await authRoute(new Request('https://example.test/auth/logout',{method:'POST',headers:{origin:env.APP_ORIGIN,cookie:'__Host-15min-session='+token}}),env)).status,303);
 assert.equal(await getUser('__Host-15min-session='+token,env),null);
 insert.run(await hash(random()),'google:expired','demo@example.test','Demo',0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions WHERE expires_at>?').get(Date.now())?.n,0);
});
test('OAuth state is bound to browser, expiring and consumed once; PKCE and nonce are sent',async()=>{
 const {env,sqlite}=fixture();const login=await authRoute(new Request('https://example.test/auth/login'),env);assert.equal(login.status,302);
 const url=new URL(login.headers.get('location')!);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('nonce'));assert.equal(url.searchParams.get('scope'),'openid email profile');assert.equal(sqlite.prepare('SELECT count(*) AS n FROM oauth_flows').get()?.n,1);
 const callback='https://example.test/auth/callback?state='+url.searchParams.get('state')+'&code=fixture';
 assert.equal((await authRoute(new Request(callback),env)).status,400);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM oauth_flows').get()?.n,1);
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:400});
 try {const headers={cookie:login.headers.get('set-cookie')!.split(';')[0]};assert.equal((await authRoute(new Request(callback,{headers}),env)).status,400);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM oauth_flows').get()?.n,0);assert.equal((await authRoute(new Request(callback,{headers}),env)).status,400);}finally{globalThis.fetch=original;}
});
test('identity rejects wrong nonce, unverified email, wrong authorized party and fake JWT',async()=>{
 const {env}=fixture();const p={sub:'123',nonce:'n',email:'demo@example.test',email_verified:true};assert.equal(identity(p,'n','client',env).userId,'google:123');
 for(const claims of [{...p,nonce:'other'},{...p,email_verified:false},{...p,azp:'other'}])assert.throws(()=>identity(claims,'n','client',env));
 await assert.rejects(()=>verifyGoogle('eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.','n',env));
 assert.equal(validOrigin(new Request('https://example.test/api/items',{method:'DELETE'}),env.APP_ORIGIN),false);
});

test('signed ID tokens enforce signature, issuer, audience and expiry',async()=>{
 const {env}=fixture();const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='fixture';
 const resolver=createLocalJWKSet({keys:[jwk]});
 const make=(issuer='https://accounts.google.com',audience=env.GOOGLE_CLIENT_ID,expires='5m')=>new SignJWT({sub:'fixture',nonce:'nonce',email:'demo@example.test',email_verified:true}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuedAt().setIssuer(issuer).setAudience(audience).setExpirationTime(expires).sign(privateKey);
 assert.equal((await verifyGoogle(await make(),'nonce',env,resolver)).userId,'google:fixture');
 for(const token of [await make('https://evil.test'),await make(undefined,'wrong-client'),await make(undefined,undefined,'-1s')])await assert.rejects(()=>verifyGoogle(token,'nonce',env,resolver));
 const token=await make();await assert.rejects(()=>verifyGoogle(token.slice(0,-10)+'AAAAAAAAAA','nonce',env,resolver));
});
