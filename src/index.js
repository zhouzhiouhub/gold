import { handleGoldRequest } from "./gold-api.js";
import { injectOrigin, robotsTxt, sitemapXml } from "./seo.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === "/api/gold") {
      return handleGoldRequest(env);
    }

    if (url.pathname === "/robots.txt") {
      return new Response(robotsTxt(origin), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/sitemap.xml") {
      return new Response(sitemapXml(origin), {
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const asset = await env.ASSETS.fetch(request);
    const type = asset.headers.get("Content-Type") || "";
    if (!type.includes("text/html")) {
      return asset;
    }

    const html = injectOrigin(await asset.text(), origin);
    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, { status: asset.status, headers });
  },
};
