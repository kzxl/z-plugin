#!/usr/bin/env bash
# Universal Installer & Linker for z-plugin Monorepo (Linux / macOS)
# Supports Antigravity 2.0 & ZCode environments
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_DIR="$REPO_ROOT/plugins"
EXTENSIONS_DIR="$REPO_ROOT/extensions"

PLUGIN_TARGET="${1:-all}"
MODE="${2:-install}" # install | uninstall | dev

echo "=== AEOS z-plugin Monorepo Linker (Unix/macOS) ==="
echo "Repo root: $REPO_ROOT"

IDE_CONFIGS=(
  "$HOME/.gemini/config/plugins"
  "$HOME/.zcode/plugins"
)

EXTENSION_TARGETS=(
  "$HOME/.gemini/config/extensions"
  "$HOME/.zcode/extensions"
)

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

# 2. Process Core Plugins
for p_path in "$PLUGINS_DIR"/*; do
  if [ -d "$p_path" ]; then
    p_name="$(basename "$p_path")"
    if [ "$PLUGIN_TARGET" != "all" ] && [ "$PLUGIN_TARGET" != "$p_name" ]; then
      continue
    fi

    echo -e "\n--> Processing Core Plugin: $p_name"
    for ide_dir in "${IDE_CONFIGS[@]}"; do
      mkdir -p "$ide_dir"
      target_link="$ide_dir/$p_name"

      if [ "$MODE" = "uninstall" ]; then
        if [ -L "$target_link" ] || [ -d "$target_link" ]; then
          echo "Removing: $target_link"
          rm -rf "$target_link"
        fi
        continue
      fi

      rm -rf "$target_link"
      ln -s "$p_path" "$target_link"
      echo "  [Linked] $target_link -> $p_path"
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

        rm -rf "$target_link"
        ln -s "$ext_path" "$target_link"
        echo "  [Linked DLC] $target_link -> $ext_path"
      done
    fi
  done
fi

echo -e "\n[SUCCESS] z-plugin suite is successfully linked and active on Unix/macOS!"
