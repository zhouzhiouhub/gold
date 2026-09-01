# Kinolin 金价查询

国内现货金价、国际伦敦金与品牌金饰挂牌价的查询页。本地用 Node/Express 提供页面和接口，也可部署到 Cloudflare Workers。

现货金价和金饰挂牌价不是同一口径：现货大约九百多元/克，品牌饰品金价通常在一千三百多元/克，差价来自工费与零售加价，属于正常现象。

## 功能

- **国内金价**：GoldAPI `XAU/CNY` 人民币克价（现货，不是饰品零售价）
- **国际金价**：GoldAPI `XAU/USD` 盎司价与克价
- **国内金饰价**：周大福、周生生、老凤祥等品牌足金挂牌价
- 浅色 / 深色主题，刷新按钮，Tab 状态写入 `?tab=` 与本地存储
- 今开 / 最高 / 昨收 / 最低：四项齐全才展示，缺数据时整块隐藏

## 本地运行

需要 Node.js 18+（使用了内置 `fetch`）。

先复制环境变量模板并填入 GoldAPI Token（不要把 `.env` 提交到 Git）：

```bash
copy .env.example .env
```

```bash
npm install
npm start
```

浏览器打开 http://localhost:3000 。接口为 `GET /api/gold`，服务端缓存 60 秒。

`GOLDAPI_TOKEN` 也可直接写在系统环境变量里。命令行调试抓取时同样需要该变量。

`npm start` 会带上 `--use-env-proxy`，并默认开启 `NODE_USE_ENV_PROXY=1`。本机若走 HTTP 代理（例如 Clash `http://127.0.0.1:7897`），请保证环境变量 `HTTP_PROXY` / `HTTPS_PROXY` 已设置，否则 GoldAPI 或饰品源可能超时。

端口被占用时，结束占用 3000 的旧 `node` 进程，或设置：

```bash
set PORT=3001
npm start
```

## 数据从哪来

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 国内现货 | [GoldAPI](https://www.goldapi.io/) `XAU/CNY` | 按克报价 |
| 国际金 | GoldAPI `XAU/USD` | 盎司价 + 克价 |
| 金饰挂牌 | `5huangjin.com/999/` → `huangjinjiage.cn/quote/118108.html` → 站点首页 | 优先取「饰品金价(内地)」，不用工艺金、回收价、港币价 |

饰品源抓取失败时，会用「现货克价 + 品牌固定加价」作为保底；GoldAPI 失败时接口仍可能返回保底现货价。

本地服务会把各品牌当日展示价写到 `data/last-prices.json`，用于计算相对昨日的涨跌。该目录已加入 `.gitignore`。

## Cloudflare Workers

控制台「连接 GitHub」创建的是 Worker，部署命令是 `npx wrangler deploy`。静态页在 `public/`，接口在 `src/index.js` 的 `/api/gold`。云上**不会抓取饰品网站**，金饰 Tab 用现货加价估算。现货行情优先 GoldAPI；额度用尽或失败时改走 goldprice.dev，再不行用公开现货 + 汇率。

构建命令留空。在 Cloudflare Worker 的 Settings → Variables and Secrets 里添加密钥 `GOLDAPI_TOKEN`（Encrypt），不要写进 `wrangler.toml` 或源码。配好后推送代码或点 Retry。

站点地图：`/sitemap.xml`，爬虫规则：`/robots.txt`。

本地预览：

```bash
npm run dev:cf
```

## 项目结构

```
public/              前端（页面、样式、主题）
src/index.js         Cloudflare Worker 入口
src/gold-api.js      云上金价接口（GoldAPI，失败则备用源）
lib/gold.js          本地金价聚合（GoldAPI + 饰品抓取）
server.js            Express：静态资源 + /api/gold
data/                本地涨跌对照缓存（不提交）
```

GoldAPI Token 只通过环境变量 `GOLDAPI_TOKEN` 读取：本地用 `.env`，云上用 Worker Secret。仓库里曾经提交过 Token，推送本次改动后建议在 GoldAPI 控制台作废并换发新密钥。
