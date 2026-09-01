const GOLDAPI_USD = "https://www.goldapi.io/api/price/XAU/USD";
const GOLDAPI_CNY = "https://www.goldapi.io/api/price/XAU/CNY";
const TROY = 31.1034768;

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

function gram(oz) {
  return oz == null ? null : Number((Number(oz) / TROY).toFixed(2));
}

async function goldApi(url, token) {
  const response = await fetch(`${url}?purity=true`, {
    headers: { "x-access-token": token },
  });
  if (!response.ok) throw new Error(`GoldAPI ${response.status}`);
  return response.json();
}

export async function handleGoldRequest(env) {
  const token = env.GOLDAPI_TOKEN;
  if (!token) {
    return Response.json({ error: "未配置 GOLDAPI_TOKEN" }, { status: 500 });
  }

  try {
    const [usd, cny] = await Promise.all([
      goldApi(GOLDAPI_USD, token),
      goldApi(GOLDAPI_CNY, token),
    ]);
    const cnyGram = cny?.price_per_unit?.gram;
    if (!cnyGram) throw new Error("missing cny gram");

    const base = Number(Number(cnyGram).toFixed(2));
    const change = Number(((cny.change || 0) / TROY).toFixed(2));
    const usdChange = usd.change ?? usd.ch ?? 0;
    const usdPct = usd.change_percent ?? usd.chp ?? 0;

    const body = {
      base_gold_price: base,
      change,
      change_percent: cny.change_percent ?? 0,
      brand_prices: BRANDS.map((item) => ({
        brand: item.brand,
        type: "足金",
        price: Math.trunc(base + item.offset),
        jewelry_price: null,
        display_price: Math.trunc(base + item.offset),
        change: 0,
        unit: "元/克",
      })),
      domestic: {
        label: "国内金价",
        name: "黄金现货",
        price: base,
        unit: "元/克",
        change,
        change_percent: cny.change_percent ?? 0,
        open: gram(cny.open_price),
        high: gram(cny.high_price),
        low: gram(cny.low_price),
        prev_close: gram(cny.prev_close_price),
        datetime: cny.datetime,
      },
      international: {
        label: "国际金价",
        name: "伦敦金",
        price: usd.price,
        unit: "美元/盎司",
        gram_price: usd.price_per_unit?.gram,
        change: usdChange,
        change_percent: usdPct,
        open: usd.open_price,
        high: usd.high_price,
        low: usd.low_price,
        prev_close: usd.prev_close_price,
        datetime: usd.datetime,
      },
      spot: {
        xau_usd_per_oz: usd.price,
        xau_usd_per_gram: usd.price_per_unit?.gram,
        xau_cny_per_gram: Number(Number(cnyGram).toFixed(4)),
        usd_change: usdChange,
        datetime: usd.datetime,
        change_percent: usdPct,
        source: "goldapi.io",
      },
    };

    return Response.json(body, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "金价获取失败" },
      { status: 502 }
    );
  }
}
