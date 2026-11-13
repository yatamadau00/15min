# セキュリティ設計

- Google認証未設定時は保護ページ/APIを拒否します。ChatGPT由来ヘッダー、任意のuser ID、デモ用cookieを認証に使いません。
- Google認可コードフローにstate、ブラウザー拘束cookie、nonce、PKCE S256を使用。stateはD1のDELETE RETURNINGで一度だけ消費します。
- `jose` によりGoogleのJWKSを使ってRS256署名、issuer、audience、有効期限を検証します。nonce、authorized party、検証済みメール、任意allowlistも確認します。
- セッションは256bitのランダム値で、DBにはSHA256のみ保存します。本番cookieは `__Host-`、Secure、HttpOnly、SameSite=Lax、Path=/。ログアウトはPOSTとOrigin検証を要求し、DBのセッションも削除します。
- API変更操作は正規Originを要求します。JSON以外のPOSTと16KiBを超える本文を拒否します。入力はスキーマ検証し、SQLはパラメーター化します。
- ownerでユーザーを分離し、タイマーrevisionとD1 batchで競合を制御します。タイマー内部データを汎用APIから上書きできません。
- HTML/APIにno-store、nosniff、Referrer-Policy: same-origin、frame拒否を設定。CSPにはフレームワークのインラインスクリプト・style用のunsafe-inlineが残っています。厳密なnonce CSPは今後の改善対象です。
- デモは実データAPIから独立し、架空データをメモリーだけに保持します。画面写真もデモのみです。

## 運用時の注意

公開ソースと実際の運用は別です。OAuthクライアント、Google側同意設定、HTTPS、Cloudflareアカウント設定、バックアップ、アクセス制限、レート制限、監視は運用者が設定してください。個人記録を公開issue、スクリーンショット、ログへ貼らないでください。

このリポジトリに秘密値、実際の利用履歴、元アプリの運用IDや履歴を含めません。認証情報を誤って公開した場合は削除だけでなく当該資格情報を失効させてください。

脆弱性の報告では実際のトークンや個人記録を公開issueに含めず、再現条件と架空データを使ってください。実Googleアカウントによる往復ログインは、運用者によるOAuth登録後の確認が必要です。
