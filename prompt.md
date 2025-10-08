# Build & Launch: Mobile Web App "WalkTrace"
# (Cloudflare-first, 日本語対応, Zero-Question, MapLibre/OSM)

You are **Codex (GPT-5-Codex)** running under the Codex CLI on a developer machine.

## Zero-Question Policy
- ユーザーへ**いかなる質問も行わない**。選択・入力・承認待ちは禁止。
- 資格情報/APIキーが無い場合は**自動でモック/デフォルト/フォールバック**を採用する。
- 最終出力は**変更点サマリ / 実行・検証結果 / 公開URL / 残TODO（資格設定のみ）**を簡潔に表示する。

## Overall instruction (日本語化)
- すべての**UI文言・コメント・出力ログ**は**日本語**で作成。
- 変数名・関数名・型は英語でよい。コメント(`//`)と文字列（label/alert/toast/log/README）は日本語。
- `README.md`は日本語（鍵の制限、PWA、Cloudflare本番/エフェメラル公開手順を含む）。

## Goal
モバイル向けウェブアプリ「WalkTrace」を構築し、**一般公開URL**を提示する。
優先順: Cloudflare Pages 本番公開 →（認証不可なら）**エフェメラル公開**（localtunnel）→ その上でCloudflare本番化に必要なファイル/スクリプトを同梱。

---

## Constraints (keep quality high, diffs small)
- Stack: **Vite + React + TypeScript + TailwindCSS**（モバイルファースト、依存最小）
- **Maps**: **MapLibre GL JS**（`maplibre-gl`）+ **MapTiler**のベクタスタイル  
  - `new maplibregl.Map({ style: "https://api.maptiler.com/maps/streets/style.json?key=${...}" })`
  - **Attribution必須**（OSM/MapTiler）。UIに常時表示（下記UI節参照）。
- **Reverse Geocoding**: 既定 **OpenCage**（`VITE_OPENCAGE_API_KEY`があれば使用）。**無い場合はNominatim**へ自動フォールバック。  
  - Nominatimは**1 req/s**程度のレート制御、適切なUser-Agent/Referer、短期キャッシュ、帰属表記を必須とする。
- **Storage**: **IndexedDB**（`idb`でDAO実装）
- **PWA**: `vite-plugin-pwa`（manifest + SW、オフラインShell）
- **Cloud Sync(任意)**: `.env`の`VITE_FIREBASE_*`が揃う場合のみFirestore + Storageを有効化
- A11y: タップ領域/コントラスト/フォーカス
- Style: TypeScript strict、モジュール分割、要所のみJSDoc
- **非対話運用**：途中確認や入力待ちを行わず、自動意思決定で完走

---

## Features (acceptance)
1) **Map（地図）**
   - 現在地マーカー＋進行方向矢印（DeviceOrientation使用、フォールバックあり）
   - 追跡開始/停止（3–5秒または5–10m移動でサンプリング）
   - ライブPolyline足跡；日単位で保存（サイズ抑制の間引き）
   - 地図タップ → 逆ジオコーディング → モーダル：写真撮影/アップロード（`accept="image/*" capture="environment"`）→ 保存
2) **List（一覧）**
   - カード一覧：サムネ、住所、日時、現在地からの距離
   - 詳細：ミニ地図、メモ編集、削除、「地図アプリで開く」リンク
   - **Export/Import**：JSON（メタ + 任意でthumb）。可能なら**JSZip**で原本一括DL
3) **Data model**
   - `Place { id, lat, lng, address, createdAtISO, photoBlob?, thumbDataURL, note? }`
   - `RoutePoint { lat, lng, tISO }`（間引き）
   - 簡易バージョニング（マイグレーション可）
4) **Settings**
   - 精度/頻度トグル、キャッシュクリア、エクスポート設定
   - Firebaseセクションは環境変数が揃う時のみ表示/有効化

---

## Env & Security
- `.env.example` を作成：
VITE_MAPTILER_API_KEY=
VITE_OPENCAGE_API_KEY=

## 任意（利用時のみ）
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

- `import.meta.env`からのみ読み込み。**鍵の埋め込み禁止**。
- **キー未設定時の挙動**：  
- MapTiler：デモスタイルや制限つき公開テンプレで一時表示。  
- 逆ジオ：Nominatimに自動フォールバック（レート制御・帰属・キャッシュを遵守）。  
- 地図が取得不能でも、保存/一覧/エクスポート・PWAは検証可能な**モック表示**を用意。
- READMEに**リファラ制限**と**帰属義務**の手順を明記。

---

## Project layout (create)
- `src/app/`: `MapPage.tsx`, `ListPage.tsx`, `SettingsPage.tsx`
- `src/components/`, `src/stores/`（Zustand可）, `src/lib/`（`db.ts`, `maps.ts`, `geocode.ts`, `geo.ts`, `export.ts`, `firebase.ts`）
- PWA: `vite.config.ts` + `vite-plugin-pwa`, `public/manifest.webmanifest`, icons
- Tests: スキーマ/Export/Importの最小ユニットテスト

---

## UI
- 下部タブ（**地図 / 一覧 / 設定**）。セーフエリア対応。タッチ最適化。
- 地図は全画面、FAB：**開始/停止**・**ここを保存**。
- スケルトン/トーストはTailwindで実装。  
- **Attribution（必須）**：  
- **MapPage右下固定**（推奨）：`absolute bottom-1 right-1 text-[10px] text-gray-600 bg-white/60 px-1 rounded`  
- 文言例：  
  `© OpenStreetMap contributors / © MapTiler`（各リンクを`target="_blank"`で付与）
- MapLibreの既定コントロールがある場合でも、UI上で**常時可視**にする。

---

## Implementation notes
- **MapLibre**: `maplibre-gl`をロードしMapを初期化。現在地は`navigator.geolocation.watchPosition`、方角は`DeviceOrientationEvent`から取得。矢印は`bearing`/`rotation`で表現。  
- **Tiles**: MapTilerの`style.json`を使用。キーは`VITE_MAPTILER_API_KEY`。  
- **Reverse Geocoding**:  
- 既定：OpenCage（`https://api.opencagedata.com/geocode/v1/json?q={lat}+{lng}&key={KEY}`）  
- フォールバック：Nominatim（`/reverse?lat=...&lon=...&format=jsonv2`）、**1 req/s**制御・User-Agent/Referer付与・短期キャッシュ・帰属表記。  
- **Route persistence**: 日別バケット化（`YYYY-MM-DD`）、間引き（Douglas–Peucker等は不要、距離/時間しきい値で十分）。  
- **Thumbnails**: `createImageBitmap` + `<canvas>`で縮小。一覧はdataURL、詳細で原本。  
- **Export/Import**: JSON（メタ＋thumb）で往復できること。  
- **Firebase**: 全変数揃った時のみ初期化し、同期ON/OFFを設定で切替。

---

## Deployment
### A. Cloudflare Pages（**最優先**）
- 生成物：`dist/`
- 開発依存：`wrangler`
- npmスクリプト：  
- `npm run deploy:cf` → `wrangler pages deploy dist --project-name walktrace`  
- 初回は `wrangler pages project create walktrace --production-branch main` を自動実行してからdeploy  
- 認証は**非対話**で試行：`wrangler --version` → `wrangler login || true` → 環境変数 `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` があれば使用。不可なら**Bへ即フォールバック**。

### B. エフェメラル公開（**非対話・即時URL**）
- `npx serve dist --port 5173`（ポートは空き番号でよい、ログに記録）  
- `npx localtunnel --port 5173 --print-requests` を起動し**公開URL**を取得  
- 最終サマリに**アクセスURL**を明示（例：`https://walktrace-xxxx.loca.lt` 等）

### C. 参考（生成のみ）
- Netlify/Vercel/Cloudflare Pages(Git連携)用の設定ファイル・READMEは作成するが、実行はしない

---

## DX & scripts
- `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `format`, `deploy:cf`, `serve`, `tunnel`
- ESLint/Prettier、TS strict。Huskyは任意。`README.md`に全コマンド説明。

---

## Verification checklist (must run & summarize)
- Lint / Typecheck / Unit tests 成功
- ローカル確認：  
1) MapLibre地図が描画され、現在地マーカー・方角矢印が更新  
2) 追跡開始/停止でPolyline描画、リロード後も保持  
3) 地図タップ→逆ジオ→写真撮影/アップロード→保存  
4) 一覧表示・詳細操作（編集/削除/外部地図リンク）  
5) Export/Import往復OK  
- PWA：インストール可能、オフラインでShell/一覧表示  
- `dist/` を `npx serve dist` で起動しコンソールエラーなし  
- **公開URL**（Aが成功なら`pages.dev`、不可ならBの`tunnel` URL）がHTTP 200でアクセス可能

---

## Deliverables
- 完動アプリのソース一式
- `README.md`（日本語）：鍵の設定、安全な運用、**帰属表記**の要件、Cloudflare Pages/エフェメラル公開の手順
- `.env.example`、PWAアセット、CFデプロイスクリプト、最小テスト
- 実行ログ末尾に：**変更点サマリ / 実行コマンド / 公開URL / 残TODO（資格設定のみ）**

---

## Tools / CLI etiquette (Codex)
- 使うのは **`shell`** と **`apply_patch`** のみ。差分は小さく。
- すべての`shell`で**`workdir`**を指定。
- 大きな出力はログにダンプせず、**ファイルパス**で示す。
- 最後に**簡潔なサマリ**を印字。

---

## Start now
短い計画→スキャフォールド→実装→検証→A試行→A不可ならBで公開→サマリ出力。  
**ユーザーへの質問は禁止。** 必要に応じて自動でモック/デフォルト/フォールバックを選択して最後まで完走する。
