# Zero-Dep Node ESM CLI Skill Template

Use this skeleton when `z-distill` produces a programmatic skill (`node >= 22`, zero external dependencies).

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      opts[k] = inline !== undefined ? inline : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    }
  }
  return opts;
}

// Cross-process file-lock rate limiter (safe for parallel subagents)
async function withRateLock(lockPath, minIntervalMs, fn) {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        const last = Number(fs.existsSync(lockPath + '.ts') ? fs.readFileSync(lockPath + '.ts', 'utf8') : 0);
        const wait = Math.max(0, last + minIntervalMs - Date.now());
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        fs.writeFileSync(lockPath + '.ts', String(Date.now()));
        return await fn();
      } finally {
        fs.closeSync(fd);
        try { fs.unlinkSync(lockPath); } catch {}
      }
    } catch (err) {
      if (err.code !== 'EEXIST' || Date.now() > deadline) throw err;
      await new Promise(r => setTimeout(r, 80));
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.output || !opts.limit) {
    console.error('Error: --output <file> and --limit <n> are required (no silent truncation).');
    process.exit(1);
  }
  const result = { limit: Number(opts.limit), items: [] };
  const out = path.resolve(process.cwd(), opts.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(`OK (${result.items.length} items) -> ${out}`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

## HTTP Error Handling Rule
When calling REST APIs via `fetch`, never throw only `res.status`. Always read `const body = await res.text()` and include `HTTP ${res.status} ${url}: ${body.slice(0, 500)}` so the agent sees invalid-parameter hints immediately.
