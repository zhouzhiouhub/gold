const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const GOLDAPI_USD_URL = "https://www.goldapi.io/api/price/XAU/USD";
const GOLDAPI_CNY_URL = "https://www.goldapi.io/api/price/XAU/CNY";
const JEWELRY_FEED_URL = "https://www.5huangjin.com/999/";
const JEWELRY_QUOTE_URL = "http://www.huangjinjiage.cn/quote/118108.html";
const JEWELRY_HOME_URL = "http://www.huangjinjiage.cn/";
const TROY_OUNCE_GRAMS = 31.1034768;
const LAST_PRICES_PATH = path.join(__dirname, "..", "data", "last-prices.json");

function loadDotEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // no local .env file
  }
}

loadDotEnv();

function goldApiToken() {
  const token = process.env.GOLDAPI_TOKEN;
  if (!token) throw new Error("未配置 GOLDAPI_TOKEN");
  return token;
}

const BRAND_ALIASES = {
  周大福: ["周大福", "内地周大福"],
  周生生: ["周生生", "内地周生生"],
  老凤祥: ["老凤祥", "内地老凤祥"],
  六福珠宝: ["六福珠宝", "六福", "内地六福珠宝"],
  菜百首饰: ["菜百首饰", "菜百"],
  中国黄金: ["中国黄金"],
  周六福: ["周六福", "周六福珠宝"],
  金至尊: ["金至尊", "内地金至尊"],
  周大生: ["周大生", "内地周大生"],
};

const BRAND_TEMPLATES = [
  { brand: "周大福", type: "足金", offset: 11.01 },
  { brand: "周生生", type: "足金", offset: 8.01 },
  { brand: "老凤祥", type: "足金", offset: 8.01 },
  { brand: "六福珠宝", type: "足金", offset: 11.01 },
  { brand: "菜百首饰", type: "足金", offset: 5.01 },
  { brand: "中国黄金", type: "足金", offset: 3.01 },
  { brand: "周六福", type: "足金", offset: 11.01 },
  { brand: "金至尊", type: "足金", offset: 9.01 },
  { brand: "周大生", type: "足金", offset: 11.01 },
];

const USER_AGENT = { "User-Agent": "Mozilla/5.0" };

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function parsePriceNumber(text) {
  const match = String(text).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function toDisplayNumber(value) {
  if (value == null || Number.isNaN(value)) return null;
  return value === Math.trunc(value) ? Math.trunc(value) : Number(value.toFixed(2));
}

async function fetchGoldApi(url) {
  const response = await fetch(`${url}?purity=true`, {
    headers: { "x-access-token": goldApiToken() },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`GoldAPI ${response.status}`);
  }
  return response.json();
}

function canonicalBrand(name) {
  const normalized = String(name || "").replace(/^内地/, "").trim();
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    if (brand === normalized || aliases.includes(name) || aliases.includes(normalized)) {
      return brand;
    }
  }
  return null;
}

function tableRows(html) {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  return rows.map((row) =>
    [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]))
  );
}

function isJunkProduct(product) {
  return /铂|回收|换新|换购|金条|投资|回购|香港|港元|港币|银|纸|工艺金/.test(product || "");
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: USER_AGENT,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return iconv.decode(Buffer.from(await response.arrayBuffer()), "gbk");
}

async function fetchJewelryFromFeed() {
  const html = await fetchHtml(JEWELRY_FEED_URL);
  const prices = {};
  for (const cells of tableRows(html)) {
    if (cells.length < 4) continue;
    const [, rawBrand, product, priceText] = cells;
    const brand = canonicalBrand(rawBrand);
    if (!brand || !String(product).includes("饰品金价") || isJunkProduct(product)) continue;
    const price = parsePriceNumber(priceText);
    if (price == null || price < 800) continue;
    prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

async function fetchJewelryFromQuote() {
  const html = await fetchHtml(JEWELRY_QUOTE_URL);
  const prices = {};
  for (const cells of tableRows(html)) {
    if (cells.length < 3) continue;
    const brand = canonicalBrand(cells[0]);
    if (!brand || cells[1] !== "黄金价格") continue;
    const price = parsePriceNumber(cells[2]);
    if (price == null || price < 800) continue;
    prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

async function fetchJewelryFromHome() {
  const html = await fetchHtml(JEWELRY_HOME_URL);
  const prices = {};
  for (const cells of tableRows(html)) {
    if (cells.length < 2) continue;
    if (String(cells[cells.length - 1] || "").includes("港币")) continue;
    const brand = canonicalBrand(cells[0]);
    if (!brand) continue;
    const price = parsePriceNumber(cells[1]);
    if (price == null || price < 800) continue;
    if (prices[brand] == null) prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

async function fetchJewelryPrices() {
  const merged = {};
  const sources = [fetchJewelryFromFeed, fetchJewelryFromQuote, fetchJewelryFromHome];
  for (const loader of sources) {
    try {
      const batch = await loader();
      for (const [brand, price] of Object.entries(batch)) {
        if (merged[brand] == null) merged[brand] = price;
      }
    } catch (error) {
      console.warn("饰品金价部分源失败:", error.message);
    }
  }
  return merged;
}

function todayKey() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readPriceStore() {
  try {
    return JSON.parse(fs.readFileSync(LAST_PRICES_PATH, "utf8"));
  } catch {
    return { date: "", prices: {}, previous: {} };
  }
}

function savePriceStore(store) {
  const dir = path.dirname(LAST_PRICES_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_PRICES_PATH, JSON.stringify(store, null, 2), "utf8");
}

function previousPricesForChange(currentPrices) {
  const today = todayKey();
  const store = readPriceStore();
  const previous = store.date === today ? store.previous || {} : store.prices || {};
  savePriceStore({
    date: today,
    prices: currentPrices,
    previous: store.date === today ? store.previous || {} : store.prices || {},
  });
  return previous;
}

function buildBrandPrices(basePrice, jewelryPrices, previousPrices) {
  return BRAND_TEMPLATES.map((item) => {
    const spotRetail = Math.trunc(basePrice + item.offset);
    const jewelryPrice = jewelryPrices[item.brand] ?? null;
    const displayPrice = jewelryPrice ?? spotRetail;
    const previous = previousPrices[item.brand];
    const change = previous == null ? 0 : toDisplayNumber(displayPrice - previous);

    return {
      brand: item.brand,
      type: item.type,
      price: spotRetail,
      jewelry_price: jewelryPrice,
      display_price: displayPrice,
      change,
      unit: "元/克",
    };
  });
}

async function fetchGoldPrices() {
  let jewelryPrices = {};
  try {
    jewelryPrices = await fetchJewelryPrices();
  } catch (error) {
    console.warn("饰品金价获取失败:", error.message);
  }

  const snapshotPrices = (basePrice) => {
    const preview = BRAND_TEMPLATES.map((item) => ({
      brand: item.brand,
      display_price: jewelryPrices[item.brand] ?? Math.trunc(basePrice + item.offset),
    }));
    const currentMap = Object.fromEntries(
      preview.map((item) => [item.brand, item.display_price])
    );
    return previousPricesForChange(currentMap);
  };

  try {
    const [usdQuote, cnyQuote] = await Promise.all([
      fetchGoldApi(GOLDAPI_USD_URL),
      fetchGoldApi(GOLDAPI_CNY_URL),
    ]);

    const cnyGram = cnyQuote?.price_per_unit?.gram;
    if (!cnyGram) throw new Error("GoldAPI 未返回人民币克价");

    const toGram = (oz) =>
      oz == null ? null : Number((Number(oz) / TROY_OUNCE_GRAMS).toFixed(2));

    const basePrice = Number(Number(cnyGram).toFixed(2));
    const gramChange = Number(((cnyQuote.change || 0) / TROY_OUNCE_GRAMS).toFixed(2));
    const previousPrices = snapshotPrices(basePrice);
    const brandPrices = buildBrandPrices(basePrice, jewelryPrices, previousPrices);

    const usdChange = usdQuote.change ?? usdQuote.ch ?? 0;
    const usdChangePercent = usdQuote.change_percent ?? usdQuote.chp ?? 0;
    const usdPrice = usdQuote.price ?? usdQuote.ask ?? usdQuote.bid;
    const usdGram = usdQuote.price_per_unit?.gram;

    return {
      base_gold_price: basePrice,
      change: gramChange,
      change_percent: cnyQuote.change_percent ?? cnyQuote.chp ?? 0,
      brand_prices: brandPrices,
      domestic: {
        label: "国内金价",
        symbol: "XAU/CNY",
        name: "黄金现货",
        price: basePrice,
        unit: "元/克",
        change: gramChange,
        change_percent: cnyQuote.change_percent ?? cnyQuote.chp ?? 0,
        open: toGram(cnyQuote.open_price),
        high: toGram(cnyQuote.high_price),
        low: toGram(cnyQuote.low_price),
        prev_close: toGram(cnyQuote.prev_close_price),
        datetime: cnyQuote.datetime,
      },
      international: {
        label: "国际金价",
        symbol: "XAU/USD",
        name: "伦敦金",
        price: usdPrice,
        unit: "美元/盎司",
        gram_price: usdGram,
        change: usdChange,
        change_percent: usdChangePercent,
        open: usdQuote.open_price,
        high: usdQuote.high_price,
        low: usdQuote.low_price,
        prev_close: usdQuote.prev_close_price,
        datetime: usdQuote.datetime,
      },
      purity_ratios: cnyQuote.purity || usdQuote.purity || {},
      melt_price_cny_per_gram: cnyQuote.melt_price_per_gram || {},
      spot: {
        xau_usd_per_oz: usdPrice,
        xau_usd_per_gram: usdGram,
        xau_cny_per_gram: Number(Number(cnyGram).toFixed(4)),
        usd_change: usdChange,
        usd_open: usdQuote.open_price,
        usd_high: usdQuote.high_price,
        usd_low: usdQuote.low_price,
        usd_prev_close: usdQuote.prev_close_price,
        datetime: usdQuote.datetime,
        change_percent: usdChangePercent,
        source: "goldapi.io",
      },
    };
  } catch (error) {
    console.warn("GoldAPI 请求失败，使用保底价格:", error.message, error.cause || "");
    return {
      base_gold_price: 612.99,
      change: 0,
      change_percent: 0,
      brand_prices: buildBrandPrices(612.99, jewelryPrices, snapshotPrices(612.99)),
      spot: { source: "fallback" },
    };
  }
}

module.exports = { fetchGoldPrices, fetchJewelryPrices };
