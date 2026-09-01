export function inlineCritical(html, css, themeJs) {
  return html
    .replace(
      /<link\s+rel="stylesheet"\s+href="\/styles\.css"\s*\/?>/i,
      `<style>${css}</style>`
    )
    .replace(
      /<script\s+src="\/theme\.js"><\/script>/i,
      `<script>${themeJs}</script>`
    );
}

export function isHtmlPath(pathname) {
  return pathname === "/" || pathname.endsWith(".html");
}
