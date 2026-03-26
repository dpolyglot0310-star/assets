# 📦 Asset Catalog

プライベートグループ向けの素材管理サーバーです。
画像や動画（mp4）のプレビュー、およびURLのコピーが簡単に行えます。

### 🚀 カタログを開く
**[👉 ここをクリックしてカタログを表示](https://dpolyglot0310-star.github.io/assets/)**

---

### 🛠 運用ルール（更新手順）

新しい素材を追加した際は、以下の手順でリストを更新してください。

1. 素材を `assets/` フォルダ内の適切な場所へアップロード（Push）する。
2. [カタログページ](https://dpolyglot0310-star.github.io/assets/)を開く。
3. **「APIスキャン実行」** ボタンを押す。
4. **「list.jsonを保存」** ボタンを押し、ダウンロードされたファイルをリポジトリの `assets/` フォルダへ上書きする。
5. `list.json` を GitHub へ Push する。

### 📁 フォルダ構成
- `assets/`: 画像素材、`list.json`
- `assets/move/`: 動画素材（mp4, webm等）
- `assets/backup/`: ※このフォルダはカタログに表示されません