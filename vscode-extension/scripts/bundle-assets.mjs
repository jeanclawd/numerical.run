// Populate media/runtime/ with everything the kernel webview needs to run
// offline: figrender + lib.m from the web app, and the RunMat WASM runtime from
// the same CDN the site pins. Run: npm run bundle-assets
import { mkdirSync, copyFileSync, createWriteStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, '..');
const host = join(ext, '..', 'host');
const dest = join(ext, 'media', 'runtime');
const RUNTIME = 'https://unpkg.com/runmat@0.6.2/dist/pkg-web';

mkdirSync(dest, { recursive: true });

for (const f of ['figrender.mjs', 'lib.m']) {
  const src = join(host, f);
  if (existsSync(src)) { copyFileSync(src, join(dest, f)); console.log('copied', f); }
  else console.warn('missing', src);
}

function download(url, out) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, out).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      const ws = createWriteStream(out);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); console.log('downloaded', out); resolve(); });
    }).on('error', reject);
  });
}

for (const f of ['runmat_wasm_web.js', 'runmat_wasm_web_bg.wasm']) {
  await download(`${RUNTIME}/${f}`, join(dest, f));
}
console.log('done');
