const heroLabelEl = document.getElementById("hero-label");
const basePriceEl = document.getElementById("base-price");
const heroUnitEl = document.getElementById("hero-unit");
const baseChangeEl = document.getElementById("base-change");
const updatedEl = document.getElementById("updated");
const brandListEl = document.getElementById("brand-list");
const refreshBtn = document.getElementById("refresh");
const quotePanel = document.getElementById("quote-panel");
const jewelryPanel = document.getElementById("jewelry-panel");
const relatedEl = document.getElementById("related");

let latestData = null;
const params = new URLSearchParams(location.search);
let activeTab = params.get("tab") || localStorage.getItem("gold-tab") || "domestic";

const TAB_SEO = {
  domestic: {
    title: "今日金价查询 - 国内黄金现货价格 | Kinolin",
    description:
      "查询今日国内黄金现货价格（人民币/克），并对照国际伦敦金与品牌金饰挂牌价。",
  },
  international: {
    title: "国际金价查询 - 伦敦金 XAU/USD | Kinolin",
    description: "查询国际伦敦金价格，查看美元/盎司、美元/克以及国内现货克价对照。",
  },
  jewelry: {
    title: "金饰价格查询 - 品牌足金挂牌价 | Kinolin",
    description: "查询周大福、周生生、老凤祥等品牌足金饰品挂牌价，区别于国内现货金价。",
  },
};

function applySeo(tab) {
  const seo = TAB_SEO[tab] || TAB_SEO.domestic;
  const pageUrl = `${location.origin}/?tab=${tab}`;
  document.title = seo.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", seo.description);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", seo.title);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", seo.description);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", pageUrl);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = pageUrl;
  document.querySelectorAll(".tab").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function formatSigned(value, digits = 0) {
  const num = Number(value) || 0;
  const abs = digits ? Math.abs(num).toFixed(digits) : String(Math.abs(num));
  if (num > 0) return `+${abs}`;
  if (num < 0) return `-${abs}`;
  return digits ? (0).toFixed(digits) : "0";
}

function trendClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function formatTime(iso) {
  if (!iso) return "刚刚更新";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "刚刚更新";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} | ${pad(date.getHours())}:${pad(date.getMinutes())} 北京时间`;
}

function formatNum(value, digits = 2) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function getDomestic(data) {
  const quote = data.domestic || {};
  return {
    price: quote.price ?? data.base_gold_price,
    change: quote.change ?? data.change,
    change_percent: quote.change_percent ?? data.change_percent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    prev_close: quote.prev_close,
    datetime: quote.datetime || (data.spot && data.spot.datetime),
    name: quote.name || "黄金现货",
  };
}

function getInternational(data) {
  const quote = data.international || {};
  const spot = data.spot || {};
  const price = quote.price ?? spot.xau_usd_per_oz;
  const change = quote.change ?? spot.usd_change;
  const changePercent = quote.change_percent ?? spot.change_percent;
  return {
    price,
    gram_price: quote.gram_price ?? spot.xau_usd_per_gram,
    change,
    change_percent: changePercent,
    open: quote.open ?? spot.usd_open,
    high: quote.high ?? spot.usd_high,
    low: quote.low ?? spot.usd_low,
    prev_close: quote.prev_close ?? spot.usd_prev_close,
    datetime: quote.datetime || spot.datetime,
    name: quote.name || "伦敦金",
  };
}

function hasNumber(value) {
  return value != null && value !== "" && !Number.isNaN(Number(value));
}

function setQuoteGrid(quote, digits = 2) {
  const grid = document.getElementById("quote-grid");
  const stats = quote && [quote.open, quote.high, quote.prev_close, quote.low];
  const hasStats = Boolean(stats && stats.every(hasNumber));
  grid.classList.toggle("hidden", !hasStats);
  if (!hasStats) return;
  document.getElementById("q-open").textContent = formatNum(quote.open, digits);
  document.getElementById("q-high").textContent = formatNum(quote.high, digits);
  document.getElementById("q-prev").textContent = formatNum(quote.prev_close, digits);
  document.getElementById("q-low").textContent = formatNum(quote.low, digits);
}

function renderHero(label, price, unit, change, changePercent, meta, priceDigits = 2) {
  heroLabelEl.textContent = label;
  basePriceEl.textContent = formatNum(price, priceDigits);
  heroUnitEl.textContent = unit;
  const percentText =
    changePercent == null ? "" : `  ${formatSigned(changePercent, 2)}%`;
  baseChangeEl.textContent = `${formatSigned(change, 2)}${percentText}`;
  baseChangeEl.className = `hero-change ${trendClass(change)}`;
  updatedEl.textContent = meta;
}

function renderRelated(items) {
  const visible = items.filter((item) => item.price && item.price !== "--");
  relatedEl.innerHTML = visible
    .map(
      (item) => `
      <div class="related-row">
        <div>
          <div class="related-name">${item.name}</div>
          <div class="related-sub">${item.sub}</div>
        </div>
        <div class="related-price ${trendClass(item.changePercent)}">${item.price}</div>
      </div>
    `
    )
    .join("");
}

function updateQuotePanel() {
  const gridHidden = document.getElementById("quote-grid").classList.contains("hidden");
  const relatedEmpty = !relatedEl.innerHTML.trim();
  quotePanel.classList.toggle("hidden", gridHidden && relatedEmpty);
}

function renderBrands(data) {
  brandListEl.innerHTML = (data.brand_prices || [])
    .map((item) => {
      const delta = Number(item.change) || 0;
      return `
        <article class="brand-row">
          <div class="avatar">${item.brand.slice(0, 1)}</div>
          <div class="brand-info">
            <div class="brand-name">${item.brand}</div>
            <div class="brand-type">${item.type}</div>
          </div>
          <div class="brand-quote">
            <div class="brand-price">${item.display_price}<small>元/克</small></div>
            <div class="brand-change ${trendClass(delta)}">${formatSigned(delta)}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

function render() {
  applySeo(activeTab);
  if (!latestData) return;

  const isJewelry = activeTab === "jewelry";
  jewelryPanel.classList.toggle("hidden", !isJewelry);
  if (isJewelry) quotePanel.classList.add("hidden");

  if (activeTab === "domestic") {
    const quote = getDomestic(latestData);
    const intl = getInternational(latestData);
    renderHero(
      "国内金价 (人民币/克)",
      quote.price,
      "元/克",
      quote.change,
      quote.change_percent,
      `${formatTime(quote.datetime)} · ${quote.name}`
    );
    setQuoteGrid(quote, 2);
    renderRelated([
      {
        name: "国际金 XAU/USD",
        sub: "美元/盎司",
        price: formatNum(intl.price, 2),
        changePercent: intl.change_percent,
      },
      {
        name: "国际金克价",
        sub: "美元/克",
        price: formatNum(intl.gram_price, 4),
        changePercent: intl.change_percent,
      },
    ]);
    updateQuotePanel();
    return;
  }

  if (activeTab === "international") {
    const quote = getInternational(latestData);
    renderHero(
      "国际金价 (美元/盎司)",
      quote.price,
      "美元/盎司",
      quote.change,
      quote.change_percent,
      `${formatTime(quote.datetime)} · ${quote.name}`,
      2
    );
    setQuoteGrid(quote, 2);
    renderRelated([
      {
        name: "国际金克价",
        sub: "美元/克",
        price: formatNum(quote.gram_price, 4),
        changePercent: quote.change_percent,
      },
      {
        name: "国内金现货",
        sub: "人民币/克",
        price: formatNum(latestData.base_gold_price, 2),
        changePercent: latestData.change_percent,
      },
    ]);
    updateQuotePanel();
    return;
  }

  const brands = latestData.brand_prices || [];
  const featured = brands[0] || {};
  renderHero(
    "国内金饰价 (人民币/克)",
    featured.display_price,
    "元/克",
    featured.change,
    null,
    `${featured.brand || "品牌饰品"} · 足金挂牌价`,
    0
  );
  renderBrands(latestData);
}

function setTab(tab) {
  activeTab = tab;
  localStorage.setItem("gold-tab", tab);
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  history.replaceState(null, "", url);
  render();
}

async function loadGold(manual = false) {
  refreshBtn.classList.add("spin");
  if (manual) updatedEl.textContent = "正在刷新…";
  try {
    const response = await fetch(`/api/gold?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("接口失败");
    latestData = await response.json();
    render();
  } catch (error) {
    updatedEl.textContent = "行情获取失败，请稍后重试";
  } finally {
    refreshBtn.classList.remove("spin");
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
});

refreshBtn.addEventListener("click", () => loadGold(true));
applySeo(activeTab);
loadGold();
setInterval(loadGold, 60 * 1000);
