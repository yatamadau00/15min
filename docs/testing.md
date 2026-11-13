# 検証

2026-11-13、macOS / Node.js 25.9.0で検証。すべて架空データとローカルDBを使用しています。

| 確認 | 結果 |
|---|---|
| TypeScript | `npm run typecheck` 成功 |
| 本番ビルド | `npm run build` 成功 |
| 単体テスト | 9件成功。タイマー区間・日跨ぎ・重複・旧形式、認証設定、state/PKCE、cookie/session、ID token署名/issuer/audience/expiry、入力検証 |
| Worker/D1統合 | 未認証・偽装ヘッダー拒否、ユーザー分離、CSRF、汎用APIのタイマー上書き拒否、revision競合、同時更新、ログアウト失効が成功 |
| ブラウザー | 3件成功。未設定503、タイマー開始/4秒同期/停止/終了、振り返り、390×844で操作ボタンと今日の集中時間を確認 |
| 画面資料 | 本番ビルドの `/demo` をChromiumで撮影。1440×960のPCと390×844のスマホ。実データなし |
| npm audit | 既知の脆弱性0件（検査時点） |
| ESLint | エラーなし。既存タイマーUI由来のhook依存等の警告は残存 |

## ブラウザーテスト

```sh
npx playwright install chromium
npm run build
npm start -- --port 8787
# 別ターミナル。認証変数なしのサーバーを使用
npm run test:browser -- tests/browser/demo.spec.ts
```

`docs/screenshots` の画像もこのテストで更新されます。認証済み本番画面を撮影するコードはありません。

## 実Worker/D1の統合テスト

```sh
npm run db:migrate:local
npm run build
npm start -- --port 8788 --var APP_ENV:development --var APP_ORIGIN:http://127.0.0.1:8788 --var GOOGLE_CLIENT_ID:fixture-client --var GOOGLE_CLIENT_SECRET:fixture-secret
# 別ターミナル
node scripts/test-api.mjs
```

ここに示すclient値は無効な架空値です。実際のGoogleログインには使えません。スクリプトはローカルDBに短命な架空ユーザーセッションを作り、終了時にそのユーザーの行を削除します。ローカル専用であり、接続先はコードで127.0.0.1に固定しています。

## 公開前検査

`node scripts/scan-public.mjs` はGit管理対象の禁止パスと既知の秘密値形式を検査します。これに加え、公開するテキスト中のメールアドレス・URL・運用ID候補と画面画像を目視確認します。スキャナーだけで秘密情報の完全な不存在を保証するものではありません。

Google OAuthの実アカウント往復ログインは未実施です。Google Cloudの登録と秘密値発行は運用者が行い、配置先で確認してください。通知許可、画面ロック中の通知、物理端末間の通信遅延は環境依存です。自動テストの同期確認はローカルWorkerと複数リクエストによるものです。

依存更新時はビルド・型・単体・ブラウザー・統合テストを再実行してください。`satori`の`fflate`とTypeScript ESLintの`minimatch`は既知脆弱性修正版に限定してoverrideしています。

## 認証済み画面のブラウザー回帰テスト

上記の8788番ローカルサーバーを起動してから、次を実行します。

```sh
npm run test:browser -- tests/browser/authenticated.spec.ts
```

実際のWorker/D1を使用し、ランダムな架空ユーザーと短命cookieをテストごとに作成・削除します。ログアウトのフォーム送信、cookie破棄、サーバー側失効、外部Origin拒否、停止→終了後のメモ編集、旧形式真偽値の互換性、未分類への変更、再開後のメモ・消去状態維持を検証します。Google認証の実登録は不要です。
