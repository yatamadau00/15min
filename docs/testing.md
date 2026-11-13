# 検証

2026-11-13、macOS / Node.js 25.9.0で検証。すべて架空データとローカルDBを使用しています。

| 確認 | 結果 |
|---|---|
| TypeScript・本番ビルド | 成功 |
| 単体テスト | 18件成功。認証、入力互換、区間集計、単調増加時計、再試行ゲート、同期応答の世代管理、通信エラー |
| Worker/D1統合 | 未認証・偽装ヘッダー拒否、ユーザー分離、CSRF、予約ID拒否、revision競合、同時更新、ログアウト失効が成功 |
| ブラウザー | 21件成功。デモ3件、認証済み画面7件、タイマー同期5件、同期競合2件、通信エラー4件 |
| 画面資料 | `/demo` の実画面。PCとスマホ、架空データのみ |
| npm audit | 依存変更なし。前回検査の既知脆弱性0件 |
| ESLint | エラーなし。既存UI由来のhook依存等の警告は残存 |

## 回帰テストの実行

```sh
npm ci
npm run db:migrate:local
npm run build
npx playwright install chromium
npm run typecheck
npm test
npm run lint
npm run test:browser
```

Playwrightがローカル本番ビルドを8787（認証未設定）と8788（架空の認証設定）で起動します。実際のGoogle認証情報は不要です。`.dev.vars` に実際の値を置いた開発環境とは分けて実行してください。各テストはランダムな架空ユーザーと短命cookieを作り、終了時に当該ユーザーの行だけ削除します。

`tests/browser/authenticated.spec.ts` は、実Worker/D1に対して以下を検証します。

- 実ブラウザーのログアウトフォーム送信、cookie破棄、コピー済みセッションの失効、外部/null/欠落Originの拒否
- タイマー開始→一時停止→終了→再読込後のメモ保存と消去
- 数値で保存された旧deletedフラグの互換性
- タスクの分類を「未分類」へ変更
- 再開・再停止・終了後もメモと消去状態を維持
- 500区間を持つ記録を小さいメタデータだけ送信して編集・消去し、元区間を維持

`tests/browser/timer-sync.spec.ts` は端末時計の±1時間のずれと途中変更、未完了のsettle応答、503時の再試行間隔、409直後の再同期、サーバー確定時の一度だけの記録を検証します。503/409などの障害応答はブラウザーの通信層で注入します。

`tests/browser/demo.spec.ts` では未設定時503、基本操作、スマホの初期表示を確認し、`docs/screenshots` の架空データ画像も更新します。

同期競合テストは古いGET応答を保留し、削除や新しい取得の後に返しても画面を巻き戻さないことを確認します。通信エラーテストはHTML・空本文・不正JSONを注入し、日本語の案内と409時の再同期を確認します。

## APIのみの統合テスト

```sh
npm start -- --port 8788 --var APP_ENV:development --var APP_ORIGIN:http://127.0.0.1:8788 --var GOOGLE_CLIENT_ID:fixture-client --var GOOGLE_CLIENT_SECRET:fixture-secret
# 別ターミナル
node scripts/test-api.mjs
```

このclient値は無効な架空値です。接続先は127.0.0.1に固定しており、本番向けの実行手順ではありません。

## 公開前検査と限界

`node scripts/scan-public.mjs` はGit管理対象の禁止パスと既知の秘密値形式を検査します。公開テキスト・画面画像の目視確認も併用します。

Google OAuthの実アカウント往復ログインは未実施です。Google Cloud登録、秘密値発行、配置先での確認は運用者が行います。画面ロック中の通知と物理端末間の通信遅延は環境依存です。ブラウザーテストはローカル本番ビルドで行っています。

CIにも単体・ブラウザー・型・ビルド・秘密情報検査を設定しています。CIの成功は実際のワークフロー結果で確認してください。依存更新時は同じ検証を再実行します。
