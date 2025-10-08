# WalkTrace

WalkTraceは、歩きながら空き家や気になる場所を地図に記録し、足跡の軌跡も同時に保存できるモバイル向けウェブアプリ（PWA）です。MapLibre + OpenStreetMap/MapTilerの地図描画とIndexedDB永続化を備え、オフラインでも閲覧が可能です。

## 主な機能
- 現在地の追跡（距離/時間しきい値でサンプリング）と折れ線表示
- 地図タップまたはFABから地点登録（逆ジオコーディング、写真、メモ対応）
- 保存地点の一覧・詳細表示（距離表示、Googleマップ連携、メモ編集、削除）
- JSON / ZIP エクスポートとインポート（サムネイル・原本含有の切替）
- PWA対応：オフラインシェル、ホーム追加、カスタムアイコン
- オプションでFirebase（Firestore + Storage）に同期（環境変数入力時のみ）

## 事前準備
1. Node.js 20系、npm 10系を想定しています。
2. 依存関係を導入します。
   ```bash
   npm install
   ```
3. APIキーを `.env` に設定します。テンプレートは `.env.example` を参照してください。

```env
VITE_MAPTILER_API_KEY=    # MapTilerのAPIキー（未設定時はデモスタイルを使用）
VITE_OPENCAGE_API_KEY=    # 逆ジオコーディング用。未設定時はNominatimに自動フォールバック

# Firebase連携時のみ設定
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- MapTilerキーはドメイン制限を設定し、Osm/MapTilerの帰属表記を削除しないでください。
- Nominatimフォールバック時は自動で1req/s程度に制限し、`accept-language=ja` と連絡先情報を付与しています。
- Firebaseを利用する際はFirestore/Storage側でセキュリティルールを必ず設定してください。

## 開発コマンド
| コマンド | 説明 |
| --- | --- |
| `npm run dev` | Vite開発サーバーを起動（PWA開発モード有効） |
| `npm run build` | TypeScriptビルド + 本番バンドル生成（`dist/`） |
| `npm run preview` | ビルド済み成果物をローカルで確認 |
| `npm run lint` | ESLintチェック（警告ゼロを強制） |
| `npm run typecheck` | TypeScript型チェック（noEmit） |
| `npm run test` | Vitestによるユニットテスト |
| `npm run format` | Prettierで整形 |
| `npm run serve` | `dist/` を `serve` で公開（5173番ポート） |
| `npm run tunnel` | `dist/` を起動し LocalTunnel で外部公開 URL を取得 |
| `npm run deploy:cf` | Cloudflare Pages にデプロイ（`CLOUDFLARE_API_TOKEN` 等が必要） |

## デプロイ手順
### Cloudflare Pages（推奨）
1. `npm run build`
2. `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN`（Pages権限）を環境変数で設定
3. 初回は `wrangler pages project create walktrace --production-branch main` が自動実行されます
4. `npm run deploy:cf`

### エフェメラル公開（LocalTunnel）
1. `npm run tunnel`
2. ログに表示される `https://xxxx.loca.lt` を共有

## PWAについて
- `vite-plugin-pwa` を使用し、`registerType: autoUpdate` で常に最新化
- `public/manifest.webmanifest` と `public/icons/` にアイコンを配置済み
- `npm run build` 後、`npx serve dist` でオフライン挙動を確認できます

## データ構造
- `Place { id, lat, lng, address, createdAtISO, photoBlob?, thumbDataURL?, note? }`
- `RoutePoint { lat, lng, tISO }`
- IndexedDB（`idb`）で永続化し、日別バケットで足跡を管理
- エクスポートは schemaVersion を同梱し、JSON/ZIP 双方でインポート可能

## 帰属表記
- 画面右下に `© OpenStreetMap contributors / © MapTiler` を常時表示
- READMEや公開ページでも同クレジットの明示をお願いします

## セキュリティと注意事項
- APIキーは `import.meta.env` からのみ参照し、ソースへ直書きしません
- Firebase同期を有効にすると、`walktrace/default` コレクションに保存されます。用途に合わせてルールを調整してください
- Nominatim利用時は高負荷なバッチ処理を避け、公正利用ポリシーを守ってください

## 残課題（運用時に追加検討）
- Firebase認証（ユーザー個別同期）の導入
- ルートデータのさらなる間引きやGeoJSONエクスポート
- UIアクセシビリティの詳細検証（スクリーンリーダー対応など）
