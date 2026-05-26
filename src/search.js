(function () {
  const form = document.querySelector(".search-form");
  const input = document.querySelector("#site-search");
  const status = document.querySelector("#search-status");
  const results = document.querySelector("#search-results");
  const basePath = document.documentElement.dataset.basePath || "";

  if (!form || !input || !status || !results) return;

  let index = [];

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get("q") || "";
  input.value = initialQuery;

  fetch(withBase("/search-index.json"))
    .then((response) => {
      if (!response.ok) throw new Error("Search index request failed");
      return response.json();
    })
    .then((items) => {
      index = Array.isArray(items) ? items : [];
      renderSearch(input.value);
    })
    .catch(() => {
      status.textContent = "検索データを読み込めませんでした。記事一覧から確認してください。";
    });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    const url = query ? `${withBase("/search/")}?q=${encodeURIComponent(query)}` : withBase("/search/");
    window.history.replaceState(null, "", url);
    renderSearch(query);
  });

  input.addEventListener("input", () => {
    renderSearch(input.value);
  });

  function renderSearch(query) {
    const normalizedQuery = normalize(query);
    clearResults();

    if (!normalizedQuery) {
      status.textContent = "キーワードを入力すると、記事候補が表示されます。";
      return;
    }

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matches = index
      .map((item) => ({ item, score: scoreItem(item, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.item.publishedAt) - new Date(a.item.publishedAt))
      .slice(0, 20);

    status.textContent = matches.length
      ? `${matches.length}件の記事が見つかりました。`
      : "該当する記事は見つかりませんでした。別のキーワードで試してください。";

    const fragment = document.createDocumentFragment();
    for (const { item } of matches) {
      fragment.appendChild(renderResult(item));
    }
    results.appendChild(fragment);
  }

  function scoreItem(item, tokens) {
    let score = 0;
    for (const token of tokens) {
      if (!item.text.includes(token)) return 0;
      if (normalize(item.title).includes(token)) score += 8;
      if (normalize(item.description).includes(token)) score += 5;
      if (normalize(item.category).includes(token)) score += 4;
      if ((item.tags || []).some((tag) => normalize(tag).includes(token))) score += 3;
      if ((item.relatedCoinSymbols || []).some((symbol) => normalize(symbol).includes(token))) score += 3;
      score += 1;
    }
    return score;
  }

  function renderResult(item) {
    const article = document.createElement("article");
    article.className = "article-row";

    const body = document.createElement("div");

    const meta = document.createElement("div");
    meta.className = "article-card-meta";

    const category = document.createElement("a");
    category.href = withBase(`/categories/${item.categorySlug}/`);
    category.textContent = item.category;

    const time = document.createElement("time");
    time.dateTime = item.publishedAt;
    time.textContent = formatDate(item.publishedAt);

    meta.append(category, time);

    const heading = document.createElement("h2");
    const title = document.createElement("a");
    title.href = withBase(item.url);
    title.textContent = item.title;
    heading.appendChild(title);

    const description = document.createElement("p");
    description.textContent = item.description;

    body.append(meta, heading, description, renderTags(item.tags || []));

    const link = document.createElement("a");
    link.className = "row-arrow";
    link.href = withBase(item.url);
    link.setAttribute("aria-label", `${item.title}を読む`);
    link.textContent = "読む";

    article.append(body, link);
    return article;
  }

  function renderTags(tags) {
    const list = document.createElement("ul");
    list.className = "tag-list";
    for (const tag of tags) {
      const item = document.createElement("li");
      item.textContent = tag;
      list.appendChild(item);
    }
    return list;
  }

  function clearResults() {
    while (results.firstChild) {
      results.removeChild(results.firstChild);
    }
  }

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("ja-JP").normalize("NFKC").trim();
  }

  function withBase(pathname) {
    if (!basePath) return pathname;
    if (pathname === "/") return `${basePath}/`;
    return `${basePath}${pathname}`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date(value));
  }
})();
