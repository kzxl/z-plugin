// Offline estimate of the context that installed skills and plugins cost every session.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";

const CHARS_PER_TOKEN = 4;
const PATH_OVERHEAD_CHARS = 90; // absolute path + "(also loadable as ...)" per skill line

function frontmatterDescription(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
  if (!text.startsWith("---")) return "";
  const end = text.indexOf("\n---", 3);
  if (end < 0) return "";
  const block = text.slice(3, end).split(/\r?\n/);
  const out = [];
  let inDesc = false;
  for (const line of block) {
    if (/^description:\s*/.test(line)) {
      inDesc = true;
      out.push(line.replace(/^description:\s*/, ""));
      continue;
    }
    if (inDesc) {
      if (/^[a-zA-Z_][\w-]*:/.test(line)) break;
      out.push(line.trim());
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function readDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function scanSkills(root, label, rows) {
  for (const e of readDir(root)) {
    // Skill installers commonly use symlinks/junctions, so test for a directory
    // entry with stat rather than the lstat-based isDirectory().
    let isDir = e.isDirectory();
    if (!isDir) {
      try {
        isDir = fs.statSync(path.join(root, e.name)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (!isDir) continue;
    const f = path.join(root, e.name, "SKILL.md");
    if (!fs.existsSync(f)) continue;
    const d = frontmatterDescription(f);
    if (!d) continue;
    rows.push({
      label,
      name: e.name,
      chars: d.length + PATH_OVERHEAD_CHARS,
      note: "skill description",
    });
  }
}

function scanPlugins(rows) {
  const cache = path.join(os.homedir(), ".zcode", "cli", "plugins", "cache");
  for (const market of readDir(cache)) {
    if (!market.isDirectory()) continue;
    const marketDir = path.join(cache, market.name);
    for (const plugin of readDir(marketDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(marketDir, plugin.name);
      for (const version of readDir(pluginDir)) {
        if (!version.isDirectory()) continue;
        if (!fs.existsSync(path.join(pluginDir, version.name, ".zcode-plugin", "plugin.json"))) continue;
        const root = path.join(pluginDir, version.name);
        const manifestFile = path.join(root, ".zcode-plugin", "plugin.json");
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        } catch {
          continue;
        }
        const skillDir = manifest.skills
          ? path.resolve(root, typeof manifest.skills === "string" ? manifest.skills : "skills")
          : path.join(root, "skills");
        scanSkills(skillDir, `${plugin.name}@${market.name}`, rows);

        const servers = manifest.mcpServers || {};
        const serverCount = Object.keys(servers).length;
        if (serverCount > 0) {
          rows.push({
            label: `${plugin.name}@${market.name}`,
            name: `[${serverCount} MCP server(s)]`,
            chars: serverCount * 4800, // ~20 tool schemas, ~240 chars each
            note: "tool schemas (estimate, agent-measurable only)",
          });
        }
      }
    }
  }
}

function scanAntigravity(rows, rulesRows) {
  const agyConfig = path.join(os.homedir(), ".gemini", "config");
  const agyApp = path.join(os.homedir(), ".gemini", "antigravity");

  // 1. Standalone global skills in ~/.gemini/config/skills
  scanSkills(path.join(agyConfig, "skills"), "agy-user", rows);

  // 2. Installed plugins in ~/.gemini/config/plugins
  const pluginsRoot = path.join(agyConfig, "plugins");
  for (const p of readDir(pluginsRoot)) {
    let isDir = p.isDirectory();
    if (!isDir) {
      try {
        isDir = fs.statSync(path.join(pluginsRoot, p.name)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (!isDir) continue;
    const pDir = path.join(pluginsRoot, p.name);
    scanSkills(path.join(pDir, "skills"), `${p.name}@agy`, rows);

    const ruleFile = path.join(pDir, "rules", "AGENTS.md");
    if (fs.existsSync(ruleFile)) {
      try {
        const size = fs.statSync(ruleFile).size;
        rulesRows.push({
          source: `${p.name}/rules/AGENTS.md`,
          bytes: size,
          tokens: Math.round(size / CHARS_PER_TOKEN),
        });
      } catch {}
    }
  }

  // 3. Measure actual MCP schema files under ~/.gemini/antigravity/mcp/<server>/*.json
  const mcpRoot = path.join(agyApp, "mcp");
  for (const srv of readDir(mcpRoot)) {
    if (!srv.isDirectory()) continue;
    const srvDir = path.join(mcpRoot, srv.name);
    const jsons = readDir(srvDir).filter((f) => f.isFile() && f.name.endsWith(".json"));
    if (jsons.length > 0) {
      // Lazy-loaded MCP servers only inject server + tool names in prompt (~28 chars/tool);
      // eager schemas inject full JSON definitions. Estimate conservatively from index listing.
      let totalSchemaBytes = 0;
      for (const jf of jsons) {
        try {
          totalSchemaBytes += fs.statSync(path.join(srvDir, jf.name)).size;
        } catch {}
      }
      rows.push({
        label: `mcp:${srv.name}@agy`,
        name: `[${jsons.length} MCP tool(s)]`,
        chars: jsons.length * 36,
        rawSchemaBytes: totalSchemaBytes,
        note: "agy lazy mcp index",
      });
    }
  }

  // 4. Global GEMINI.md
  const geminiMd = path.join(os.homedir(), ".gemini", "GEMINI.md");
  if (fs.existsSync(geminiMd)) {
    try {
      const size = fs.statSync(geminiMd).size;
      rulesRows.push({
        source: "~/.gemini/GEMINI.md",
        bytes: size,
        tokens: Math.round(size / CHARS_PER_TOKEN),
      });
    } catch {}
  }
}

export function dietReport(cwd = process.cwd()) {
  const rows = [];
  const rulesRows = [];
  scanSkills(path.join(os.homedir(), ".zcode", "skills"), "user", rows);
  scanSkills(path.join(os.homedir(), ".agents", "skills"), "user(.agents)", rows);
  scanSkills(path.join(cwd, ".zcode", "skills"), "workspace", rows);
  scanSkills(path.join(cwd, ".agents", "skills"), "workspace(.agents)", rows);
  scanPlugins(rows);
  scanAntigravity(rows, rulesRows);

  const agentsFile = path.join(os.homedir(), ".zcode", "AGENTS.md");
  let agentsNote = "";
  if (fs.existsSync(agentsFile)) {
    const chars = fs.statSync(agentsFile).size;
    rulesRows.push({
      source: "~/.zcode/AGENTS.md",
      bytes: chars,
      tokens: Math.round(chars / CHARS_PER_TOKEN),
    });
    agentsNote = `\nAGENTS.md (user): ${(chars / 1024).toFixed(1)} KB (~${Math.round(chars / CHARS_PER_TOKEN)} tokens, always loaded)`;
  }
  const agyRulesBytes = rulesRows
    .filter((r) => r.source !== "~/.zcode/AGENTS.md")
    .reduce((n, r) => n + r.bytes, 0);
  if (agyRulesBytes > 0) {
    agentsNote += `\nAntigravity always-on rules (${rulesRows.filter((r) => r.source !== "~/.zcode/AGENTS.md").length} files): ${(agyRulesBytes / 1024).toFixed(1)} KB (~${Math.round(agyRulesBytes / CHARS_PER_TOKEN)} tokens, always loaded)`;
  }

  const skillRows = rows.filter((r) => r.note === "skill description");
  const schemaRows = rows.filter((r) => r.note !== "skill description");

  const byLabel = new Map();
  for (const r of skillRows) {
    const key = r.label;
    const cur = byLabel.get(key) || { count: 0, chars: 0 };
    cur.count++;
    cur.chars += r.chars;
    byLabel.set(key, cur);
  }

  const totalSkills = skillRows.length;
  const totalSkillChars = skillRows.reduce((n, r) => n + r.chars, 0);
  const schemaChars = schemaRows.reduce((n, r) => n + r.chars, 0);
  const totalRuleChars = rulesRows.reduce((n, r) => n + r.bytes, 0);

  const groups = [...byLabel.entries()]
    .sort((a, b) => b[1].chars - a[1].chars)
    .map(([label, v]) => ({
      label,
      items: v.count,
      tokens: Math.round(v.chars / CHARS_PER_TOKEN),
    }));

  const lines = [];
  lines.push("zero-token report — estimated permanent context cost per session");
  lines.push(`formula: ${CHARS_PER_TOKEN} chars/token, +${PATH_OVERHEAD_CHARS} chars per skill line`);
  lines.push("");
  lines.push("GROUP                 ITEMS   EST. TOKENS");
  for (const g of groups) {
    lines.push(
      `${g.label.padEnd(20)}  ${String(g.items).padStart(5)}   ${String(g.tokens).padStart(10)}`
    );
  }
  if (schemaRows.length) {
    const schemaCount = schemaRows.reduce((n, r) => n + Number(r.name.match(/\d+/)?.[0] || 0), 0);
    lines.push(
      `${"plugin MCP schemas".padEnd(20)}  ${String(schemaCount).padStart(5)}   ${String(Math.round(schemaChars / CHARS_PER_TOKEN)).padStart(10)}`
    );
  }
  lines.push("");
  const estTokens = Math.round((totalSkillChars + schemaChars + totalRuleChars) / CHARS_PER_TOKEN);
  lines.push(
    `TOTAL ~${estTokens} tokens, ` +
      `every session, before you type anything (${totalSkills} skills).`
  );
  if (agentsNote) lines.push(agentsNote);

  const top = [...skillRows].sort((a, b) => b.chars - a.chars).slice(0, 12);
  const topSkills = top.map((r) => ({
    name: r.name,
    group: r.label,
    tokens: Math.round(r.chars / CHARS_PER_TOKEN),
  }));
  if (top.length) {
    lines.push("", "HEAVIEST SKILL DESCRIPTIONS");
    for (const r of topSkills) {
      lines.push(`  ${String(r.tokens).padStart(5)}  ${r.name} (${r.group})`);
    }
  }

  lines.push(
    "",
    "WHAT TO DO",
    "  - Disable plugins whose MCP tools you never use: Settings > Plugin Management > Installed.",
    "  - Skills are discovered from disk; move rarely used ones out of ~/.gemini/config/skills or ~/.zcode/skills to a backup folder.",
    "  - Deduplicate repeated sections across always-on rules/AGENTS.md files."
  );

  return {
    text: lines.join("\n"),
    stats: {
      skills: totalSkills,
      estTokens,
      skillTokens: Math.round(totalSkillChars / CHARS_PER_TOKEN),
      schemaTokens: Math.round(schemaChars / CHARS_PER_TOKEN),
      rulesTokens: Math.round(totalRuleChars / CHARS_PER_TOKEN),
      groups,
      topSkills,
      alwaysOnRules: rulesRows,
    },
  };
}

export function smartDiff(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const excludePatterns = [
    ":!*.Designer.cs",
    ":!*.g.cs",
    ":!*.generated.cs",
    ":!*.min.js",
    ":!*.min.css",
    ":!package-lock.json",
    ":!yarn.lock",
    ":!pnpm-lock.yaml"
  ];
  const staged = opts.staged ? ["--cached"] : [];
  try {
    const statOut = cp.execSync(`git diff ${staged.join(" ")} --stat -- ${excludePatterns.join(" ")}`, { cwd, encoding: "utf8" });
    const diffOut = cp.execSync(`git diff ${staged.join(" ")} -- ${excludePatterns.join(" ")}`, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    const trimmedDiff = diffOut.slice(0, 15000);
    const suffix = diffOut.length > 15000 ? "\n... [diff truncated by z-token slicer to conserve context]" : "";
    return {
      text: `Smart Sliced Diff (excluding designer, minified, & lock files):\n\nSummary:\n${statOut || "No changes"}\n\nDiff:\n${trimmedDiff || "Clean"}${suffix}`
    };
  } catch (err) {
    return { text: `smartDiff error: ${err.message}` };
  }
}

