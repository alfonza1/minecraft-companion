import { build } from 'vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve('apps/website'), out = join(root, 'dist'), server = join(root, '.ssr');
const base = process.env.WAYPOINT_SITE_BASE || '/minecraft-companion/';
const origin = process.env.WAYPOINT_SITE_ORIGIN || 'https://alfonza1.github.io';
if (!/^\/[a-zA-Z0-9/_-]*\/$/.test(base) && base !== '/') throw new Error('Invalid site base path.');
const configFile = join(root, 'vite.config.ts');
await build({ configFile });
await build({ configFile, build: { ssr: join(root, 'src/render.tsx'), outDir: server, emptyOutDir: true } });
try {
  const { render, pages } = await import(pathToFileURL(join(server, 'render.js')));
  const template = await readFile(join(out, 'index.html'), 'utf8');
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  for (const [route, title, description] of [...pages, ['/404/', 'Page not found', 'Find your way back to Waypoint.']]) {
    const canonical = origin + base + route.slice(1);
    const metadata = `<meta name="description" content="${escape(description)}"/><link rel="canonical" href="${escape(canonical)}"/><meta property="og:title" content="${escape(title)} — Waypoint"/><meta property="og:description" content="${escape(description)}"/><meta property="og:type" content="website"/><meta property="og:url" content="${escape(canonical)}"/><meta property="og:image" content="${origin + base}social.png"/><meta name="twitter:card" content="summary_large_image"/>`;
    const html = template.replace(/<title>.*?<\/title>/, `<title>${escape(title)} — Waypoint</title>`).replace('<!--metadata-->', metadata).replace('<!--app-->', render(route));
    const directory = join(out, route.slice(1)); await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'index.html'), html);
    if (route === '/404/') await writeFile(join(out, '404.html'), html);
  }
  await writeFile(join(out, '.nojekyll'), '');
  await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin + base}sitemap.xml\n`);
  await writeFile(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([route])=>`<url><loc>${origin + base + route.slice(1)}</loc></url>`).join('')}</urlset>`);
  console.log(`Prerendered ${pages.length} public pages. No companion API or secrets included.`);
} finally { await rm(server, { recursive: true, force: true }); }

