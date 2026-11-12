import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, 'dist', `z-plugin-qoder-${meta.version}.zip`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qoder-package-test-'));
const unpacked = path.join(temp, 'plugin');
const workspace = path.join(temp, 'workspace');
try {
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'sample.mjs'), 'export function qoderFixture() { return 42; }\n');
  if (process.platform === 'win32') {
    const literal = value => `'${value.replaceAll("'", "''")}'`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${literal(archive)}, ${literal(unpacked)})`]);
  } else {
    fs.mkdirSync(unpacked);
    execFileSync('unzip', ['-q', archive, '-d', unpacked]);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, '.qoder-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'z-plugin');
  assert.equal(manifest.version, meta.version);
  const config = JSON.parse(fs.readFileSync(path.join(unpacked, '.mcp.json'), 'utf8'));
  assert.equal(Object.keys(config.mcpServers).length, 5);
  assert.equal(fs.readdirSync(path.join(unpacked, 'skills')).length, 9);
  const files = fs.readdirSync(unpacked, { recursive: true }).filter(file => fs.statSync(path.join(unpacked, file)).isFile());
  assert(!files.some(file => /\.(sqlite|db|log)(?:$|-)|node_modules|hooks\.json|settings\.json/.test(file)));
  assert(files.includes(path.join('plugins', 'z-brain', 'scripts', 'lib', 'preflight.mjs')), 'z-brain preflight runtime is packaged');
  assert(files.includes(path.join('plugins', 'z-brain', 'scripts', 'lib', 'db-admin.mjs')), 'z-brain db admin runtime is packaged');
  for (const file of files.filter(file => file.endsWith('.mjs'))) execFileSync(process.execPath, ['--check', path.join(unpacked, file)]);
  for (const [name, server] of Object.entries(config.mcpServers)) {
    assert.equal(server.command, 'node');
    assert.equal(server.cwd, undefined);
    const args = server.args.map(arg => arg.replace('${QODER_PLUGIN_ROOT}', unpacked));
    const child = spawn(process.execPath, args, { cwd: temp, env: { ...process.env, HOME: temp, USERPROFILE: temp, Z_PLUGIN_WORKSPACE: workspace, ZBRAIN_DB_PATH: path.join(temp, 'brain.sqlite'), ZBRAIN_SYNONYMS_PATH: path.join(unpacked, 'plugins/z-brain/data/synonyms.json'), ZERO_TOKEN_CONFIG: path.join(temp, 'config.json'), TOKEN_DIET_CONFIG: path.join(temp, 'config.json'), ZERO_TOKEN_DATA: path.join(temp, 'ledger'), TOKEN_DIET_DATA: path.join(temp, 'ledger') }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const pending = new Map();
    let id = 0;
    let protocolError;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        pending.get(message.id)?.resolve(message);
      } catch (error) { protocolError = error; }
    });
    child.on('error', error => { for (const request of pending.values()) request.reject(error); });
    child.on('exit', code => { for (const request of pending.values()) request.reject(new Error(`${name} exited ${code}: ${stderr}`)); });
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${name}: timeout ${method}: ${stderr}`)); }, 15000);
      const settle = fn => value => { clearTimeout(timer); pending.delete(requestId); fn(value); };
      pending.set(requestId, { resolve: settle(resolve), reject: settle(reject) });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
    try {
      const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'qoder-package-test', version: '1.0' } });
      assert.equal(initialized.result?.serverInfo?.name, name);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const list = await rpc('tools/list', {});
      assert(list.result?.tools?.length > 0);
      const tool = name === 'z-token' ? 'outline' : { 'z-brain': 'zbrain_status', 'z-mind': 'zmind_status', 'z-gate': 'zgate_status', 'z-craft': 'zcraft_status' }[name];
      const result = await rpc('tools/call', { name: tool, arguments: name === 'z-token' ? { path: '.' } : {} });
      assert(!result.error && !result.result?.isError, JSON.stringify(result));
      if (name === 'z-token') assert(JSON.stringify(result).includes('qoderFixture'), 'Workspace override was not used');
      if (name === 'z-brain') {
        assert(list.result.tools.find(item => item.name === 'zbrain_impact')?.inputSchema?.properties?.brief, 'zbrain_impact brief option is exposed');
        const brief = await rpc('tools/call', { name: 'zbrain_impact', arguments: { file: 'sample.mjs', brief: true } });
        assert(!brief.error && !brief.result?.isError, JSON.stringify(brief));
        assert(brief.result.content[0].text.includes('[Z-BRAIN PREFLIGHT]'), 'packaged pre-flight brief responds');
      }
      assert(!protocolError, `Non-JSON stdout: ${protocolError}`);
      console.log(`${name}: initialize, tools/list, ${tool} OK (${list.result.tools.length} tools)`);
    } finally {
      lines.close();
      const exited = new Promise(resolve => child.once('exit', resolve));
      if (child.exitCode === null) { child.kill(); await exited; }
    }
  }
  console.log('Qoder ZIP structure, runtime syntax, isolated MCP startup and workspace override passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
