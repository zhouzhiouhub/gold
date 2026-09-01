import { fetchJewelryPrices } from "./jewelry.js";

const GOLDAPI_USD = "https://www.goldapi.io/api/price/XAU/USD";
const GOLDAPI_CNY = "https://www.goldapi.io/api/price/XAU/CNY";
const DEV_USD = "https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT";
const DEV_CNY = "https://api.goldprice.dev/v1/prices?symbol=XAU-CNY-SPOT";
const PUBLIC_USD = "https://api.gold-api.com/price/XAU";
const FX_USD_CNY = "https://open.er-api.com/v6/latest/USD";
const TROY = 31.1034768;
const CACHE_TTL_MS = 60 * 1000;

const BRANDS = [
  { brand: "周大福", offset: 11.01 },
  { brand: "周生生", offset: 8.01 },
  { brand: "老凤祥", offset: 8.01 },
  { brand: "六福珠宝", offset: 11.01 },
  { brand: "菜百首饰", offset: 5.01 },
  { brand: "中国黄金", offset: 3.01 },
  { brand: "周六福", offset: 11.01 },
  { brand: "金至尊", offset: 9.01 },
  { brand: "周大生", offset: 11.01 },
];

let cache = { at: 0, data: null, inflight: null };

function gram(oz) {
  return oz == null ? null : Number((Number(oz) / TROY).toFixed(2));
}

function brandPrices(base, jewelryPrices = {}) {
  return BRANDS.map((item) => {
    const investPrice = Math.trunc(base + item.offset);
    const jewelryPrice = jewelryPrices[item.brand] ?? null;
    return {
      brand: item.brand,
      type: "足金",
      price: investPrice,
      jewelry_price: jewelryPrice,
      display_price: jewelryPrice ?? investPrice,
      change: 0,
      unit: "元/克",
    };
  });
}

function buildPayload({
  cnyGram,
  usdOz,
  usdGram,
  change = 0,
  changePercent = 0,
  usdChange = 0,
  usdChangePercent = 0,
  datetime,
  source,
  open,
  high,
  low,
  prevClose,
  usdOpen,
  usdHigh,
  usdLow,
  usdPrevClose,
}) {
  const base = Number(Number(cnyGram).toFixed(2));
  return {
    base_gold_price: base,
    change,
    change_percent: changePercent,
    brand_prices: brandPrices(base),
    domestic: {
      label: "国内金价",
      name: "黄金现货",
      price: base,
      unit: "元/克",
      change,
      change_percent: changePercent,
      open: open ?? null,
      high: high ?? null,
      low: low ?? null,
      prev_close: prevClose ?? null,
      datetime,
    },
    international: {
      label: "国际金价",
      name: "伦敦金",
      price: usdOz,
      unit: "美元/盎司",
      gram_price: usdGram,
      change: usdChange,
      change_percent: usdChangePercent,
      open: usdOpen ?? null,
      high: usdHigh ?? null,
      low: usdLow ?? null,
      prev_close: usdPrevClose ?? null,
      datetime,
    },
    spot: {
      xau_usd_per_oz: usdOz,
      xau_usd_per_gram: usdGram,
      xau_cny_per_gram: Number(Number(cnyGram).toFixed(4)),
      usd_change: usdChange,
      datetime,
      change_percent: usdChangePercent,
      source,
    },
  };
}

async function readJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    let message = `${url} ${response.status}`;
    try {
      const body = JSON.parse(text);
      if (body.error) message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
    } catch {
      if (text) message = `${message}: ${text.slice(0, 200)}`;
    }
    throw new Error(message);
  }
  return JSON.parse(text);
}

async function fetchFromGoldApi(token) {
  const headers = { "x-access-token": token };
  const [usd, cny] = await Promise.all([
    readJson(`${GOLDAPI_USD}?purity=true`, headers),
    readJson(`${GOLDAPI_CNY}?purity=true`, headers),
  ]);
  const cnyGram = cny?.price_per_unit?.gram;
  if (!cnyGram) throw new Error("missing cny gram");
  const usdOz = usd.price ?? usd.ask ?? usd.bid;
  return buildPayload({
    cnyGram,
    usdOz,
    usdGram: usd.price_per_unit?.gram ?? gram(usdOz),
    change: Number(((cny.change || 0) / TROY).toFixed(2)),
    changePercent: cny.change_percent ?? cny.chp ?? 0,
    usdChange: usd.change ?? usd.ch ?? 0,
    usdChangePercent: usd.change_percent ?? usd.chp ?? 0,
    datetime: cny.datetime || usd.datetime,
    source: "goldapi.io",
    open: gram(cny.open_price),
    high: gram(cny.high_price),
    low: gram(cny.low_price),
    prevClose: gram(cny.prev_close_price),
    usdOpen: usd.open_price,
    usdHigh: usd.high_price,
    usdLow: usd.low_price,
    usdPrevClose: usd.prev_close_price,
  });
}

function pickDevPrice(payload) {
  const row = payload?.symbols?.[0];
  const price = row?.price == null ? null : Number(row.price);
  if (price == null || Number.isNaN(price)) throw new Error("goldprice.dev missing price");
  return { price, datetime: row.computed_at };
}

async function fetchFromGoldPriceDev() {
  const [usdPayload, cnyPayload] = await Promise.all([
    readJson(DEV_USD),
    readJson(DEV_CNY),
  ]);
  const usd = pickDevPrice(usdPayload);
  const cny = pickDevPrice(cnyPayload);
  return buildPayload({
    cnyGram: cny.price / TROY,
    usdOz: usd.price,
    usdGram: Number((usd.price / TROY).toFixed(4)),
    datetime: cny.datetime || usd.datetime,
    source: "goldprice.dev",
  });
}

async function fetchFromPublicSpot() {
  const [usdPayload, fx] = await Promise.all([readJson(PUBLIC_USD), readJson(FX_USD_CNY)]);
  const usdOz = usdPayload.price;
  const usdCny = fx?.rates?.CNY;
  if (!usdOz || !usdCny) throw new Error("public spot missing usd/cny");
  const usdGram = Number((usdOz / TROY).toFixed(4));
  return buildPayload({
    cnyGram: usdGram * usdCny,
    usdOz,
    usdGram,
    datetime: usdPayload.updatedAt,
    source: "gold-api.com",
  });
}

async function loadSpot(env) {
  const errors = [];
  if (env.GOLDAPI_TOKEN) {
    try {
      return await fetchFromGoldApi(env.GOLDAPI_TOKEN);
    } catch (error) {
      errors.push(error.message);
    }
  } else {
    errors.push("未配置 GOLDAPI_TOKEN");
  }

  try {
    return await fetchFromGoldPriceDev();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    return await fetchFromPublicSpot();
  } catch (error) {
    errors.push(error.message);
  }

  throw new Error(errors.join("；"));
}

async function loadQuotes(env) {
  const [spot, jewelry] = await Promise.all([
    loadSpot(env),
    fetchJewelryPrices().catch(() => ({})),
  ]);
  spot.brand_prices = brandPrices(spot.base_gold_price, jewelry);
  return spot;
}

export async function handleGoldRequest(env) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_TTL_MS) {
    return Response.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }
  if (!cache.inflight) {
    cache.inflight = loadQuotes(env)
      .then((data) => {
        cache = { at: Date.now(), data, inflight: null };
        return data;
      })
      .catch((error) => {
        cache.inflight = null;
        throw error;
      });
  }

  try {
    const data = await cache.inflight;
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "金价获取失败" },
      { status: 502 }
    );
  }
}
