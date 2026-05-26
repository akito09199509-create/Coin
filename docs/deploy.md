# 公開手順

このサイトは外部依存なしの静的サイトです。`dist/` の中身を静的ホスティングへ配置すれば公開できます。

GitHub Pagesで公開する場合は、`.github/workflows/pages.yml` のGitHub Actionsで自動デプロイできます。

## GitHub Pagesで公開する

1. GitHubにリポジトリを作成します。
2. このローカルリポジトリにremoteを追加してpushします。
3. GitHubのリポジトリ設定で、PagesのSourceを「GitHub Actions」にします。
4. `main` ブランチへpushすると、Actionsが `dist/` を生成してPagesへデプロイします。

```bash
git remote add origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

通常のプロジェクトサイトでは、公開URLは以下の形になります。

```text
https://USER.github.io/REPOSITORY/
```

この場合、GitHub Actions側で `SITE_BASE_PATH=/REPOSITORY` を自動設定します。

ユーザーサイトまたは組織サイト、つまり `USER.github.io` という名前のリポジトリでは、公開URLは以下になります。

```text
https://USER.github.io/
```

この場合、base pathは空のままビルドされます。

独自ドメインを使う場合は、GitHubのRepository variablesに以下を設定してください。

| 変数名 | 例 | 用途 |
|---|---|---|
| `SITE_URL` | `https://example.com` | canonical URL、RSS、サイトマップ用 |
| `SITE_BASE_PATH` | 空欄 | 独自ドメイン直下なら空欄 |

## 1. サイトURLを決める

GitHub Actionsを使わずに手元でビルドする場合、公開ドメインが決まったら `content/data/site.json` の `url` に設定します。

```json
{
  "url": "https://example.com",
  "basePath": ""
}
```

GitHub Pagesのプロジェクトサイトを手元で確認する場合は、環境変数で一時指定できます。

```bash
SITE_URL=https://USER.github.io/REPOSITORY SITE_BASE_PATH=/REPOSITORY node scripts/build.mjs
```

## 2. ビルドする

```bash
node scripts/build.mjs
```

`url` または `SITE_URL` が設定されている場合、以下も生成されます。

- `dist/sitemap.xml`
- `dist/feed.xml`

## 3. ローカルで確認する

```bash
node scripts/serve.mjs
```

別ポートを使う場合:

```bash
PORT=4288 node scripts/serve.mjs
```

GitHub Pagesのプロジェクトサイトと同じ `/REPOSITORY/` 配下で確認する場合:

```bash
SITE_BASE_PATH=/REPOSITORY PORT=4288 node scripts/serve.mjs
```

## 4. 公開する

GitHub Actionsを使う場合、公開作業はpush後に自動で行われます。

手動で静的ホスティングへ置く場合は、公開先に `dist/` の中身を配置します。

静的ホスティングで指定する項目は、概ね以下です。

- Build command: `node scripts/build.mjs`
- Publish directory: `dist`
- Node version: 20以上

## 5. 公開後に確認する

- トップページが表示される
- 記事一覧と記事詳細が表示される
- `/search/` で検索できる
- `/sitemap.xml` が表示される
- `/feed.xml` が表示される
- 免責事項、広告・PRポリシー、プライバシーポリシーが表示される

## 注意

価格自動取得、損益計算、広告タグ、アクセス解析はまだ入れていません。公開後に必要性を見て追加します。
