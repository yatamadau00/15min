# Google認証とデプロイの設定

この手順は運用者が実施するものです。リポジトリの公開時点でGoogle Cloud登録、認証情報発行、Cloudflareへのデプロイは行っていません。

## Google OAuth

1. 運用者のGoogle CloudプロジェクトでOAuth同意画面と「ウェブアプリケーション」のOAuthクライアントを設定します。テスト公開の場合は必要なテストユーザーを登録します。
2. 承認済みリダイレクトURIに正規URLの `/auth/callback` を登録します。ローカル例は `http://localhost:5173/auth/callback`。`localhost` と `127.0.0.1` は別のoriginです。
3. `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` をサーバー環境へ設定します。公開変数（`VITE_*`、`NEXT_PUBLIC_*`）やGitには入れません。
4. `APP_ORIGIN` を同じoriginに設定します。ローカルHTTPは `APP_ENV=development` とループバックホストの組合せのみ許可されます。
5. 必要なら `AUTH_ALLOWED_EMAILS` を指定します。空欄の場合は任意の検証済みGoogleアカウントを受け付けますが、データは各アカウントに分離されます。

要求するscopeは `openid email profile` のみです。カレンダー権限・refresh tokenは取得しません。Googleのaccess tokenやID tokenはセッション作成後に保存しません。

参考: [Google OpenID Connect公式資料](https://developers.google.com/identity/openid-connect/openid-connect)、[API reference](https://developers.google.com/identity/openid-connect/reference)。

## Cloudflare Workers / D1

1. 既存の個人アプリとは別のWorkerとD1を用意します。
2. `wrangler.jsonc` のプレースホルダー `database_id` を新規DBのIDへ変更します。元アプリのIDをコピーしないでください。
3. 本番Workerへ `APP_ORIGIN` を設定し、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` はWrangler secrets等の秘密値機能で設定します。本番では `APP_ENV=development` を使いません。
4. 対象DB・アカウントを確認したうえでマイグレーションを適用します。ローカル用は `npm run db:migrate:local`、運用DB用は `npx wrangler d1 migrations apply DB --remote` です。
5. `npm run build` 後、対象を確認して `npx wrangler deploy --config dist/server/wrangler.json` で配置します。生成設定にも意図したbindingsが入っていることを確認します。
6. 正規URLでGoogleログイン、データ保存、別アカウント分離、ログアウト、別端末の同期を確認します。タイマー残り時間はサーバー時刻で補正します。予定入力や手動記録の現在時刻には端末時刻も使うため、端末は自動時刻設定を推奨します。

認証変数かDB bindingが欠けると保護された入口は503になります。マイグレーション未適用などのDB障害時もデータアクセスは成功しません。

認証セッションは7日固定で、ログアウト時にサーバー側でも破棄します。期限切れのセッション・認証試行は次回ログイン開始時に削除されます。大規模運用では定期的な期限切れ行の清掃と `/auth/login` へのレート制限を運用側で追加してください。

参考: [Vinext公式リポジトリ](https://github.com/cloudflare/vinext)、[Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。
