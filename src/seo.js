const TAB_PATHS = ["/", "/?tab=domestic", "/?tab=international", "/?tab=investment", "/?tab=jewelry"];

export function injectOrigin(html, origin) {
  return html.replaceAll("__SITE_ORIGIN__", origin);
}

export function robotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(origin) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = TAB_PATHS.map(
    (path) => `  <url>
    <loc>${origin}${path}</loc>
    <changefreq>hourly</changefreq>
    <lastmod>${lastmod}</lastmod>
  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
