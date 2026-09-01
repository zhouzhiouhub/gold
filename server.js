process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { fetchGoldPrices } = require("./lib/gold");

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, "public");

let cache = { at: 0, data: null, inflight: null };

function siteOrigin(req) {
  const host = req.get("host") || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${host}`;
}

function robotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(origin) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const paths = [
    "/",
    "/?tab=domestic",
    "/?tab=international",
    "/?tab=investment",
    "/?tab=jewelry",
    "/privacy.html",
    "/security.html",
  ];
  const urls = paths
    .map(
      (item) => `  <url>
    <loc>${origin}${item}</loc>
    <changefreq>hourly</changefreq>
    <lastmod>${lastmod}</lastmod>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(robotsTxt(siteOrigin(req)));
});

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(sitemapXml(siteOrigin(req)));
});

function inlineCritical(html, origin) {
  const css = fs.readFileSync(path.join(PUBLIC_DIR, "styles.css"), "utf8");
  const theme = fs.readFileSync(path.join(PUBLIC_DIR, "theme.js"), "utf8");
  return html
    .replaceAll("__SITE_ORIGIN__", origin)
    .replace(/<link\s+rel="stylesheet"\s+href="\/styles\.css"\s*\/?>/i, `<style>${css}</style>`)
    .replace(/<script\s+src="\/theme\.js"><\/script>/i, `<script>${theme}</script>`);
}

app.get(["/", "/index.html", "/privacy.html", "/security.html"], (req, res) => {
  const file = req.path === "/" ? "index.html" : path.basename(req.path);
  const html = inlineCritical(
    fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8"),
    siteOrigin(req)
  );
  res.type("html").send(html);
});

app.use(
  express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
    },
  })
);

app.get("/api/gold", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.at < CACHE_TTL_MS) {
      return res.json(cache.data);
    }
    if (!cache.inflight) {
      cache.inflight = fetchGoldPrices()
        .then((data) => {
          cache = { at: Date.now(), data, inflight: null };
          return data;
        })
        .catch((error) => {
          cache.inflight = null;
          throw error;
        });
    }
    res.json(await cache.inflight);
  } catch (error) {
    res.status(502).json({ error: error.message || "金价获取失败" });
  }
});

app.listen(PORT, () => {
  console.log(`金价看板已启动: http://localhost:${PORT}`);
});
