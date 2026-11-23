// Inline the production assets for file://. The desktop bundle uses Vite's external assets and CSP.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
let html = await readFile('dist/index.html', 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!script || !style) throw new Error('无法定位构建后的脚本或样式');
const path = (url) => 'dist/' + url.replace(/^\.?\//, '');
const js = await readFile(path(script[1]), 'utf8'),
  css = await readFile(path(style[1]), 'utf8');
html = html.replace(script[0], '').replace(style[0], () => '<style>' + css + '</style>');
html = html.replace(
  '</body>',
  () => '<script type="module">' + js.replace(/<\/script/gi, '<\\/script') + '</script></body>',
);
html = html.replace(
  '<head>',
  `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'">`,
);
await mkdir('release', { recursive: true });
await writeFile('release/Signature Desk.html', html);
