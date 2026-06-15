# 初期セットアップ手順（エンジニア向け）

GitHub Pages に無料で公開するまでの手順です。所要時間：約15分。

---

## 1. 前提

- GitHub アカウント（無料）
- このプロジェクト一式（`index.html` などのファイル群）

サーバー・データベース・ビルドツールは **一切不要** です。

---

## 2. リポジトリを作る

1. GitHub で新しいリポジトリを作成
   - リポジトリ名：`5s-app`（変更可。変える場合は公開URLも変わります）
   - 公開設定：**Public**（GitHub Pages を無料で使うため）
2. このフォルダの中身をすべてアップロード（`git push` または GitHub の画面からドラッグ＆ドロップ）

```bash
git init
git add .
git commit -m "Initial commit: 5S QR viewer"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/5s-app.git
git push -u origin main
```

> `node_modules/` は `.gitignore` で除外済みです。コミットしないでください。

---

## 3. GitHub Pages を有効化する

1. リポジトリの **Settings** → **Pages**
2. **Source** を `Deploy from a branch` にする
3. **Branch** を `main` / `/ (root)` に設定して **Save**
4. 1〜2分待つと、ページ上部に公開URLが表示されます

```
https://<ユーザー名>.github.io/5s-app/
```

---

## 4. 動作確認

| 確認項目                       | URL例                                              |
| ------------------------------ | -------------------------------------------------- |
| エリア一覧（パラメータなし）   | `.../5s-app/`                                       |
| 現場ページ                     | `.../5s-app/?area=area-A1`                          |
| 存在しない現場（エラー表示）   | `.../5s-app/?area=area-zzz`                         |
| QRコード一覧（管理）           | `.../5s-app/admin.html`                             |
| QRコード印刷（A4）             | `.../5s-app/qr-generator.html`                      |

スマホ（iOS Safari / Android Chrome）でも表示を確認してください。

---

## 5. 現場を追加する

1. `areas/_template.json` をコピーして `areas/area-XX.json` を作成
2. 全フィールドを入力（スキーマは [CLAUDE.md](../CLAUDE.md) の「3. データスキーマ」）
3. **`app.js` の `AREA_IDS` 配列に新しい現場IDを追加**
   ```js
   const AREA_IDS = ["area-A1", "area-B1", "area-XX"];
   ```
4. コミット＆プッシュ → 約1分で反映

> `AREA_IDS` はエリア一覧ページ・QRコード一覧の表示対象を決めるリストです。
> 現場を増やしたら必ず追記してください。

---

## 6. 技術メモ

- 純粋な静的サイト（HTML / CSS / Vanilla JS）。ビルド工程なし。
- QRコード生成は `qrcode.js`（自己完結・外部依存なし・オフライン動作）。
- データは `areas/*.json` を `fetch` で読み込み。
- 詳細な規約・制約は [CLAUDE.md](../CLAUDE.md) を参照。
