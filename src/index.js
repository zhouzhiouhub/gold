import { handleGoldRequest } from "./gold-api.js";
import { injectOrigin, robotsTxt, sitemapXml } from "./seo.js";
import { inlineCritical, isHtmlPath } from "./inline-html.js";

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

    if (isHtmlPath(url.pathname)) {
      const [asset, cssRes, themeRes] = await Promise.all([
        env.ASSETS.fetch(request),
        env.ASSETS.fetch(new URL("/styles.css", origin)),
        env.ASSETS.fetch(new URL("/theme.js", origin)),
      ]);
      const html = inlineCritical(
        injectOrigin(await asset.text(), origin),
        await cssRes.text(),
        await themeRes.text()
      );
      return new Response(html, {
        status: asset.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const asset = await env.ASSETS.fetch(request);
    const type = asset.headers.get("Content-Type") || "";
    const headers = new Headers(asset.headers);
    if (
      /javascript|css|svg|font|image/.test(type) ||
      /\.(css|js|svg|png|ico|woff2?)$/i.test(url.pathname)
    ) {
      headers.set("Cache-Control", "public, max-age=604800");
    }
    return new Response(asset.body, { status: asset.status, headers });
  },
};
