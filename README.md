# 5S活動 QRコード閲覧システム

工場・現場の5S活動（整理・整頓・清掃・清潔・躾）の注意箇所を、
各現場に掲示した **QRコード** からスマホで閲覧できる、完全無料の静的Webシステムです。

- 💰 **0円運用**：GitHub Pages でホスティング（サーバー・DB不要）
- 📱 **アプリ不要**：QRをスマホカメラで読み取りブラウザ表示
- ✏️ **編集が簡単**：JSONファイルを書き換えるだけで即時反映
- 🔌 **外部依存なし**：QR生成も含めオフライン動作（CDN・外部API不使用）
- 👥 **同時100人**：CDN配信で同時アクセスに対応

---

## クイックスタート

```bash
# 1. ローカルで確認（任意のHTTPサーバーで可）
python -m http.server 8000
#   → http://localhost:8000/                ... エリア一覧
#   → http://localhost:8000/?area=area-A1    ... 現場ページ
#   → http://localhost:8000/admin.html       ... QRコード一覧（管理）
#   → http://localhost:8000/qr-generator.html ... QRコード印刷（A4）
```

> `file://` で直接開くと `fetch` がCORSで失敗します。必ずHTTPサーバー経由で開いてください。

GitHub Pages への公開手順は [docs/setup.md](docs/setup.md) を参照してください。

---

## ディレクトリ構成

```
5s-app/
├── CLAUDE.md            プロジェクト規約（変更は要合意）
├── index.html           メインビューア（スマホ最適化）
├── admin.html           QRコード一覧ページ（管理者用）
├── qr-generator.html    QRコード印刷ページ（A4・管理者用）
├── style.css            共通スタイル（モバイルファースト）
├── app.js               JSON読み込み・表示ロジック
├── qrcode.js            QRコード生成（自己完結・外部依存なし）
├── areas/               現場ごとのコンテンツ
│   ├── _template.json   新規現場テンプレート
│   ├── area-A1.json     サンプル：第1製造ライン A工程
│   └── area-B1.json     サンプル：第1倉庫 入出庫エリア
├── images/              イラスト・写真（命名規則は images/README.md）
└── docs/                ドキュメント
    ├── setup.md         初期セットアップ（エンジニア向け）
    ├── update-guide.md  コンテンツ更新（非エンジニア向け）
    └── qr-print-guide.md QRコード印刷・掲示手順
```

---

## URLルール

```
https://<ユーザー名>.github.io/5s-app/?area=area-A1
```

| アクセス                     | 表示                         |
| ---------------------------- | ---------------------------- |
| `?area=area-A1`              | 現場A-1のページ              |
| パラメータなし               | エリア一覧                   |
| 存在しない現場ID             | 「現場が見つかりません」画面 |

---

## 現場の追加

1. `areas/_template.json` をコピー → `areas/area-XX.json` を作成し全フィールド入力
2. `app.js` の `AREA_IDS` に現場IDを追加
3. 画像があれば `images/` に追加（`{エリアID}-{内容}.jpg`、500KB以下）
4. `admin.html` / `qr-generator.html` でQRコードを印刷・掲示

データスキーマの詳細は [CLAUDE.md](CLAUDE.md) の「3. データスキーマ」を参照。

---

## 技術スタック

| レイヤー       | 技術                    |
| -------------- | ----------------------- |
| ホスティング   | GitHub Pages            |
| フロントエンド | HTML / CSS / Vanilla JS |
| データ         | JSON ファイル           |
| QRコード       | 自己完結JS実装（`qrcode.js`） |

- フレームワーク（React/Vue等）・ビルドツール・外部CSS/フォントは不使用
- 認証なし（QRで誰でも閲覧可能なパブリックページ）
- 対象ブラウザ：iOS Safari 15+ / Android Chrome 90+（スマホ専用）

---

## ドキュメント

- 📘 [初期セットアップ（エンジニア向け）](docs/setup.md)
- 📗 [コンテンツ更新ガイド（担当者向け）](docs/update-guide.md)
- 📙 [QRコード印刷・掲示ガイド](docs/qr-print-guide.md)
- 📕 [プロジェクト規約（CLAUDE.md）](CLAUDE.md)

---

## ライセンス / 注意

社内利用を想定した静的サイトです。`qrcode.js` は公開されたQRコード規格
（ISO/IEC 18004）に基づく自己完結実装で、外部サービスへの送信は行いません。
