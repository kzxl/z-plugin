#!/usr/bin/env node
/**
 * Z-Vision CLI
 * Usage:
 *   node cli.mjs status
 *   node cli.mjs windows [filter]
 *   node cli.mjs observe [hwnd]
 *   node cli.mjs ocr [hwnd]
 *   node cli.mjs stop [reset]
 *   node cli.mjs build
 */
import { ensureNativeHost } from './lib/native-builder.mjs';
import { createVisionEngine } from './lib/vision-engine.mjs';

const [cmd = 'status', ...rest] = process.argv.slice(2);

async function main() {
  if (cmd === 'build') {
    const info = ensureNativeHost({ force: rest.includes('--force') });
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  const engine = createVisionEngine();
  try {
    if (cmd === 'status') {
      console.log(JSON.stringify(await engine.status(), null, 2));
    } else if (cmd === 'windows') {
      console.log(JSON.stringify(await engine.windows({ filter: rest[0] || '' }), null, 2));
    } else if (cmd === 'observe') {
      const hwnd = rest[0] ? Number(rest[0]) : 0;
      const res = await engine.observe({ hwnd, with_image: rest.includes('--image') });
      console.log(JSON.stringify({ ...res, image_base64: res.image_base64 ? `<${res.image_base64.length} b64 chars>` : null }, null, 2));
    } else if (cmd === 'ocr') {
      const hwnd = rest[0] ? Number(rest[0]) : 0;
      console.log(JSON.stringify(await engine.ocr({ hwnd }), null, 2));
    } else if (cmd === 'stop') {
      const action = rest[0] === 'reset' ? 'reset' : 'stop';
      console.log(JSON.stringify(await engine.stop({ action }), null, 2));
    } else {
      console.error('Unknown command. Use: status | windows | observe | ocr | stop | build');
      process.exitCode = 1;
    }
  } finally {
    await engine.close();
  }
}

main().catch((err) => {
  console.error(`${err.code || 'error'}: ${err.message}`);
  process.exit(1);
});
