# 10万円で学ぶ暗号資産ログ

年間10万円以内で暗号資産を少額運用しながら、Web3・税務・ステーキング・相場サイクルを学ぶための静的ブログMVPです。

初期実装では、外部API、CMS、価格自動取得、グラフ、SNS自動投稿は使っていません。記事を追加しやすく、将来AstroやCMSへ移行しやすいように、コンテンツと生成処理を分けています。

## 構成

```text
content/
  data/          サイト設定、カテゴリ、銘柄、運用方針
  pages/         プロフィール、免責事項、広告ポリシーなどの固定ページ
  posts/         Markdown記事
  templates/     記事テンプレート
scripts/
  build.mjs      静的HTML生成
  serve.mjs      dist/をローカル配信
src/
  search.js      サイト内検索
  assets/        ロゴ、OGP画像
  styles/        CSS
.github/
  workflows/     GitHub Pagesデプロイ
docs/
  deploy.md      公開手順
  publish-checklist.md 公開前チェックリスト
dist/            生成された公開用ファイル
```

## 使い方

ビルド:

```bash
node scripts/build.mjs
```

ローカル表示:

```bash
node scripts/serve.mjs
```

表示URL:

```text
http://localhost:4173
```

公開手順は [docs/deploy.md](docs/deploy.md) にまとめています。

GitHub Pagesで公開する場合は、`main` ブランチへpushすると `.github/workflows/pages.yml` が `dist/` をビルドしてデプロイします。通常のプロジェクトサイトでは `/リポジトリ名/` 配下でも動くように `SITE_BASE_PATH` を自動設定します。

## 記事の追加

`content/posts/` にMarkdownファイルを追加します。

```md
---
title: 記事タイトル
slug: article-slug
description: 記事の概要
category: beginner-notes
tags: [初心者メモ, 用語]
publishedAt: 2026-05-16
updatedAt: 2026-05-16
author: 運営者
isPublished: true
relatedCoinSymbols: [BTC, ETH]
---

## 見出し

本文を書きます。
```

カテゴリは `content/data/categories.json` の `slug` を指定します。

本文では、見出し、箇条書き、番号付きリスト、引用、コード、表を使えます。

## サイト内検索

`node scripts/build.mjs` を実行すると、公開記事から `dist/search-index.json` が生成されます。

検索ページは `/search/` です。検索対象は、記事タイトル、概要、カテゴリ、タグ、関連銘柄、本文です。外部検索サービスは使っていません。

## 月次運用ログの追加

月次ログは専用DBではなく、`operation-log` カテゴリの記事として追加します。

1. `content/templates/monthly-report.md` をコピーします。
2. `content/posts/YYYY-MM-operation-log.md` のような名前で保存します。
3. frontmatter の `title`、`slug`、`publishedAt`、`updatedAt` を更新します。
4. 購入・売却の有無、買った理由、買わなかった理由、税務記録、来月確認したいことを書きます。
5. `node scripts/build.mjs` を実行します。

初期MVPでは価格自動取得や損益計算は行いません。まずは判断理由と記録習慣を残すことを優先します。

## 記事テンプレート

`content/templates/` に以下のテンプレートがあります。

- `monthly-report.md`: 月次運用ログ
- `purchase-log.md`: 購入ログ
- `tax-note.md`: 税務メモ
- `beginner-note.md`: 初心者向け解説
- `weekly-topic.md`: 今週のトピック

テンプレートを `content/posts/` にコピーし、`isPublished: false` のまま下書きとして編集してください。公開する時に `isPublished: true` にします。

## MVPで入っているもの

- トップページ
- 記事一覧ページ
- 記事詳細ページ
- 運用ログ一覧ページ
- 銘柄メモ一覧・詳細ページ
- サイト内検索ページ
- カテゴリ一覧ページ
- カテゴリ別記事一覧ページ
- 運用方針ページ
- プロフィールページ
- 免責事項ページ
- 広告・PRポリシーページ
- 公式情報リンクページ
- プライバシーポリシーページ
- 404ページ
- 初期記事5本
- 銘柄配分データ
- 検索インデックス生成
- レスポンシブ対応

## まだ入れていないもの

- CMS
- 管理画面
- 価格自動取得
- 損益自動計算
- 月次レポート専用ページ
- SNS自動投稿
- お問い合わせフォーム
- アクセス解析
- 広告タグ

## 公開前に設定したいこと

`content/data/site.json` の `url` に公開ドメインを設定すると、canonical URL、サイトマップ、RSSフィードが生成されます。

```json
{
  "url": "https://example.com",
  "basePath": ""
}
```

ドメイン確定までは空欄のままで問題ありません。

ローカルで公開URLつきの出力を確認したい場合は、環境変数で一時指定できます。

```bash
SITE_URL=http://127.0.0.1:4173 node scripts/build.mjs
```

GitHub Pagesのプロジェクトサイトを手元で確認する場合:

```bash
SITE_URL=https://USER.github.io/REPOSITORY SITE_BASE_PATH=/REPOSITORY node scripts/build.mjs
```

## 注意

このサイトは個人の学習・運用記録であり、投資助言ではありません。暗号資産は価格変動が大きく、元本割れのリスクがあります。税務上の取扱いについては、国税庁の情報や税理士等の専門家に確認してください。
