import { Buffer } from "node:buffer";
import iconv from "iconv-lite";

const JEWELRY_FEED_URL = "https://www.5huangjin.com/999/";
const JEWELRY_QUOTE_URL = "http://www.huangjinjiage.cn/quote/118108.html";
const JEWELRY_HOME_URL = "http://www.huangjinjiage.cn/";
const USER_AGENT = { "User-Agent": "Mozilla/5.0" };

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

function decodeHtml(bytes) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/周大福|饰品金价|黄金价格|老凤祥/.test(utf8)) return utf8;
  return iconv.decode(Buffer.from(bytes), "gbk");
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: USER_AGENT,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return decodeHtml(new Uint8Array(await response.arrayBuffer()));
}

async function fetchJewelryFromFeed() {
  const prices = {};
  for (const cells of tableRows(await fetchHtml(JEWELRY_FEED_URL))) {
    if (cells.length < 4) continue;
    const [, rawBrand, product, priceText] = cells;
    const brand = canonicalBrand(rawBrand);
    if (!brand || !String(product).includes("饰品金价") || isJunkProduct(product)) continue;
    const price = parsePriceNumber(priceText);
    if (price == null || price < 1100) continue;
    prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

async function fetchJewelryFromQuote() {
  const prices = {};
  for (const cells of tableRows(await fetchHtml(JEWELRY_QUOTE_URL))) {
    if (cells.length < 3) continue;
    const brand = canonicalBrand(cells[0]);
    if (!brand || cells[1] !== "黄金价格") continue;
    const price = parsePriceNumber(cells[2]);
    if (price == null || price < 1100) continue;
    prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

async function fetchJewelryFromHome() {
  const prices = {};
  for (const cells of tableRows(await fetchHtml(JEWELRY_HOME_URL))) {
    if (cells.length < 2) continue;
    if (String(cells[cells.length - 1] || "").includes("港币")) continue;
    const brand = canonicalBrand(cells[0]);
    if (!brand) continue;
    const price = parsePriceNumber(cells[1]);
    if (price == null || price < 1100) continue;
    if (prices[brand] == null) prices[brand] = toDisplayNumber(price);
  }
  return prices;
}

export async function fetchJewelryPrices() {
  const merged = {};
  const results = await Promise.allSettled([
    fetchJewelryFromFeed(),
    fetchJewelryFromQuote(),
    fetchJewelryFromHome(),
  ]);
  for (const result of results) {
    if (result.status !== "fulfilled") {
      console.warn("饰品金价部分源失败:", result.reason?.message || result.reason);
      continue;
    }
    for (const [brand, price] of Object.entries(result.value)) {
      if (merged[brand] == null) merged[brand] = price;
    }
  }
  return merged;
}
