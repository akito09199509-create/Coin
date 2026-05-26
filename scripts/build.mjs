import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const contentDir = path.join(rootDir, "content");
const srcDir = path.join(rootDir, "src");

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric"
});

const site = await readJson("content/data/site.json");
const siteUrl = (process.env.SITE_URL || site.url || "").replace(/\/$/, "");
const siteBasePath = normalizeBasePath(process.env.SITE_BASE_PATH || site.basePath || "");
const categories = await readJson("content/data/categories.json");
const coins = await readJson("content/data/coins.json");
const officialLinks = await readJson("content/data/official-links.json");
const policy = await readJson("content/data/policy.json");
const posts = await loadPosts();
const pages = await loadPages();

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await copyAssets();

await writePage("index.html", renderHome());
await writePage("articles/index.html", renderArticlesIndex());
await writePage("logs/index.html", renderLogsPage());
await writePage("coins/index.html", renderCoinsIndex());
await writePage("search/index.html", renderSearchPage());
await writePage("categories/index.html", renderCategoriesIndex());
await writePage("policy/index.html", renderPolicyPage());
await writePage("profile/index.html", renderContentPage("profile"));
await writePage("disclaimer/index.html", renderContentPage("disclaimer"));
await writePage("pr-policy/index.html", renderContentPage("pr-policy"));
await writePage("resources/index.html", renderResourcesPage());
await writePage("privacy/index.html", renderContentPage("privacy"));
await writePage("404.html", renderNotFoundPage());

for (const post of posts) {
  await writePage(`articles/${post.slug}/index.html`, renderArticle(post));
}

for (const category of categories) {
  await writePage(`categories/${category.slug}/index.html`, renderCategoryPage(category));
}

for (const coin of coins) {
  await writePage(`coins/${coin.symbol.toLowerCase()}/index.html`, renderCoinPage(coin));
}

await writeJson("search-index.json", renderSearchIndex());
await writeText("robots.txt", renderRobots());
if (siteUrl) {
  await writeText("sitemap.xml", renderSitemap());
  await writeText("feed.xml", renderFeed());
}

console.log(`Built ${posts.length} articles into ${path.relative(rootDir, distDir)}/`);

async function readJson(relativePath) {
  const body = await fs.readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(body);
}

async function loadPosts() {
  const postDir = path.join(contentDir, "posts");
  const files = (await fs.readdir(postDir)).filter((file) => file.endsWith(".md")).sort();
  const entries = [];

  for (const file of files) {
    const fullPath = path.join(postDir, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.isPublished === false) continue;
    entries.push({
      ...data,
      body,
      slug: data.slug || path.basename(file, ".md"),
      sourcePath: fullPath
    });
  }

  return entries.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function loadPages() {
  const pageDir = path.join(contentDir, "pages");
  const files = (await fs.readdir(pageDir)).filter((file) => file.endsWith(".md")).sort();
  const pageMap = new Map();

  for (const file of files) {
    const fullPath = path.join(pageDir, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const { data, body } = parseFrontmatter(raw);
    pageMap.set(data.slug || path.basename(file, ".md"), { ...data, body });
  }

  return pageMap;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw.trim() };
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    data[key] = parseFrontmatterValue(rawValue);
  }

  return { data, body: match[2].trim() };
}

function parseFrontmatterValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => stripQuotes(item.trim()));
  }
  return stripQuotes(value);
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}

async function copyAssets() {
  const assetDir = path.join(distDir, "assets");
  await fs.mkdir(assetDir, { recursive: true });
  await fs.copyFile(path.join(srcDir, "styles", "main.css"), path.join(assetDir, "styles.css"));
  await fs.copyFile(path.join(srcDir, "search.js"), path.join(assetDir, "search.js"));

  const sourceAssets = path.join(srcDir, "assets");
  const files = await fs.readdir(sourceAssets);
  for (const file of files) {
    await fs.copyFile(path.join(sourceAssets, file), path.join(assetDir, file));
  }
}

async function writePage(relativePath, html) {
  const outputPath = path.join(distDir, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, applyBasePathToHtml(html), "utf8");
}

async function writeText(relativePath, text) {
  await fs.writeFile(path.join(distDir, relativePath), text, "utf8");
}

async function writeJson(relativePath, data) {
  await writeText(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

function renderBase({ title, description, pathname, children, bodyClass = "" }) {
  const pageTitle = title === site.name ? title : `${title} | ${site.shortName}`;
  const absolute = absoluteUrl(pathname);
  const ogImage = siteUrl ? `${siteUrl}/assets/og-image.svg` : sitePath("/assets/og-image.svg");

  return `<!doctype html>
<html lang="${site.language}" data-base-path="${escapeAttribute(siteBasePath)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttribute(description || site.description)}">
  <meta property="og:title" content="${escapeAttribute(pageTitle)}">
  <meta property="og:description" content="${escapeAttribute(description || site.description)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${escapeAttribute(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  ${absolute ? `<link rel="canonical" href="${escapeAttribute(absolute)}">\n  <meta property="og:url" content="${escapeAttribute(absolute)}">` : ""}
  <link rel="icon" href="/assets/site-mark.svg" type="image/svg+xml">
  ${siteUrl ? '<link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">' : ""}
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body class="${escapeAttribute(bodyClass)}">
  <a class="skip-link" href="#main">本文へ移動</a>
  ${renderHeader(pathname)}
  <main id="main">
    ${children}
  </main>
  ${renderFooter()}
</body>
</html>`;
}

function renderHeader(pathname) {
  const links = site.nav
    .map((item) => {
      const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
      return `<a href="${item.href}" ${isActive ? 'aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
    })
    .join("");

  return `<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="${escapeAttribute(site.name)}">
      <img src="/assets/site-mark.svg" width="36" height="36" alt="">
      <span>${escapeHtml(site.shortName)}</span>
    </a>
    <nav class="global-nav" aria-label="主要ナビゲーション">
      ${links}
    </nav>
  </div>
</header>`;
}

function renderFooter() {
  const links = site.footerLinks
    .map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`)
    .join("");

  return `<footer class="site-footer">
  <div class="footer-inner">
    <div>
      <p class="footer-title">${escapeHtml(site.name)}</p>
      <p>${escapeHtml(site.disclaimerShort)}</p>
    </div>
    <nav class="footer-links" aria-label="補足リンク">
      ${links}
    </nav>
  </div>
</footer>`;
}

function renderHome() {
  const latest = posts.slice(0, 4);
  const starterSlugs = ["start-crypto-learning-100k", "first-year-policy", "crypto-tax-record-first-step"];
  const starterPosts = starterSlugs.map((slug) => posts.find((post) => post.slug === slug)).filter(Boolean);

  return renderBase({
    title: site.name,
    description: site.description,
    pathname: "/",
    bodyClass: "home",
    children: `<section class="hero-band">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">少額で触り、記録して、理解する</p>
      <h1><span>年間10万円以内で</span><span>暗号資産とWeb3を</span><span>学ぶ。</span></h1>
      <p class="lead">${escapeHtml(site.description)}</p>
      <div class="hero-actions">
        <a class="button primary" href="/articles/">記事を読む</a>
        <a class="button secondary" href="/policy/">運用方針を見る</a>
      </div>
      <p class="fine-print">${escapeHtml(site.disclaimerShort)}</p>
    </div>
    ${renderAllocationPanel()}
  </div>
</section>

<section class="section">
  <div class="container section-heading">
    <p class="eyebrow">Start here</p>
    <h2>初めて読むなら</h2>
  </div>
  <div class="container card-grid three">
    ${starterPosts.map(renderArticleCard).join("")}
  </div>
</section>

<section class="section muted">
  <div class="container section-heading split">
    <div>
      <p class="eyebrow">Latest</p>
      <h2>最新記事</h2>
    </div>
    <a class="text-link" href="/articles/">すべての記事</a>
  </div>
  <div class="container article-list">
    ${latest.map(renderArticleRow).join("")}
  </div>
</section>

<section class="section">
  <div class="container section-heading">
    <p class="eyebrow">Categories</p>
    <h2>カテゴリから読む</h2>
  </div>
  <div class="container category-grid">
    ${categories.map(renderCategoryCard).join("")}
  </div>
</section>`
  });
}

function renderArticlesIndex() {
  return renderBase({
    title: "記事一覧",
    description: "暗号資産の少額運用、SBI VCトレード、税務メモ、Web3基礎に関する記事一覧です。",
    pathname: "/articles/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Articles</p>
    <h1>記事一覧</h1>
    <p class="lead">暗号資産を少額で学ぶ過程を、運用ログ・初心者メモ・税務メモとして残しています。</p>
  </div>
</section>
<section class="section">
  <div class="container article-list">
    ${posts.map(renderArticleRow).join("")}
  </div>
</section>`
  });
}

function renderLogsPage() {
  const logPosts = posts.filter((post) => post.category === "operation-log");

  return renderBase({
    title: "運用ログ",
    description: "年間10万円以内の暗号資産運用について、購入・保有・学び・反省を記録するページです。",
    pathname: "/logs/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Operation logs</p>
    <h1>運用ログ</h1>
    <p class="lead">購入額や損益を見せるためだけではなく、買った理由、買わなかった理由、税務記録、次に確認することを残す場所です。</p>
  </div>
</section>

<section class="section">
  <div class="container log-overview">
    <article class="callout">
      <h2>月次ログで残すこと</h2>
      <ul class="check-list">
        <li>その月に購入した銘柄と金額</li>
        <li>購入しなかった理由や相場の見方</li>
        <li>税務記録として残した情報</li>
        <li>学んだ用語、仕組み、失敗メモ</li>
        <li>翌月に確認したいこと</li>
      </ul>
    </article>
    <article class="callout muted-callout">
      <h2>初期MVPの方針</h2>
      <p>価格の自動取得や損益計算はまだ行いません。まずは記事として月次ログを積み上げ、必要になった段階でグラフや専用データ構造を追加します。</p>
    </article>
  </div>
</section>

<section class="section muted">
  <div class="container section-heading split">
    <div>
      <p class="eyebrow">Logs</p>
      <h2>最新の運用ログ</h2>
    </div>
    <a class="text-link" href="/categories/operation-log/">カテゴリで見る</a>
  </div>
  <div class="container article-list">
    ${logPosts.length ? logPosts.map(renderArticleRow).join("") : `<p class="empty">運用ログはまだありません。</p>`}
  </div>
</section>`
  });
}

function renderSearchPage() {
  return renderBase({
    title: "サイト内検索",
    description: "暗号資産の少額運用、SBI VCトレード、税務メモ、Web3基礎の記事を検索できます。",
    pathname: "/search/",
    bodyClass: "search-page",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Search</p>
    <h1>サイト内検索</h1>
    <p class="lead">記事タイトル、概要、カテゴリ、タグから検索できます。価格自動取得や外部検索サービスは使っていません。</p>
  </div>
</section>

<section class="section">
  <div class="container narrow">
    <form class="search-form" action="/search/" method="get" role="search">
      <label for="site-search">キーワード</label>
      <div class="search-control">
        <input id="site-search" name="q" type="search" placeholder="例: 税務、SBI、スプレッド" autocomplete="off">
        <button class="button primary" type="submit">検索</button>
      </div>
    </form>
    <p id="search-status" class="search-status" aria-live="polite">キーワードを入力すると、記事候補が表示されます。</p>
    <div id="search-results" class="article-list search-results"></div>
    <noscript>
      <p class="empty">検索機能を使うにはJavaScriptを有効にしてください。記事一覧は <a href="/articles/">記事一覧ページ</a> から確認できます。</p>
    </noscript>
  </div>
</section>
<script src="/assets/search.js" defer></script>`
  });
}

function renderCoinsIndex() {
  return renderBase({
    title: "銘柄メモ",
    description: "年間10万円以内の運用方針で観察するBTC、XRP、ETH、SOL、ADA、SUIの役割と関連記事です。",
    pathname: "/coins/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Coin notes</p>
    <h1>銘柄メモ</h1>
    <p class="lead">価格予想ではなく、年間10万円以内の学習枠として各銘柄の役割を整理します。</p>
  </div>
</section>
<section class="section">
  <div class="container coin-card-grid">
    ${coins.map(renderCoinCard).join("")}
  </div>
</section>`
  });
}

function renderCoinPage(coin) {
  const related = posts.filter((post) => (post.relatedCoinSymbols || []).includes(coin.symbol));

  return renderBase({
    title: `${coin.symbol} ${coin.japaneseName}`,
    description: `${coin.symbol}の学習メモ。${coin.role}として、年間${yenFormatter.format(coin.annualBudget)}を目安に観察します。`,
    pathname: `/coins/${coin.symbol.toLowerCase()}/`,
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Coin note</p>
    <h1>${escapeHtml(coin.symbol)} <span>${escapeHtml(coin.japaneseName)}</span></h1>
    <p class="lead">${escapeHtml(coin.description)}</p>
  </div>
</section>

<section class="section">
  <div class="container coin-detail-grid">
    <article class="coin-profile">
      <div class="coin-profile-header">
        <span class="coin-large-symbol">${escapeHtml(coin.symbol)}</span>
        <div>
          <h2>${escapeHtml(coin.name)}</h2>
          <p>${escapeHtml(coin.role)}</p>
        </div>
      </div>
      <dl class="fact-list">
        <div><dt>年間予定額</dt><dd>${yenFormatter.format(coin.annualBudget)}</dd></div>
        <div><dt>配分</dt><dd>${coin.allocationRate}%</dd></div>
        <div><dt>リスク</dt><dd>${escapeHtml(coin.riskLevel)}</dd></div>
        <div><dt>ガス代感</dt><dd>${escapeHtml(coin.gasFeeLevel)}</dd></div>
        <div><dt>ステーキング観察</dt><dd>${coin.isStakingTarget ? "対象" : "対象外"}</dd></div>
      </dl>
    </article>
    <article class="callout">
      <h2>メモ</h2>
      <p>${escapeHtml(coin.memo)}</p>
      <p class="fine-print">このページは学習用メモであり、購入を推奨するものではありません。価格自動取得やリアルタイム評価額は初期MVPでは扱いません。</p>
    </article>
  </div>
</section>

<section class="section muted">
  <div class="container section-heading split">
    <div>
      <p class="eyebrow">Related</p>
      <h2>${escapeHtml(coin.symbol)} 関連記事</h2>
    </div>
    <a class="text-link" href="/coins/">銘柄一覧へ</a>
  </div>
  <div class="container article-list">
    ${related.length ? related.map(renderArticleRow).join("") : `<p class="empty">関連記事はまだありません。</p>`}
  </div>
</section>`
  });
}

function renderArticle(post) {
  const category = getCategory(post.category);
  const related = findRelatedPosts(post);
  const currentIndex = posts.findIndex((item) => item.slug === post.slug);
  const newer = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const older = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  return renderBase({
    title: post.title,
    description: post.description,
    pathname: `/articles/${post.slug}/`,
    bodyClass: "article-page",
    children: `<article class="article-shell">
  <header class="article-header container narrow">
    <a class="category-pill" href="/categories/${category.slug}/">${escapeHtml(category.name)}</a>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="lead">${escapeHtml(post.description)}</p>
    <div class="meta-line">
      <time datetime="${escapeAttribute(post.publishedAt)}">投稿日 ${formatDate(post.publishedAt)}</time>
      <span>更新日 ${formatDate(post.updatedAt || post.publishedAt)}</span>
    </div>
    ${renderTags(post.tags)}
  </header>
  <div class="container narrow prose">
    ${markdownToHtml(post.body)}
    ${renderOfficialLinksBox(post)}
    ${renderDisclaimerBox()}
  </div>
</article>
<section class="section">
  <div class="container narrow adjacent-nav">
    ${newer ? `<a href="/articles/${newer.slug}/">新しい記事: ${escapeHtml(newer.title)}</a>` : "<span></span>"}
    ${older ? `<a href="/articles/${older.slug}/">前の記事: ${escapeHtml(older.title)}</a>` : "<span></span>"}
  </div>
</section>
${related.length ? `<section class="section muted">
  <div class="container section-heading">
    <p class="eyebrow">Related</p>
    <h2>関連記事</h2>
  </div>
  <div class="container card-grid three">
    ${related.map(renderArticleCard).join("")}
  </div>
</section>` : ""}`
  });
}

function renderCategoriesIndex() {
  return renderBase({
    title: "カテゴリ",
    description: "運用ログ、初心者メモ、SBI VCトレード、税務メモ、Web3基礎のカテゴリ一覧です。",
    pathname: "/categories/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Categories</p>
    <h1>カテゴリ</h1>
    <p class="lead">最初は分類を増やしすぎず、学習ログとして続けやすい5カテゴリに絞っています。</p>
  </div>
</section>
<section class="section">
  <div class="container category-grid">
    ${categories.map(renderCategoryCard).join("")}
  </div>
</section>`
  });
}

function renderCategoryPage(category) {
  const categoryPosts = posts.filter((post) => post.category === category.slug);

  return renderBase({
    title: category.name,
    description: category.description,
    pathname: `/categories/${category.slug}/`,
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Category</p>
    <h1>${escapeHtml(category.name)}</h1>
    <p class="lead">${escapeHtml(category.description)}</p>
  </div>
</section>
<section class="section">
  <div class="container article-list">
    ${categoryPosts.length ? categoryPosts.map(renderArticleRow).join("") : `<p class="empty">このカテゴリの記事はまだありません。</p>`}
  </div>
</section>`
  });
}

function renderPolicyPage() {
  return renderBase({
    title: "運用方針",
    description: "年間10万円以内、現物のみ、SBI VCトレードを使う初年度の暗号資産運用方針です。",
    pathname: "/policy/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Portfolio policy</p>
    <h1>運用方針</h1>
    <p class="lead">${escapeHtml(policy.strategySummary)}</p>
  </div>
</section>

<section class="section">
  <div class="container policy-grid">
    <div class="policy-summary">
      <h2>基本ルール</h2>
      <dl class="fact-list">
        <div><dt>年間投資額</dt><dd>${yenFormatter.format(policy.annualBudget)}</dd></div>
        <div><dt>使用取引所</dt><dd>${escapeHtml(policy.exchangeName)}</dd></div>
        <div><dt>購入頻度</dt><dd>${escapeHtml(policy.buyFrequency)}</dd></div>
        <div><dt>レバレッジ</dt><dd>${escapeHtml(policy.leveragePolicy)}</dd></div>
      </dl>
    </div>
    ${renderAllocationPanel("large")}
  </div>
</section>

<section class="section muted">
  <div class="container">
    <div class="section-heading">
      <p class="eyebrow">Allocation</p>
      <h2>購入予定銘柄</h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>銘柄</th><th>年間予定額</th><th>比率</th><th>役割</th></tr>
        </thead>
        <tbody>
          ${coins.map((coin) => `<tr>
            <td><a class="table-symbol-link" href="/coins/${coin.symbol.toLowerCase()}/"><strong>${escapeHtml(coin.symbol)}</strong><span>${escapeHtml(coin.japaneseName)}</span></a></td>
            <td>${yenFormatter.format(coin.annualBudget)}</td>
            <td>${coin.allocationRate}%</td>
            <td>${escapeHtml(coin.role)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section">
  <div class="container rule-grid">
    ${renderRuleBlock("購入ルール", policy.buyRules)}
    ${renderSellRules()}
    ${renderRuleBlock("初年度にやらないこと", policy.doNotDoList)}
  </div>
</section>

<section class="section muted">
  <div class="container narrow callout">
    <h2>税務記録の方針</h2>
    <p>${escapeHtml(policy.taxPolicy)}</p>
  </div>
</section>`
  });
}

function renderContentPage(slug) {
  const page = pages.get(slug);
  if (!page) {
    throw new Error(`Missing page: ${slug}`);
  }

  return renderBase({
    title: page.title,
    description: page.description,
    pathname: `/${slug}/`,
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Guide</p>
    <h1>${escapeHtml(page.title)}</h1>
    <p class="lead">${escapeHtml(page.description)}</p>
  </div>
</section>
<section class="section">
  <div class="container narrow prose">
    ${markdownToHtml(page.body)}
  </div>
</section>`
  });
}

function renderResourcesPage() {
  const groups = [...new Set(officialLinks.map((link) => link.group))];

  return renderBase({
    title: "公式情報リンク",
    description: "暗号資産、税務、広告・PR、SEOに関して確認したい公式情報リンク集です。",
    pathname: "/resources/",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">Resources</p>
    <h1>公式情報リンク</h1>
    <p class="lead">暗号資産や税務、広告表示、SEOについて、記事を書く前に確認したい公式情報をまとめています。</p>
  </div>
</section>
<section class="section">
  <div class="container resource-groups">
    ${groups.map((group) => renderResourceGroup(group, officialLinks.filter((link) => link.group === group))).join("")}
  </div>
</section>`
  });
}

function renderNotFoundPage() {
  return renderBase({
    title: "ページが見つかりません",
    description: "お探しのページは見つかりませんでした。",
    pathname: "/404.html",
    children: `<section class="page-hero">
  <div class="container narrow">
    <p class="eyebrow">404</p>
    <h1>ページが見つかりません</h1>
    <p class="lead">URLが変更されたか、記事がまだ公開されていない可能性があります。</p>
    <a class="button primary" href="/">トップページへ戻る</a>
  </div>
</section>`
  });
}

function renderOfficialLinksBox(post) {
  const links = getOfficialLinksForPost(post);
  if (!links.length) return "";

  return `<aside class="resource-box">
  <h2>確認したい公式情報</h2>
  <ul>
    ${links.map((link) => `<li>
      <a href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>
      <p>${escapeHtml(link.description)}</p>
    </li>`).join("")}
  </ul>
</aside>`;
}

function getOfficialLinksForPost(post) {
  const tags = new Set(post.tags || []);
  return officialLinks.filter((link) => {
    const categoryMatch = (link.categories || []).includes(post.category);
    const tagMatch = (link.tags || []).some((tag) => tags.has(tag));
    return categoryMatch || tagMatch;
  });
}

function renderResourceGroup(group, links) {
  return `<section class="resource-group">
  <h2>${escapeHtml(group)}</h2>
  <div class="resource-list">
    ${links.map((link) => `<article class="resource-card">
      <h3><a href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a></h3>
      <p>${escapeHtml(link.description)}</p>
    </article>`).join("")}
  </div>
</section>`;
}

function renderAllocationPanel(size = "") {
  const className = ["allocation-panel", size].filter(Boolean).join(" ");

  return `<aside class="${className}" aria-label="年間10万円の銘柄配分">
  <div class="panel-header">
    <p>年間予定額</p>
    <strong>${yenFormatter.format(policy.annualBudget)}</strong>
  </div>
  <div class="allocation-stack">
    ${coins.map((coin) => `<span style="--ratio:${coin.allocationRate};" title="${escapeAttribute(`${coin.symbol} ${coin.allocationRate}%`)}"></span>`).join("")}
  </div>
  <ul class="coin-list">
    ${coins.map((coin) => `<li>
      <span class="coin-symbol">${escapeHtml(coin.symbol)}</span>
      <span>${escapeHtml(coin.role)}</span>
      <strong>${coin.allocationRate}%</strong>
    </li>`).join("")}
  </ul>
</aside>`;
}

function renderArticleCard(post) {
  const category = getCategory(post.category);
  return `<article class="article-card">
  <div class="article-card-meta">
    <a href="/categories/${category.slug}/">${escapeHtml(category.name)}</a>
    <time datetime="${escapeAttribute(post.publishedAt)}">${formatDate(post.publishedAt)}</time>
  </div>
  <h3><a href="/articles/${post.slug}/">${escapeHtml(post.title)}</a></h3>
  <p>${escapeHtml(post.description)}</p>
</article>`;
}

function renderArticleRow(post) {
  const category = getCategory(post.category);
  return `<article class="article-row">
  <div>
    <div class="article-card-meta">
      <a href="/categories/${category.slug}/">${escapeHtml(category.name)}</a>
      <time datetime="${escapeAttribute(post.publishedAt)}">${formatDate(post.publishedAt)}</time>
    </div>
    <h2><a href="/articles/${post.slug}/">${escapeHtml(post.title)}</a></h2>
    <p>${escapeHtml(post.description)}</p>
    ${renderTags(post.tags)}
  </div>
  <a class="row-arrow" href="/articles/${post.slug}/" aria-label="${escapeAttribute(`${post.title}を読む`)}">読む</a>
</article>`;
}

function renderCategoryCard(category) {
  const count = posts.filter((post) => post.category === category.slug).length;
  return `<a class="category-card" href="/categories/${category.slug}/">
  <span>${count}記事</span>
  <h3>${escapeHtml(category.name)}</h3>
  <p>${escapeHtml(category.description)}</p>
</a>`;
}

function renderCoinCard(coin) {
  const relatedCount = posts.filter((post) => (post.relatedCoinSymbols || []).includes(coin.symbol)).length;
  return `<a class="coin-card" href="/coins/${coin.symbol.toLowerCase()}/">
  <span class="coin-symbol">${escapeHtml(coin.symbol)}</span>
  <div>
    <h3>${escapeHtml(coin.japaneseName)}</h3>
    <p>${escapeHtml(coin.role)}</p>
  </div>
  <dl>
    <div><dt>年間予定額</dt><dd>${yenFormatter.format(coin.annualBudget)}</dd></div>
    <div><dt>配分</dt><dd>${coin.allocationRate}%</dd></div>
    <div><dt>関連記事</dt><dd>${relatedCount}件</dd></div>
  </dl>
</a>`;
}

function renderTags(tags = []) {
  if (!tags.length) return "";
  return `<ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
}

function renderDisclaimerBox() {
  return `<aside class="disclaimer-box">
  <h2>免責</h2>
  <p>${escapeHtml(site.disclaimerShort)} 税務上の取扱いについては、国税庁の情報や税理士等の専門家に確認してください。</p>
</aside>`;
}

function renderRuleBlock(title, items) {
  return `<section class="rule-block">
  <h2>${escapeHtml(title)}</h2>
  <ul>
    ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
  </ul>
</section>`;
}

function renderSellRules() {
  return `<section class="rule-block">
  <h2>売却ルール</h2>
  <dl class="sell-rules">
    ${policy.sellRules.map((rule) => `<div><dt>${escapeHtml(rule.threshold)}</dt><dd>${escapeHtml(rule.action)}</dd></div>`).join("")}
  </dl>
</section>`;
}

function findRelatedPosts(post) {
  const tagSet = new Set(post.tags || []);
  const coinSet = new Set(post.relatedCoinSymbols || []);

  return posts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => {
      let score = 0;
      if (candidate.category === post.category) score += 3;
      for (const tag of candidate.tags || []) {
        if (tagSet.has(tag)) score += 2;
      }
      for (const symbol of candidate.relatedCoinSymbols || []) {
        if (coinSet.has(symbol)) score += 1;
      }
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.candidate.publishedAt) - new Date(a.candidate.publishedAt))
    .slice(0, 3)
    .map((item) => item.candidate);
}

function getCategory(slug) {
  return categories.find((category) => category.slug === slug) || {
    name: "未分類",
    slug: "uncategorized",
    description: ""
  };
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let inTable = false;
  let codeLines = [];
  let codeLang = "";

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const closeBlocks = () => {
    closeLists();
    if (inTable) {
      html.push("</tbody></table></div>");
      inTable = false;
    }
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : ""}>${codeLines.join("\n")}</code></pre>`);
        inCode = false;
        codeLines = [];
        codeLang = "";
      } else {
        closeBlocks();
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(escapeHtml(line));
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeBlocks();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    if (isTableHeader(trimmed, lines[lineIndex + 1])) {
      closeBlocks();
      const headers = parseTableRow(trimmed);
      html.push("<div class=\"table-wrap markdown-table\"><table><thead><tr>");
      html.push(headers.map((cell) => `<th>${formatInline(cell)}</th>`).join(""));
      html.push("</tr></thead><tbody>");
      inTable = true;
      continue;
    }

    if (inTable) {
      if (isTableSeparator(trimmed)) {
        continue;
      }
      if (trimmed.includes("|")) {
        const cells = parseTableRow(trimmed);
        html.push(`<tr>${cells.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`);
        continue;
      }
      closeBlocks();
    }

    const unordered = trimmed.match(/^-\s+(.+)$/);
    if (unordered) {
      if (inTable) {
        closeBlocks();
      }
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${formatInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (inTable) {
        closeBlocks();
      }
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      closeBlocks();
      html.push(`<blockquote><p>${formatInline(quote[1])}</p></blockquote>`);
      continue;
    }

    closeBlocks();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeBlocks();
  if (inCode) {
    html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  }

  return html.join("\n");
}

function isTableHeader(trimmed, nextLine) {
  if (!trimmed.includes("|") || isTableSeparator(trimmed)) return false;
  const next = nextLine?.trim();
  return Boolean(next && isTableSeparator(next));
}

function isTableSeparator(line) {
  if (!line.includes("|")) return false;
  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function formatInline(text) {
  let output = escapeHtml(text);
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safe = href.startsWith("javascript:") ? "#" : href;
    return `<a href="${escapeAttribute(safe)}">${label}</a>`;
  });
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return output;
}

function formatDate(dateString) {
  return dateFormatter.format(new Date(dateString));
}

function absoluteUrl(pathname) {
  if (!siteUrl) return "";
  return `${siteUrl}${pathname}`;
}

function sitePath(pathname) {
  if (!siteBasePath) return pathname;
  if (pathname === "/") return `${siteBasePath}/`;
  return `${siteBasePath}${pathname}`;
}

function applyBasePathToHtml(html) {
  if (!siteBasePath) return html;
  return html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${siteBasePath}/`)
    .replace(/content="\/assets\//g, `content="${siteBasePath}/assets/`);
}

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function renderRobots() {
  return `User-agent: *
Allow: /
${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ""}`;
}

function renderSitemap() {
  const urls = [
    "/",
    "/articles/",
    "/logs/",
    "/coins/",
    "/search/",
    "/categories/",
    "/policy/",
    "/profile/",
    "/disclaimer/",
    "/pr-policy/",
    "/resources/",
    "/privacy/",
    ...posts.map((post) => `/articles/${post.slug}/`),
    ...coins.map((coin) => `/coins/${coin.symbol.toLowerCase()}/`),
    ...categories.map((category) => `/categories/${category.slug}/`)
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(absoluteUrl(url))}</loc></url>`).join("\n")}
</urlset>`;
}

function renderSearchIndex() {
  return posts.map((post) => {
    const category = getCategory(post.category);
    return {
      title: post.title,
      slug: post.slug,
      url: `/articles/${post.slug}/`,
      description: post.description,
      category: category.name,
      categorySlug: category.slug,
      tags: post.tags || [],
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt || post.publishedAt,
      relatedCoinSymbols: post.relatedCoinSymbols || [],
      text: normalizeSearchText([
        post.title,
        post.description,
        category.name,
        ...(post.tags || []),
        ...(post.relatedCoinSymbols || []),
        stripMarkdown(post.body)
      ].join(" "))
    };
  });
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return String(value ?? "").toLocaleLowerCase("ja-JP").normalize("NFKC");
}

function renderFeed() {
  const updated = posts[0]?.updatedAt || posts[0]?.publishedAt || new Date().toISOString();
  const items = posts.slice(0, 20).map((post) => {
    const category = getCategory(post.category);
    return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(absoluteUrl(`/articles/${post.slug}/`))}</link>
  <guid>${escapeXml(absoluteUrl(`/articles/${post.slug}/`))}</guid>
  <description>${escapeXml(post.description)}</description>
  <category>${escapeXml(category.name)}</category>
  <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
</item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(site.name)}</title>
  <link>${escapeXml(siteUrl)}</link>
  <description>${escapeXml(site.description)}</description>
  <language>ja</language>
  <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
