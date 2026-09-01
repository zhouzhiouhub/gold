process.env.NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";

const path = require("path");
const express = require("express");
const { fetchGoldPrices } = require("./lib/gold");

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 60 * 1000;

let cache = { at: 0, data: null, inflight: null };

app.use(
  express.static(path.join(__dirname, "public"), {
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
