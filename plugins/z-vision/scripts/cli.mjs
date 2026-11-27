#!/usr/bin/env node
/**
 * Z-Vision CLI
 * Usage:
 *   node cli.mjs status
 *   node cli.mjs windows [filter]
 *   node cli.mjs observe [hwnd] [--image] [--no-uia|--diff-uia]
 *   node cli.mjs ocr [hwnd]
 *   node cli.mjs table [hwnd] [index]
 *   node cli.mjs clipboard [get|set-text <txt>|set-image <path>|clear]
 *   node cli.mjs match <hwnd> <template_path> [min_score]
 *   node cli.mjs macro [list|run <name> [hwnd]|delete <name>]
 *   node cli.mjs lock [unlock|<hwnd> [status_text]]
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
      const hwnd = rest[0] && !rest[0].startsWith('--') ? Number(rest[0]) : 0;
      const withUia = rest.includes('--no-uia') ? 'off' : (rest.includes('--diff-uia') ? 'diff' : 'full');
      const res = await engine.observe({ hwnd, with_image: rest.includes('--image'), with_uia: withUia });
      console.log(JSON.stringify({ ...res, image_base64: res.image_base64 ? `<${res.image_base64.length} b64 chars>` : null }, null, 2));
    } else if (cmd === 'ocr') {
      const hwnd = rest[0] ? Number(rest[0]) : 0;
      console.log(JSON.stringify(await engine.ocr({ hwnd }), null, 2));
    } else if (cmd === 'table') {
      const hwnd = rest[0] ? Number(rest[0]) : 0;
      const index = rest[1] != null ? Number(rest[1]) : -1;
      console.log(JSON.stringify(await engine.extractTable({ hwnd, index }), null, 2));
    } else if (cmd === 'clipboard') {
      const sub = rest[0] || 'get';
      if (sub === 'get') {
        console.log(JSON.stringify(await engine.clipboardGet({ save_image_path: rest[1] || '' }), null, 2));
      } else if (sub === 'set-text') {
        console.log(JSON.stringify(await engine.clipboardSet({ kind: 'text', text: rest.slice(1).join(' ') }), null, 2));
      } else if (sub === 'set-image') {
        console.log(JSON.stringify(await engine.clipboardSet({ kind: 'image', image_path: rest[1] || '' }), null, 2));
      } else if (sub === 'clear') {
        console.log(JSON.stringify(await engine.clipboardSet({ kind: 'clear' }), null, 2));
      } else {
        throw new Error(`Unknown clipboard subcommand: ${sub}`);
      }
    } else if (cmd === 'match') {
      const hwnd = Number(rest[0] || 0);
      const template_path = rest[1] || '';
      const min_score = rest[2] != null ? Number(rest[2]) : 0.85;
      console.log(JSON.stringify(await engine.matchTemplate({ hwnd, template_path, min_score }), null, 2));
    } else if (cmd === 'macro') {
      const sub = rest[0] || 'list';
      if (sub === 'list') {
        console.log(JSON.stringify(await engine.listMacros(), null, 2));
      } else if (sub === 'run') {
        const hwnd = rest[2] ? Number(rest[2]) : 0;
        console.log(JSON.stringify(await engine.runMacro({ name: rest[1] || '', hwnd }), null, 2));
      } else if (sub === 'delete') {
        console.log(JSON.stringify(await engine.deleteMacro({ name: rest[1] || '' }), null, 2));
      } else {
        throw new Error(`Unknown macro subcommand: ${sub}`);
      }
    } else if (cmd === 'lock') {
      const sub = rest[0] || 'unlock';
      if (sub === 'unlock') {
        console.log(JSON.stringify(await engine.lockRegion({ action: 'unlock' }), null, 2));
      } else {
        const hwnd = Number(sub || 0);
        const status_text = rest.slice(1).join(' ');
        console.log(JSON.stringify(await engine.lockRegion({ action: 'lock', hwnd, region: 'window', status_text }), null, 2));
      }
    } else if (cmd === 'sample') {
      const hwnd = Number(rest[0] || 0);
      const x = Number(rest[1] || 0);
      const y = Number(rest[2] || 0);
      console.log(JSON.stringify(await engine.samplePixels({ hwnd, points: [[x, y]] }), null, 2));
    } else if (cmd === 'vectorize') {
      const imagePath = rest[0] || '';
      const w = Number(rest[1] || 960);
      const h = Number(rest[2] || 720);
      console.log(JSON.stringify(await engine.vectorizeImage({ image_path: imagePath, canvas_rect: [0, 0, w, h] }), null, 2));
    } else if (cmd === 'stop') {
      const action = rest[0] === 'reset' ? 'reset' : 'stop';
      console.log(JSON.stringify(await engine.stop({ action }), null, 2));
    } else {
      console.error('Unknown command. Use: status | windows | observe | ocr | table | clipboard | match | macro | lock | sample | vectorize | stop | build');
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
