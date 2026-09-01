import json
import os
import re
import requests

GOLDAPI_TOKEN = os.environ.get("GOLDAPI_TOKEN", "")
GOLDAPI_USD_URL = "https://www.goldapi.io/api/price/XAU/USD"
GOLDAPI_CNY_URL = "https://www.goldapi.io/api/price/XAU/CNY"
JEWELRY_FEED_URL = "https://www.5huangjin.com/999/"
JEWELRY_QUOTE_URL = "http://www.huangjinjiage.cn/quote/118108.html"
JEWELRY_HOME_URL = "http://www.huangjinjiage.cn/"

BRAND_ALIASES = {
    "周大福": ("周大福", "内地周大福"),
    "周生生": ("周生生", "内地周生生"),
    "老凤祥": ("老凤祥", "内地老凤祥"),
    "六福珠宝": ("六福珠宝", "六福", "内地六福珠宝"),
    "菜百首饰": ("菜百首饰", "菜百"),
    "中国黄金": ("中国黄金",),
    "周六福": ("周六福", "周六福珠宝"),
    "金至尊": ("金至尊", "内地金至尊"),
    "周大生": ("周大生", "内地周大生"),
}


def fetch_goldapi(url, params=None):
    if not GOLDAPI_TOKEN:
        raise RuntimeError("未配置 GOLDAPI_TOKEN")
    headers = {"x-access-token": GOLDAPI_TOKEN}
    response = requests.get(url, headers=headers, params=params or {}, timeout=15)
    response.raise_for_status()
    return response.json()


def parse_price_number(text):
    match = re.search(r"(\d+(?:\.\d+)?)", text.replace(",", ""))
    return float(match.group(1)) if match else None


def to_display_number(value):
    if value is None:
        return None
    return int(value) if value == int(value) else round(value, 2)


def canonical_brand(name):
    normalized = re.sub(r"^内地", "", str(name or "")).strip()
    for brand, aliases in BRAND_ALIASES.items():
        if brand == normalized or name in aliases or normalized in aliases:
            return brand
    return None


def table_rows(html):
    rows = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.I | re.S):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.I | re.S)
        rows.append([re.sub(r"<[^>]+>", "", c).strip() for c in cells])
    return rows


def fetch_html(url):
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    response.raise_for_status()
    response.encoding = "gbk"
    return response.text


def fetch_jewelry_from_feed():
    prices = {}
    for cells in table_rows(fetch_html(JEWELRY_FEED_URL)):
        if len(cells) < 4:
            continue
        _, raw_brand, product, price_text = cells[:4]
        brand = canonical_brand(raw_brand)
        if not brand or "饰品金价" not in product or "香港" in product:
            continue
        price = parse_price_number(price_text)
        if price is None or price < 800:
            continue
        prices[brand] = to_display_number(price)
    return prices


def fetch_jewelry_from_quote():
    prices = {}
    for cells in table_rows(fetch_html(JEWELRY_QUOTE_URL)):
        if len(cells) < 3:
            continue
        brand = canonical_brand(cells[0])
        if not brand or cells[1] != "黄金价格":
            continue
        price = parse_price_number(cells[2])
        if price is None or price < 800:
            continue
        prices[brand] = to_display_number(price)
    return prices


def fetch_jewelry_from_home():
    prices = {}
    for cells in table_rows(fetch_html(JEWELRY_HOME_URL)):
        if len(cells) < 2:
            continue
        if "港币" in "".join(cells):
            continue
        brand = canonical_brand(cells[0])
        if not brand:
            continue
        price = parse_price_number(cells[1])
        if price is None or price < 800:
            continue
        prices.setdefault(brand, to_display_number(price))
    return prices


def fetch_jewelry_prices():
    print("正在获取各品牌饰品金价...")
    merged = {}
    for loader in (fetch_jewelry_from_feed, fetch_jewelry_from_quote, fetch_jewelry_from_home):
        try:
            for brand, price in loader().items():
                merged.setdefault(brand, price)
        except Exception as e:
            print(f"饰品金价部分源失败: {e}")
    return merged


def fetch_gold_prices_final():
    jewelry_prices = {}
    try:
        jewelry_prices = fetch_jewelry_prices()
    except Exception as e:
        print(f"饰品金价获取失败: {e}")

    print("正在从 GoldAPI 获取实时金价和成色 Ratio...")
    try:
        usd_quote = fetch_goldapi(GOLDAPI_USD_URL, {"purity": "true"})
        cny_quote = fetch_goldapi(GOLDAPI_CNY_URL, {"purity": "true"})

        usd_oz = usd_quote.get("price")
        usd_gram = (usd_quote.get("price_per_unit") or {}).get("gram")
        cny_gram = (cny_quote.get("price_per_unit") or {}).get("gram")
        purity_ratios = cny_quote.get("purity") or usd_quote.get("purity") or {}
        melt_cny = cny_quote.get("melt_price_per_gram") or {}

        if not cny_gram:
            raise ValueError("GoldAPI 未返回人民币克价")

        base_price = round(float(cny_gram), 2)
        result = build_brand_prices(base_price, jewelry_prices)
        result["purity_ratios"] = purity_ratios
        result["melt_price_cny_per_gram"] = melt_cny
        result["spot"] = {
            "xau_usd_per_oz": usd_oz,
            "xau_usd_per_gram": usd_gram,
            "xau_cny_per_gram": round(float(cny_gram), 4),
            "datetime": usd_quote.get("datetime"),
            "change_percent": usd_quote.get("change_percent"),
            "source": "goldapi.io",
        }
        return result
    except Exception as e:
        print(f"GoldAPI 请求失败，使用保底价格: {e}")
        return build_brand_prices(612.99, jewelry_prices)


def build_brand_prices(base_price, jewelry_prices=None):
    print(f"今日国内基础金价基准: {base_price} 元/克")
    jewelry_prices = jewelry_prices or {}

    brand_templates = [
        {"brand": "周大福", "type": "足金", "offset": 11.01},
        {"brand": "周生生", "type": "足金", "offset": 8.01},
        {"brand": "老凤祥", "type": "足金", "offset": 8.01},
        {"brand": "六福珠宝", "type": "足金", "offset": 11.01},
        {"brand": "菜百首饰", "type": "足金", "offset": 5.01},
        {"brand": "中国黄金", "type": "足金", "offset": 3.01},
        {"brand": "周六福", "type": "足金", "offset": 11.01},
        {"brand": "金至尊", "type": "足金", "offset": 9.01},
        {"brand": "周大生", "type": "足金", "offset": 11.01},
    ]

    gold_data = []
    for b in brand_templates:
        calc_price = int(base_price + b["offset"])
        gold_data.append({
            "brand": b["brand"],
            "type": b["type"],
            "price": calc_price,
            "jewelry_price": jewelry_prices.get(b["brand"]),
            "unit": "元/克",
        })

    return {
        "base_gold_price": base_price,
        "brand_prices": gold_data,
    }


if __name__ == "__main__":
    result = fetch_gold_prices_final()
    if result:
        print("\n小程序数据源清洗成功")
        print(json.dumps(result, ensure_ascii=False, indent=4))
