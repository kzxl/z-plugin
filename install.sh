#!/usr/bin/env bash
# Universal Installer & Linker for z-plugin Monorepo (Linux / macOS)
# Feature-aligned with install.ps1 for Antigravity 2.0 & ZCode environments
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_DIR="$REPO_ROOT/plugins"
EXTENSIONS_DIR="$REPO_ROOT/extensions"

PLUGIN_TARGET="${1:-all}"
MODE="${2:-install}" # install | uninstall | dev

echo "=== AEOS z-plugin Monorepo Linker (Unix/macOS) ==="
echo "Repo root: $REPO_ROOT | Mode: $MODE"

IDE_NAMES=("Antigravity" "ZCode")
IDE_CONFIGS=("$HOME/.gemini/config/plugins" "$HOME/.zcode/plugins")
EXTENSION_TARGETS=("$HOME/.gemini/config/extensions" "$HOME/.zcode/extensions")

sync_dir_preserve_data() {
  local src="$1"
  local dst="$2"
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [src, dst] = process.argv.slice(1);
    const skip = new Set([".git", "node_modules", "data"]);
    function rmStale(curSrc, curDst) {
      if (!fs.existsSync(curDst)) return;
      for (const ent of fs.readdirSync(curDst, { withFileTypes: true })) {
        if (skip.has(ent.name)) continue;
        const s = path.join(curSrc, ent.name);
        const d = path.join(curDst, ent.name);
        if (!fs.existsSync(s)) {
          fs.rmSync(d, { recursive: true, force: true });
        } else if (ent.isDirectory()) {
          rmStale(s, d);
        }
      }
    }
    function copyTree(curSrc, curDst) {
      fs.mkdirSync(curDst, { recursive: true });
      for (const ent of fs.readdirSync(curSrc, { withFileTypes: true })) {
        if (skip.has(ent.name) || ent.name.includes(".sqlite")) continue;
        const s = path.join(curSrc, ent.name);
        const d = path.join(curDst, ent.name);
        if (ent.isDirectory()) {
          copyTree(s, d);
        } else {
          fs.copyFileSync(s, d);
        }
      }
    }
    rmStale(src, dst);
    copyTree(src, dst);
  ' "$src" "$dst"
}

convert_antigravity_mcp_config() {
  local target_dir="$1"
  local mcp_path="$target_dir/mcp_config.json"
  [ -f "$mcp_path" ] || return 0
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [targetDir, mcpPath] = process.argv.slice(1);
    const resolved = path.join(targetDir, "scripts", "mcp-server.mjs").replace(/\\/g, "/");
    const raw = fs.readFileSync(mcpPath, "utf8");
    const updated = raw
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/mcp-server\.mjs/g, resolved)
      .replace(/\.\/scripts\/mcp-server\.mjs/g, resolved);
    if (updated !== raw) fs.writeFileSync(mcpPath, updated, "utf8");
  ' "$target_dir" "$mcp_path"
}

convert_zcode_subagents() {
  local target_dir="$1"
  local agents_dir="$target_dir/agents"
  [ -d "$agents_dir" ] || return 0
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const agentsDir = process.argv[1];
    for (const f of fs.readdirSync(agentsDir)) {
      if (!f.endsWith(".md")) continue;
      const p = path.join(agentsDir, f);
      const raw = fs.readFileSync(p, "utf8");
      const out = raw
        .replace(/^subagent:\s*\S+\r?\n/gm, "")
        .replace(/^mainAgent:\s*\S+\r?\n/gm, "")
        .replace(/^tools:\s*\[read_file,\s*run_command,\s*manage_task\]/m, "tools: [Read, Bash]");
      if (out !== raw) fs.writeFileSync(p, out, "utf8");
    }
  ' "$agents_dir"
}

# 1. Clean legacy links
for ide_dir in "${IDE_CONFIGS[@]}"; do
  for legacy in "zero-token" "token-diet"; do
    legacy_path="$ide_dir/$legacy"
    if [ -L "$legacy_path" ] || [ -d "$legacy_path" ]; then
      echo "Cleaning legacy link: $legacy_path"
      rm -rf "$legacy_path"
    fi
  done
done

PROCESSED_PLUGINS=()

# 2. Process Core Plugins
for p_path in "$PLUGINS_DIR"/*; do
  if [ -d "$p_path" ]; then
    p_name="$(basename "$p_path")"
    if [ "$PLUGIN_TARGET" != "all" ] && [ "$PLUGIN_TARGET" != "$p_name" ]; then
      continue
    fi
    PROCESSED_PLUGINS+=("$p_name")

    echo -e "\n--> Processing Core Plugin: $p_name"
    for idx in 0 1; do
      ide_name="${IDE_NAMES[$idx]}"
      ide_dir="${IDE_CONFIGS[$idx]}"
      mkdir -p "$ide_dir"
      target_link="$ide_dir/$p_name"

      if [ "$MODE" = "uninstall" ]; then
        if [ -L "$target_link" ] || [ -d "$target_link" ]; then
          echo "[$ide_name] Removing: $target_link"
          rm -rf "$target_link"
        fi
        continue
      fi

      if [ "$MODE" = "dev" ]; then
        rm -rf "$target_link"
        ln -s "$p_path" "$target_link"
        echo "[$ide_name] Linked dev symlink: $target_link -> $p_path"
        continue
      fi

      if [ -L "$target_link" ]; then
        rm -f "$target_link"
      fi
      sync_dir_preserve_data "$p_path" "$target_link"
      if [ "$ide_name" = "Antigravity" ]; then
        convert_antigravity_mcp_config "$target_link"
      elif [ "$ide_name" = "ZCode" ]; then
        convert_zcode_subagents "$target_link"
      fi
      echo "[$ide_name] Synchronized directory: $target_link"
    done
  fi
done

# 3. Process Extension DLCs
if [ -d "$EXTENSIONS_DIR" ]; then
  for ext_path in "$EXTENSIONS_DIR"/dlc-*; do
    if [ -d "$ext_path" ]; then
      ext_name="$(basename "$ext_path")"
      echo -e "\n--> Processing Extension DLC: $ext_name"
      for ext_dir in "${EXTENSION_TARGETS[@]}"; do
        mkdir -p "$ext_dir"
        target_link="$ext_dir/$ext_name"

        if [ "$MODE" = "uninstall" ]; then
          if [ -L "$target_link" ] || [ -d "$target_link" ]; then
            echo "Removing: $target_link"
            rm -rf "$target_link"
          fi
          continue
        fi

        if [ "$MODE" = "dev" ]; then
          rm -rf "$target_link"
          ln -s "$ext_path" "$target_link"
          echo "  [Linked DLC] $target_link -> $ext_path"
        else
          [ -L "$target_link" ] && rm -f "$target_link"
          sync_dir_preserve_data "$ext_path" "$target_link"
          echo "  [Synced DLC] $target_link"
        fi
      done
    fi
  done
fi

# 4. Synchronize Antigravity & ZCode plugin registry, deduplicate global mcp_config.json, and link CLI
if [ "${#PROCESSED_PLUGINS[@]}" -gt 0 ]; then
  ENABLED_FLAG=$([ "$MODE" = "uninstall" ] && echo "false" || echo "true")
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const os = require("node:os");
    const [enabledRaw, ...plugins] = process.argv.slice(1);
    const enabled = enabledRaw === "true";
    const home = os.homedir();

    const agyCfg = path.join(home, ".gemini", "config", "config.json");
    if (fs.existsSync(agyCfg)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(agyCfg, "utf8"));
        cfg.plugins = cfg.plugins || {};
        for (const p of plugins) {
          cfg.plugins[p] = { ...(cfg.plugins[p] || {}), enabled };
        }
        fs.writeFileSync(agyCfg, JSON.stringify(cfg, null, 2) + "\n", "utf8");
      } catch {}
    }

    for (const mcpPath of [
      path.join(home, ".gemini", "config", "mcp_config.json"),
      path.join(home, ".gemini", "antigravity", "mcp_config.json")
    ]) {
      if (!fs.existsSync(mcpPath)) continue;
      try {
        const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
        if (mcp.mcpServers) {
          let changed = false;
          for (const p of plugins) {
            if (Object.prototype.hasOwnProperty.call(mcp.mcpServers, p)) {
              delete mcp.mcpServers[p];
              changed = true;
            }
          }
          if (changed) fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n", "utf8");
        }
      } catch {}
    }

    const cacheRoot = path.join(home, ".gemini", "antigravity", "mcp");
    for (const stale of ["token-diet", "token-diet_token-diet", "zero-token"]) {
      const p = path.join(cacheRoot, stale);
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    }

    const zcodeCfg = path.join(home, ".zcode", "cli", "config.json");
    if (fs.existsSync(zcodeCfg)) {
      try {
        const zcfg = JSON.parse(fs.readFileSync(zcodeCfg, "utf8"));
        zcfg.plugins = zcfg.plugins || {};
        zcfg.plugins.enabledPlugins = zcfg.plugins.enabledPlugins || {};
        for (const p of plugins) {
          zcfg.plugins.enabledPlugins[p] = enabled;
          zcfg.plugins.enabledPlugins[`${p}@z-plugin`] = enabled;
        }
        fs.writeFileSync(zcodeCfg, JSON.stringify(zcfg, null, 2) + "\n", "utf8");
      } catch {}
    }
  ' "$ENABLED_FLAG" "${PROCESSED_PLUGINS[@]}"
fi

if [ "$MODE" != "uninstall" ]; then
  (cd "$REPO_ROOT" && npm link --silent >/dev/null 2>&1 || true)
fi

echo -e "\n[SUCCESS] z-plugin suite is synchronized and active on Unix/macOS!"
