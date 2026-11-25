/**
 * Canonical Anti-Slop Linter & WCAG 2.1 Token Auditor (Z-Craft)
 * Enforces AS-01..AS-12, AS-C1..AS-C5, AS-I1, AS-D1..AS-D4, AS-S1
 * with comment/string-aware scanning, diff scoping, motion profiles,
 * inline suppressions (anti-slop-ignore), and WCAG 2.1 contrast math.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ERROR = "error";
const WARN = "warning";
const DEFAULT_PROFILE = "enterprise";
const PROFILES = new Set(["enterprise", "expressive"]);
const MIN_TEXT_CONTRAST = 4.5;
const MIN_NON_TEXT_CONTRAST = 3.0;
const DESKTOP_ROW_HEIGHT = { min: 24, max: 28 };
const PROJECT_RULE_FILE = ".project-rule.md";

const FAMILY_BY_EXTENSION = {
  ".css": "style",
  ".scss": "style",
  ".less": "style",
  ".html": "markup",
  ".htm": "markup",
  ".vue": "markup",
  ".svelte": "markup",
  ".tsx": "script",
  ".jsx": "script",
  ".ts": "script",
  ".js": "script",
  ".mjs": "script",
  ".cjs": "script",
  ".xaml": "xaml",
  ".cs": "csharp",
  ".resx": "resx"
};

const WEB_FAMILIES = new Set(["style", "markup", "script"]);
const DESKTOP_FAMILIES = new Set(["xaml", "csharp"]);
const CODE_FAMILIES = new Set(["markup", "script"]);

const LINE_COMMENT_EXTENSIONS = new Set([
  ".scss", ".less", ".html", ".htm", ".vue", ".svelte",
  ".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".cs"
]);
const BLOCK_COMMENT_EXTENSIONS = new Set([
  ".css", ".scss", ".less", ".html", ".htm", ".vue", ".svelte",
  ".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".cs"
]);
const MARKUP_COMMENT_EXTENSIONS = new Set([".html", ".htm", ".vue", ".svelte", ".xaml", ".resx"]);

const WALK_EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "bin", "obj", "coverage", "out",
  ".zero-token", ".zero-gate", ".zero-craft", ".z-plugin"
]);

const DIFF_EXCLUDED_PATH = /(?:^|\/)(?:node_modules|dist|build|bin|obj)\/|\.min\.|(?:^|\/)fixtures\/anti-slop\//;
const TOKEN_FILE_EXCLUDE = /(?:tailwind\.config\.|tokens\.|theme\.|colors\.|globals\.css|variables\.css)/i;
const FONT_FILE_EXCLUDE = /(?:theme|designer|tokens)/i;

const FORBIDDEN_ENTERPRISE_PLUGINS = [
  "ScrollSmoother",
  "SplitText",
  "ScrambleTextPlugin",
  "MorphSVGPlugin",
  "DrawSVGPlugin",
  "CustomBounce",
  "CustomWiggle",
  "Physics2DPlugin"
];

const GLOBAL_SELECTOR_PART = /^(?:\*.*|html|body|:root)$/i;

const PATTERNS = {
  arbitraryHex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
  cssVarDecl: /^\s*--[\w-]+\s*:/,
  csharpDirective: /^\s*#(?:if|else|elif|endif|region|endregion|define|undef|pragma|warning|error|nullable)\b/,
  rawDesktopColor: /Color\.FromArgb\(\s*\d+\s*,\s*255\s*,\s*0\s*,\s*255\s*\)/i,
  textShadowDeclaration: /(?:text-shadow|textShadow)\s*:/,
  textShadowUtility: /\btext-shadow-(?:2xs|xs|sm|md|lg|xl|\[)/,
  boxShadowDeclaration: /(?:box-shadow|boxShadow)\s*:\s*(.+)$/,
  arbitraryShadowUtility: /\bshadow-\[([^\]]+)\]/g,
  coloredShadowUtility: /\bshadow-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b/,
  oversizedShadowUtility: /\b(?:shadow-2xl|drop-shadow-2xl)\b/,
  dropShadowFilter: /\bdrop-shadow\(((?:[^()]|\([^()]*\))*)\)/g,
  xamlDropShadow: /<DropShadowEffect\b[^>]*\bColor\s*=\s*"([^"]+)"/,
  loopingCssAnimation: /\binfinit[e]\b/,
  animationKeyword: /animation/i,
  loopingUtility: /\banimate-(?:pulse|bounce|ping)\b/,
  spinnerContext: /spin|loader|loading|skeleton|busy|indeterminate|progress/i,
  layoutTransition: /\btransition(?:-property|Property)?\s*:\s*([^;]*)/,
  layoutTransitionUtility: /\btransition-\[[^\]]*\b(?:width|height|top|left|right|bottom|margin|padding)\b/,
  layoutPropertyName: /(?:^|[\s,'"])(?:(?:max-|min-)?(?:width|height)|top|left|right|bottom|margin[\w-]*|padding[\w-]*)\b/,
  gsapLayoutVar: /\b(?:width|height|top|left|right|bottom|margin\w*|padding\w*)\s*:/g,
  jsLoopingRepeat: /\b(?:repeat\s*:\s*(?:-1\b|Infinity\b)|iterations\s*:\s*Infinity\b)/,
  gsapImport: /\bfrom\s+['"]gsap(?:\/[\w-]+)?['"]|\bimport\s+['"]gsap(?:\/[\w-]+)?['"]|\brequire\(\s*['"]gsap(?:\/[\w-]+)?['"]\s*\)/,
  gsapCall: /\bgsap\s*\.\s*(?:to|from|fromTo|timeline|set|registerPlugin|matchMedia|context)\s*\(/,
  gsapTweenInEffect: /\bgsap\s*\.\s*(?:to|from|fromTo|timeline|set)\s*\(/g,
  tweenCall: /\b[\w$]+\s*\.\s*(?:to|from|fromTo)\s*\(/g,
  effectHook: /\buseEffect\s*\(/g,
  animationCleanup: /\.revert\s*\(|\bcontext\s*\(|\.kill\s*\(/,
  reducedMotionGate: /prefers-reduced-motion|matchMedia/,
  pluginImportContext: /\b(?:import|require|registerPlugin)\b/,
  scrollPin: /\bpin\s*:\s*true\b/,
  scrollScrub: /\bscrub\s*:/,
  smootherCreate: /\bScrollSmoother\s*\.\s*create\s*\(/,
  willChange: /will-change\s*:/,
  pillRadius: /\b9{3,}p[x]\b/,
  pillUtility: /\brounded-ful[l](?![\w-])/,
  pillTokenDefinition: /--[\w-]*pill[\w-]*\s*:/,
  pillAllowedContext: /avatar|count|counter|notif|unread|spinner|loader|dot|pip/i,
  emoji: /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/u,
  cssGradient: /\b(?:linear|radial|conic)-gradien[t]\s*\(/,
  gradientUtility: /\bbg-gradient-to-[trbl]|\bbg-(?:linear|radial|conic)\b/,
  gradientBrush: /\b(?:Linear|Radial)GradientBrus[h]\b/,
  winFormsGradient: /\bBackColor2\s*=|\bGradientMode\s*=/,
  rowHeight: /\b(?:RowHeight|RowTemplate\.Height)\s*=\s*"?(\d+)/,
  zebraStriping: /\bEnableAppearance(?:Even|Odd)Row\s*=\s*true\b|\bAlternationCount\s*=\s*"[2-9]"|\bAlternatingRowBackground\s*=|\bAlternatingRowsDefaultCellStyle\b/,
  backdropBlur: /(?:backdrop-filter|backdropFilter)\s*:|\bbackdrop-blu[r]\b/,
  removedOutline: /\boutline\s*:\s*['"]?(?:none|0)\b|\boutline-(?:non[e]|0)\b/,
  focusVisible: /focus-visible/,
  hiddenDesktopFocus: /\bFocusRectStyle\s*=\s*[\w.]*\bNon[e]\b|\bFocusVisualStyle\s*=\s*"\{x:Nul[l]\}"/,
  placeholderCopy: /\b(?:lorem\s+ipsum|dolor\s+sit\s+amet|john\s+doe|test@example\.com)\b/i,
  deadInteraction: /(?:onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}|href=["']#["']|href=["']javascript:void\(0\)["'])/i,
  hardcodedFont: /new\s+Font\s*\(\s*["'](?:Segoe UI|Arial|Tahoma|Microsoft Sans Serif)["']\s*,\s*\d+/i,
  trivialVerbComment: /^\s*(?:get|gets|set|sets|check|checks|return|returns|call|calls|handle|handles|loop|loops|init|initialize|initialise|create|creates|increment|iterate)\b/i,
  agentAttribution: /\b(?:added|modified|fixed|updated|changed|generated|created|written|refactored|edited)\s+(?:by|with|via)\s+(?:an?\s+)?(?:ai|agent|claude|gemini|gpt[\w.-]*|chatgpt|copilot|antigravity|cursor|llm)\b/i,
  agentBracketTag: /\[(?:ai|agent|claude|gemini|gpt|chatgpt|copilot|antigravity|cursor)\]|@(?:ai|agent|claude|gemini|copilot|antigravity)\b/i,
  agentName: /\b(?:ai|agent|claude|gemini|chatgpt|copilot|antigravity|cursor)\b/i,
  isoDate: /\b\d{4}-\d{2}-\d{2}\b/,
  suppression: /anti-slop-ignore\s+(AS-[A-Za-z0-9]+(?:\s*,\s*AS-[A-Za-z0-9]+)*)\s*(?::\s*(.*))?/
};

/**
 * Canonical catalog of all enforced Anti-Slop rules (used by zcraft_status & CLI)
 */
export const SLOP_RULES = [
  { id: "AS-01", name: "TOKEN_COLOR_DISCIPLINE", severity: ERROR, description: "Map UI colors to semantic design tokens; forbid arbitrary hex literals outside token/theme files." },
  { id: "AS-02", name: "NEUTRAL_ELEVATION_ONLY", severity: ERROR, description: "Use neutral black elevation tokens (--elevation-*) and 1px borders; forbid text-shadow, colored shadows, glows, and shadow-2xl." },
  { id: "AS-03", name: "MOTION_DISCIPLINE", severity: ERROR, description: "Motion runs once on compositor properties (transform/opacity) with reduced-motion gating, unmount cleanup, and enterprise GSAP allowlist." },
  { id: "AS-04", name: "RECTANGULAR_RADIUS", severity: ERROR, description: "Use --radius-xs/sm/md/lg; restrict pill radius (9999px / rounded-full) to avatars, counters, and active spinners." },
  { id: "AS-05", name: "NO_EMOJI_CHROME", severity: ERROR, description: "Use 16px project icons on nav/action bars and plain copy; forbid emoji in UI chrome." },
  { id: "AS-06", name: "FLAT_SURFACES", severity: ERROR, description: "Use flat solid surface tokens; forbid CSS, Tailwind, XAML, and WinForms gradients." },
  { id: "AS-07", name: "DENSE_GRID_BANDS", severity: WARN, description: "Keep desktop row heights within 24-28px (default 28px) and keep zebra striping opt-in only (AS-07z)." },
  { id: "AS-08", name: "WCAG_CONTRAST_OPAQUE", severity: ERROR, description: "Enforce WCAG 2.1 AA contrast (>=4.5:1 text, >=3:1 input/focus via --tokens) and forbid backdrop-blur glassmorphism." },
  { id: "AS-09", name: "VISIBLE_FOCUS_INDICATOR", severity: ERROR, description: "Preserve :focus-visible outlines on web and native focus cues on desktop." },
  { id: "AS-11", name: "REALISTIC_DOMAIN_COPY", severity: WARN, description: "Forbid Lorem ipsum and generic dummy placeholder data in components." },
  { id: "AS-I1", name: "NO_DEAD_INTERACTION", severity: ERROR, description: "Forbid no-op onClick handlers and href='#' / javascript:void(0) links." },
  { id: "AS-S1", name: "NO_NESTED_CARDS", severity: WARN, description: "Keep card containment to a single level; avoid nested <Card><Card> wrappers." },
  { id: "AS-D1", name: "DEVEXPRESS_BEGIN_UPDATE", severity: ERROR, description: "Wrap DevExpress GridView loop mutations in BeginUpdate()/EndUpdate() and never hold BeginUpdate across await." },
  { id: "AS-D2", name: "WINFORMS_WAIT_INDICATOR", severity: WARN, description: "Show SplashScreenManager overlay/wait form during async background work in WinForms controls." },
  { id: "AS-D3", name: "WPF_DISPATCHER_BLOCKING", severity: ERROR, description: "Forbid blocking Dispatcher.Invoke(...) inside async WPF methods; use await Dispatcher.InvokeAsync(...)." },
  { id: "AS-D4", name: "CENTRALIZED_DESKTOP_FONT", severity: WARN, description: "Avoid hardcoded new Font(...) outside centralized theme/designer definitions." },
  { id: "AS-C1", name: "SELF_DOCUMENTING_CODE", severity: WARN, description: "Forbid narrating comments that merely restate the code." },
  { id: "AS-C2", name: "NO_COMMENTED_DEAD_CODE", severity: ERROR, description: "Delete obsolete commented-out code; git preserves history." },
  { id: "AS-C3", name: "NO_AGENT_PROVENANCE_IN_SOURCE", severity: ERROR, description: "Keep AI/agent attribution and changelog dates in git history, not source comments." }
];

// ---------------------------------------------------------------------------
// Design Token Bridge
// ---------------------------------------------------------------------------

export function loadWorkspaceTokens(cwd = process.cwd()) {
  const homeDir = os.homedir();
  const tokenCandidates = [
    path.join(cwd, "tokens.json"),
    path.join(cwd, "tokens.md"),
    path.join(cwd, "globals.css"),
    path.join(cwd, "src", "styles", "globals.css"),
    path.join(cwd, "skills", "ui-design-system", "references", "tokens.md"),
    path.join(cwd, "theme.json"),
    path.join(homeDir, ".gemini", "config", "skills", "ui-design-system", "references", "tokens.md")
  ];

  const availableTokens = new Set([
    "--bg-canvas", "--bg-surface", "--bg-elevated", "--bg-hover",
    "--border-subtle", "--border-default", "--border-strong", "--border-input",
    "--brand-primary", "--text-primary", "--text-secondary", "--text-muted",
    "--success-fg", "--warning-fg", "--danger-fg", "--info-fg",
    "bg-background", "text-foreground", "bg-surface", "bg-card",
    "border-border", "bg-primary", "text-primary-foreground",
    "text-muted-foreground", "bg-muted", "text-accent", "bg-accent"
  ]);

  for (const p of tokenCandidates) {
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, "utf8");
        const matches = text.match(/(?:--(?:bg|text|border|brand|success|warning|danger|info|color|radius|elevation|duration|space|row|type)-[a-z0-9-]+|[a-z0-9-]+-(?:foreground|background|surface|primary|border|muted))/gi) || [];
        for (const m of matches) availableTokens.add(m);
      } catch {}
    }
  }

  return Array.from(availableTokens);
}

function suggestTokenForHex(hex) {
  const cleanHex = hex.toLowerCase().replace("#", "");
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3 || cleanHex.length === 4) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }

  if (r > 100 && b > 140 && g < 100) {
    return { token: "bg-primary", cssVar: "var(--brand-primary)" };
  }
  if (b > 150 && r < 120) {
    return { token: "bg-primary / text-info", cssVar: "var(--brand-primary) / var(--info-fg)" };
  }
  if (g > 140 && r < 120) {
    return { token: "text-success", cssVar: "var(--success-fg)" };
  }
  if (r > 170 && g < 110 && b < 110) {
    return { token: "text-destructive", cssVar: "var(--danger-fg)" };
  }
  if (Math.abs(r - g) <= 12 && Math.abs(g - b) <= 12) {
    if (r > 210) return { token: "bg-surface", cssVar: "var(--bg-surface)" };
    if (r < 60) return { token: "text-foreground / bg-canvas", cssVar: "var(--text-primary) / var(--bg-canvas)" };
    return { token: "border-border / text-muted-foreground", cssVar: "var(--border-default) / var(--text-muted)" };
  }
  return { token: "bg-surface / text-foreground", cssVar: "var(--bg-surface) / var(--text-primary)" };
}

// ---------------------------------------------------------------------------
// Source & Comment Scanning Helpers
// ---------------------------------------------------------------------------

function familyOf(filePath) {
  return FAMILY_BY_EXTENSION[path.extname(filePath).toLowerCase()] || null;
}

function isInsideQuotes(text, index) {
  let quote = null;
  for (let i = 0; i < index; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    }
  }
  return quote !== null;
}

function findCommentOpener(text, opener) {
  let idx = text.indexOf(opener);
  while (idx !== -1) {
    const isUrlScheme = opener === "//" && text[idx - 1] === ":";
    if (!isUrlScheme && !isInsideQuotes(text, idx)) return idx;
    idx = text.indexOf(opener, idx + 1);
  }
  return -1;
}

function scanComments(lines, ext) {
  const syntax = {
    line: LINE_COMMENT_EXTENSIONS.has(ext),
    block: BLOCK_COMMENT_EXTENSIONS.has(ext),
    markup: MARKUP_COMMENT_EXTENSIONS.has(ext)
  };
  let openBlock = null;

  return lines.map((line) => {
    const trimmed = line.trim();

    if (openBlock) {
      const closeIdx = line.indexOf(openBlock.closer);
      const info = {
        kind: openBlock.kind,
        isDoc: openBlock.isDoc,
        body: closeIdx === -1 ? line : line.slice(0, closeIdx),
        code: closeIdx === -1 ? "" : line.slice(closeIdx + openBlock.closer.length),
        trailing: ""
      };
      if (closeIdx !== -1) openBlock = null;
      return info;
    }

    if (syntax.line && trimmed.startsWith("//")) {
      return {
        kind: "line",
        isDoc: trimmed.startsWith("///"),
        body: trimmed.replace(/^\/{2,}/, ""),
        code: "",
        trailing: ""
      };
    }

    const blockStart = syntax.block ? trimmed.match(/^\{?\/\*/) : null;
    if (blockStart) {
      const isDoc = /^\{?\/\*\*(?!\/)/.test(trimmed);
      const rest = trimmed.slice(blockStart[0].length);
      const closeIdx = rest.indexOf("*/");
      if (closeIdx === -1) openBlock = { kind: "block", isDoc, closer: "*/" };
      return {
        kind: "block",
        isDoc,
        body: closeIdx === -1 ? rest : rest.slice(0, closeIdx),
        code: closeIdx === -1 ? "" : rest.slice(closeIdx + 2).replace(/^\s*\}/, ""),
        trailing: ""
      };
    }

    if (syntax.markup && trimmed.startsWith("<!--")) {
      const rest = trimmed.slice(4);
      const closeIdx = rest.indexOf("-->");
      if (closeIdx === -1) openBlock = { kind: "markup", isDoc: false, closer: "-->" };
      return {
        kind: "markup",
        isDoc: false,
        body: closeIdx === -1 ? rest : rest.slice(0, closeIdx),
        code: closeIdx === -1 ? "" : rest.slice(closeIdx + 3),
        trailing: ""
      };
    }

    const openers = [];
    if (syntax.line) openers.push({ opener: "//", closer: null, kind: "line" });
    if (syntax.block) openers.push({ opener: "/*", closer: "*/", kind: "block" });
    if (syntax.markup) openers.push({ opener: "<!--", closer: "-->", kind: "markup" });

    let first = null;
    for (const candidate of openers) {
      const idx = findCommentOpener(line, candidate.opener);
      if (idx !== -1 && (!first || idx < first.idx)) first = { ...candidate, idx };
    }

    if (!first) return { kind: null, isDoc: false, body: "", code: line, trailing: "" };

    let code = line.slice(0, first.idx);
    let trailing = line.slice(first.idx + first.opener.length);
    if (first.closer) {
      const closeIdx = trailing.indexOf(first.closer);
      if (closeIdx === -1) {
        openBlock = { kind: first.kind, isDoc: false, closer: first.closer };
      } else {
        code += " " + trailing.slice(closeIdx + first.closer.length);
        trailing = trailing.slice(0, closeIdx);
      }
    }
    return { kind: null, isDoc: false, body: "", code, trailing };
  });
}

export function sanitizeSource(content) {
  let clean = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "));
  clean = clean.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, " "));
  clean = clean.replace(/(?<!:)\/\/[^\r\n]*/g, (m) => " ".repeat(m.length));
  return clean;
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function lineNumberAt(offsets, index) {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

function findMatchingDelimiter(text, openIndex, openCh, closeCh) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

function findCallRanges(text, callPattern) {
  const ranges = [];
  const pattern = new RegExp(callPattern.source, "g");
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const openIndex = match.index + match[0].length - 1;
    ranges.push({ start: match.index, end: findMatchingDelimiter(text, openIndex, "(", ")") });
  }
  return ranges;
}

function extractSelector(code, previousCodeLine) {
  const braceIdx = code.lastIndexOf("{");
  let selector = code.slice(0, braceIdx);
  const boundary = Math.max(selector.lastIndexOf("}"), selector.lastIndexOf(";"));
  selector = selector.slice(boundary + 1).trim();
  return selector || previousCodeLine.trim();
}

function isGlobalSelector(selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .some((part) => GLOBAL_SELECTOR_PART.test(part));
}

// ---------------------------------------------------------------------------
// Color Math (WCAG 2.1)
// ---------------------------------------------------------------------------

export function parseColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (v === "black") return { r: 0, g: 0, b: 0, a: 1 };

  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits.split("").map((d) => d + d).join("");
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    };
  }

  const rgb = v.match(/^rgba?\(\s*([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const alpha = parts[3] === undefined
      ? 1
      : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const color = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
    return [color.r, color.g, color.b, color.a].some(Number.isNaN) ? null : color;
  }
  return null;
}

function compositeOver(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1
  };
}

function relativeLuminance(color) {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function toOpaque(color) {
  return color.a < 1 ? compositeOver(color, { r: 255, g: 255, b: 255, a: 1 }) : color;
}

export function contrastRatio(colorA, colorB) {
  const a = typeof colorA === "string" ? parseColor(colorA) : colorA;
  const b = typeof colorB === "string" ? parseColor(colorB) : colorB;
  if (!a || !b) {
    throw new TypeError(`Unsupported color value: ${!a ? colorA : colorB}`);
  }
  const la = relativeLuminance(toOpaque(a));
  const lb = relativeLuminance(toOpaque(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function isNeutralBlack(colorText) {
  const color = parseColor(colorText);
  if (color) return color.r === 0 && color.g === 0 && color.b === 0;
  const hsl = colorText.toLowerCase().match(/^hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%/);
  if (hsl) return parseFloat(hsl[1]) === 0;
  return colorText.toLowerCase() === "transparent";
}

// ---------------------------------------------------------------------------
// Shadow Analysis (AS-02)
// ---------------------------------------------------------------------------

const SHADOW_COLOR_TOKEN = /rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g;
const NAMED_SHADOW_COLOR = /^(?:red|orange|yellow|green|blue|indigo|violet|purple|pink|cyan|magenta|teal|lime|gold|white|gray|grey|silver)$/i;

function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function extractDeclarationValue(rawValue) {
  let value = rawValue.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const closeIdx = value.indexOf(quote, 1);
    return closeIdx === -1 ? value.slice(1) : value.slice(1, closeIdx);
  }
  value = value.split(/[;}]/)[0];
  return value.replace(/!important/i, "").trim();
}

function analyzeShadowValue(value) {
  for (const shadow of splitTopLevel(value, ",")) {
    const colors = shadow.match(SHADOW_COLOR_TOKEN) || [];
    const words = shadow.replace(SHADOW_COLOR_TOKEN, " ").split(/\s+/).filter(Boolean);
    const namedColors = words.filter((w) => NAMED_SHADOW_COLOR.test(w));
    const coloredShadow = colors.some((c) => !isNeutralBlack(c)) || namedColors.length > 0;
    if (coloredShadow) return "colored shadow; use neutral black --elevation-* tokens";

    const isInset = words.some((w) => w.toLowerCase() === "inset");
    const lengths = words
      .filter((w) => /^-?\d*\.?\d+(?:px|rem|em)?$/.test(w))
      .map(parseFloat);
    if (!isInset && lengths.length >= 3 && lengths[0] === 0 && lengths[1] === 0 && lengths[2] > 0) {
      return "zero-offset blurred shadow (glow); use --elevation-* tokens";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comment Hygiene Heuristics (AS-C1, AS-C2, AS-C3)
// ---------------------------------------------------------------------------

function looksLikeCode(body) {
  const text = body.replace(/\*\/\s*$/, "").replace(/-->\s*$/, "").replace(/^\s*\*\s?/, "").trim();
  if (text.length < 3) return false;
  if (/^[-=*#~_+/\\\s]+$/.test(text)) return false;
  if (/^(?:TODO|FIXME|NOTE|HACK|XXX|WORKAROUND|SAFETY)\b/i.test(text)) return false;
  if (/^anti-slop-ignore\b/.test(text) || /^https?:\/\//i.test(text)) return false;
  if (/^<\/?[A-Za-z][\w.:-]*(?:\s[^>]*)?\/?>/.test(text)) return true;
  if (/[;{}]\s*$/.test(text)) return true;
  if (/^[\w$]+(?:\.[\w$]+)*\s*\([^()]*\)\s*;?$/.test(text)) return true;

  const assignment = text.match(/^((?:(?:const|let|var)\s+)?[A-Za-z_$][\w$.[\]]*)\s*[+\-*/]?=\s*([^=\s>].*)$/);
  if (!assignment) return false;
  const codeLikeTarget = /^(?:const|let|var)\s|^[a-z_$]|[.[]/.test(assignment[1]);
  return codeLikeTarget && !/[A-Za-z]+\s+[A-Za-z]+\s+[A-Za-z]+/.test(assignment[2]);
}

function hasAgentMetadata(rawLine, commentText) {
  if (PATTERNS.agentAttribution.test(rawLine)) return true;
  if (!commentText) return false;
  if (PATTERNS.agentBracketTag.test(commentText)) return true;
  return PATTERNS.isoDate.test(commentText) && PATTERNS.agentName.test(commentText);
}

// ---------------------------------------------------------------------------
// Inline Suppression (anti-slop-ignore <ID>: <reason>)
// ---------------------------------------------------------------------------

function parseSuppression(rawLine) {
  const match = rawLine.match(PATTERNS.suppression);
  if (!match) return null;
  const ids = match[1].split(",").map((id) => id.trim());
  const reason = (match[2] || "").replace(/\s*(?:\*\/\s*\}?|-->)\s*$/, "").trim();
  return { ids, reason };
}

function suppressionCovers(suppressionId, finding) {
  if (suppressionId === finding.ruleId) return true;
  if (finding.ruleId.startsWith(suppressionId) && /^[a-z]$/.test(finding.ruleId.slice(suppressionId.length))) {
    return true;
  }
  return Array.isArray(finding.related) && finding.related.includes(suppressionId);
}

function applySuppressions(rawFindings, lines, changedLines) {
  const inScope = (lineNumber) => !changedLines || changedLines.has(lineNumber);
  const unique = new Map();
  for (const finding of rawFindings) {
    const key = `${finding.ruleId}:${finding.line}`;
    if (inScope(finding.line) && !unique.has(key)) unique.set(key, finding);
  }

  const violations = [];
  const suppressions = [];
  const suppressionByLine = new Map();

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (!inScope(lineNumber)) return;
    const suppression = parseSuppression(raw);
    if (!suppression) return;
    if (!suppression.reason) {
      violations.push({
        ruleId: "AS-SUPPRESS",
        id: "AS-SUPPRESS",
        name: "SUPPRESSION_WITHOUT_REASON",
        severity: ERROR,
        line: lineNumber,
        column: raw.indexOf("anti-slop-ignore") + 1,
        matched: raw.trim().slice(0, 80),
        message: "Suppression without a reason; write anti-slop-ignore <ID>: <reason>.",
        fixHint: "Add a concrete justification after the colon (e.g. anti-slop-ignore AS-06: brand hero banner)."
      });
      return;
    }
    const entry = { line: lineNumber, ids: suppression.ids, reason: suppression.reason, suppressed: [] };
    suppressions.push(entry);
    suppressionByLine.set(lineNumber, entry);
  });

  for (const finding of unique.values()) {
    const entry = suppressionByLine.get(finding.line);
    if (entry && entry.ids.some((id) => suppressionCovers(id, finding))) {
      entry.suppressed.push(finding.ruleId);
    } else {
      violations.push(finding);
    }
  }

  violations.sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
  return { violations, suppressions };
}

// ---------------------------------------------------------------------------
// Desktop ERP Scoped Analyzers (AS-D1..AS-D3)
// ---------------------------------------------------------------------------

function analyzeCSharpDesktop(cleanSource, lineOffsets, report) {
  // AS-D1: DevExpress GridView mutations inside loops without enclosing BeginUpdate()
  const loopPattern = /\b(?:for|foreach|while)\s*\([^)]*\)\s*\{/g;
  let loopMatch;
  while ((loopMatch = loopPattern.exec(cleanSource)) !== null) {
    const openBrace = loopMatch.index + loopMatch[0].length - 1;
    const closeBrace = findMatchingDelimiter(cleanSource, openBrace, "{", "}");
    const loopBody = cleanSource.slice(openBrace, closeBrace + 1);
    const gridMutMatch = loopBody.match(/\b(gridView\w*|gridControl\w*|gv\w*)\.(?:SetRowCellValue|AddNewRow|DeleteRow)\b/i);
    if (!gridMutMatch) continue;

    // Inspect preceding 1000 chars for an active BeginUpdate() without an intervening EndUpdate()
    const beforeLoop = cleanSource.slice(Math.max(0, loopMatch.index - 1000), loopMatch.index);
    const lastBegin = beforeLoop.lastIndexOf(".BeginUpdate(");
    const lastEnd = beforeLoop.lastIndexOf(".EndUpdate(");
    if (lastBegin === -1 || lastEnd > lastBegin) {
      const line = lineNumberAt(lineOffsets, loopMatch.index);
      report("AS-D1", "DEVEXPRESS_BEGIN_UPDATE", ERROR, line, 1, gridMutMatch[0],
        "Modifying DevExpress GridControl/GridView inside a loop without wrapping in BeginUpdate() / EndUpdate().",
        "Wrap the loop in gridControl.BeginUpdate(); try { ... } finally { gridControl.EndUpdate(); }.");
    }
  }

  // AS-D1 (async lock): BeginUpdate() held across an await call
  const beginPattern = /\b(\w+)\.BeginUpdate\s*\(\s*\)/g;
  let beginMatch;
  while ((beginMatch = beginPattern.exec(cleanSource)) !== null) {
    const varName = beginMatch[1];
    const endRegex = new RegExp(`\\b${varName}\\.EndUpdate\\s*\\(\\s*\\)`);
    const afterBegin = cleanSource.slice(beginMatch.index + beginMatch[0].length);
    const endIdx = afterBegin.search(endRegex);
    if (endIdx !== -1) {
      const lockedRegion = afterBegin.slice(0, endIdx);
      if (/\bawait\s+/.test(lockedRegion)) {
        const line = lineNumberAt(lineOffsets, beginMatch.index);
        report("AS-D1", "DEVEXPRESS_BEGIN_UPDATE", ERROR, line, 1, beginMatch[0],
          "BeginUpdate() is held across an await expression, freezing grid rendering during I/O.",
          "Await asynchronous I/O first, then call BeginUpdate() strictly around synchronous UI mutation.");
      }
    }
  }

  // AS-D2: WinForms async Task.Run / BackgroundWorker inside Form/Control without wait overlay
  const isUiClass = /:\s*(?:[\w.]+\.)?(?:Xtra)?(?:Form|UserControl|Control)\b/.test(cleanSource);
  if (isUiClass) {
    const bgMatch = cleanSource.match(/\b(?:await\s+Task\.Run|BackgroundWorker)\b/);
    if (bgMatch && !/(?:SplashScreenManager|ShowWaitForm|ShowOverlayForm)/.test(cleanSource)) {
      const line = lineNumberAt(lineOffsets, bgMatch.index);
      report("AS-D2", "WINFORMS_WAIT_INDICATOR", WARN, line, 1, bgMatch[0],
        "Background work inside a WinForms Form/Control without a wait indicator overlay.",
        "Display a non-blocking overlay via SplashScreenManager.ShowOverlayForm(this) with cleanup in finally.");
    }
  }

  // AS-D3: Blocking Dispatcher.Invoke(...) strictly inside an async method body
  const asyncMethodPattern = /\basync\s+(?:Task(?:<[^>]+>)?|ValueTask(?:<[^>]+>)?|void)\s+\w+\s*\([^)]*\)\s*\{/g;
  let asyncMatch;
  while ((asyncMatch = asyncMethodPattern.exec(cleanSource)) !== null) {
    const openBrace = asyncMatch.index + asyncMatch[0].length - 1;
    const closeBrace = findMatchingDelimiter(cleanSource, openBrace, "{", "}");
    const methodBody = cleanSource.slice(openBrace, closeBrace + 1);
    const invokeMatch = methodBody.match(/\bDispatcher\.Invoke\s*\(/);
    if (invokeMatch) {
      const line = lineNumberAt(lineOffsets, openBrace + invokeMatch.index);
      report("AS-D3", "WPF_DISPATCHER_BLOCKING", ERROR, line, 1, invokeMatch[0],
        "Blocking Dispatcher.Invoke(...) called inside an async method, risking UI thread deadlocks.",
        "Replace with 'await Dispatcher.InvokeAsync(...)'.");
    }
  }
}

// ---------------------------------------------------------------------------
// Core Linter Engine
// ---------------------------------------------------------------------------

function isColorHexMatch(code, matchIndex, matched) {
  const before = code.slice(Math.max(0, matchIndex - 20), matchIndex);
  if (/(?:href|src|to|id|url)\s*[:=(]\s*['"]?$/i.test(before)) return false;
  if (code[matchIndex - 1] && /[A-Za-z0-9_-]/.test(code[matchIndex - 1])) return false;

  const digits = matched.slice(1);
  if (digits.length === 3) {
    // 3-char hex without digits (e.g. #add, #bad, #cab, #def) requires explicit color context
    if (!/\d/.test(digits) && !/(?:color|background|fill|stroke|border|bg-|text-|style)/i.test(code)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve ui_profile from nearest .project-rule.md frontmatter
 */
export function resolveProfile(startPath = process.cwd()) {
  let dir = path.resolve(startPath);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  while (true) {
    const candidate = path.join(dir, PROJECT_RULE_FILE);
    if (fs.existsSync(candidate)) {
      try {
        const text = fs.readFileSync(candidate, "utf8");
        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fm) {
          const m = fm[1].match(/^ui_profile\s*:\s*['"]?([a-z]+)['"]?/m);
          if (m && PROFILES.has(m[1])) return m[1];
        }
      } catch {}
      return DEFAULT_PROFILE;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return DEFAULT_PROFILE;
    dir = parent;
  }
}

/**
 * Lint string content for canonical Anti-Slop violations.
 * optionsOrCwd can be a cwd string (legacy) or { cwd, profile, changedLines }.
 */
export function lintUiContent(content, filename = "snippet.tsx", optionsOrCwd = process.cwd()) {
  const options = typeof optionsOrCwd === "string"
    ? { cwd: optionsOrCwd }
    : (optionsOrCwd || {});
  const cwd = options.cwd || process.cwd();
  const profile = PROFILES.has(options.profile) ? options.profile : DEFAULT_PROFILE;
  const isEnterprise = profile === "enterprise";
  const changedLines = options.changedLines instanceof Set ? options.changedLines : null;

  const ext = path.extname(filename).toLowerCase() || ".tsx";
  const family = familyOf(filename) || "script";
  const isWeb = WEB_FAMILIES.has(family);
  const isCode = CODE_FAMILIES.has(family);
  const isDesktop = DESKTOP_FAMILIES.has(family);
  const skipHexFile = TOKEN_FILE_EXCLUDE.test(filename);
  const skipFontFile = FONT_FILE_EXCLUDE.test(filename);

  const source = String(content || "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const scanned = scanComments(lines, ext);
  const cleanSource = scanned.map((s) => s.code).join("\n");
  const lineOffsets = buildLineOffsets(cleanSource);

  const importsGsap = PATTERNS.gsapImport.test(cleanSource);
  const usesGsap = importsGsap || PATTERNS.gsapCall.test(cleanSource);
  const hasFocusVisible = PATTERNS.focusVisible.test(cleanSource);

  const rawFindings = [];
  const report = (ruleId, name, severity, line, column, matched, message, fixHint, extra = {}) => {
    rawFindings.push({
      ruleId,
      id: ruleId,
      name,
      severity,
      line,
      column: Math.max(1, column),
      matched: String(matched || "").trim().slice(0, 80),
      message,
      fixHint,
      ...extra
    });
  };

  let currentSelector = "";
  let previousCodeLine = "";
  let cardDepth = 0;

  scanned.forEach((info, index) => {
    const lineNumber = index + 1;
    const raw = lines[index];
    const code = info.code;
    const codeCol = (pattern) => {
      const m = code.match(pattern);
      return m ? raw.indexOf(m[0]) + 1 : 1;
    };

    if (code.includes("{") && (family === "style" || family === "markup")) {
      currentSelector = extractSelector(code, previousCodeLine);
    }
    const nearbyContext = [...lines.slice(Math.max(0, index - 4), index), code].join(" ");

    if (code.trim()) {
      // AS-01: Arbitrary hardcoded hex colors (outside token/theme files & CSS var declarations)
      if (!skipHexFile && !PATTERNS.cssVarDecl.test(code) && !PATTERNS.csharpDirective.test(code)) {
        const hexRe = new RegExp(PATTERNS.arbitraryHex.source, "g");
        let hexMatch;
        while ((hexMatch = hexRe.exec(code)) !== null) {
          if (!isColorHexMatch(code, hexMatch.index, hexMatch[0])) continue;
          const suggestion = suggestTokenForHex(hexMatch[0]);
          report("AS-01", "TOKEN_COLOR_DISCIPLINE", ERROR, lineNumber, raw.indexOf(hexMatch[0]) + 1, hexMatch[0],
            "Arbitrary hardcoded hex color detected outside token/theme files.",
            `Replace '${hexMatch[0]}' with semantic token '${suggestion.token}' or '${suggestion.cssVar}'.`);
        }
      }

      // AS-05: Emoji in UI chrome/copy (all UI families)
      if (PATTERNS.emoji.test(code)) {
        const m = code.match(PATTERNS.emoji);
        report("AS-05", "NO_EMOJI_CHROME", ERROR, lineNumber, codeCol(PATTERNS.emoji), m[0],
          "Emoji in UI chrome or copy; use 16px project icons and plain text (AS-05 / AS-11).",
          "Remove emoji and use a 16px SVG icon from the project icon set or plain text.",
          { related: ["AS-11"] });
      }

      // AS-11: Generic placeholder copy
      if (PATTERNS.placeholderCopy.test(code)) {
        const m = code.match(PATTERNS.placeholderCopy);
        report("AS-11", "REALISTIC_DOMAIN_COPY", WARN, lineNumber, codeCol(PATTERNS.placeholderCopy), m[0],
          "Dummy placeholder copy detected in component source.",
          "Use realistic domain-specific enterprise data (e.g. INV-2026-001).");
      }

      // AS-I1: Dead interactions
      if (isWeb && PATTERNS.deadInteraction.test(code)) {
        const m = code.match(PATTERNS.deadInteraction);
        report("AS-I1", "NO_DEAD_INTERACTION", ERROR, lineNumber, codeCol(PATTERNS.deadInteraction), m[0],
          "Dead button handler or no-op anchor detected.",
          "Wire a real handler, loading state, or explicit disabled button with tooltip.");
      }

      // AS-S1: Nested <Card><Card> containment check
      if (isCode) {
        const openCards = (code.match(/<Card(?:\s|>|$)/g) || []).length;
        const selfClosingCards = (code.match(/<Card\b[^>]*\/>/g) || []).length;
        const closeCards = (code.match(/<\/Card>/g) || []).length;
        const netOpens = Math.max(0, openCards - selfClosingCards);
        if (cardDepth >= 1 && openCards > 0) {
          report("AS-S1", "NO_NESTED_CARDS", WARN, lineNumber, code.indexOf("<Card") + 1, "<Card>",
            "Nested Card container detected; keep card containment to one level.",
            "Group inner regions with whitespace or 1px --border-subtle dividers.");
        }
        cardDepth = Math.max(0, cardDepth + netOpens - closeCards);
      }

      if (isWeb) checkWebLine();
      if (isDesktop) checkDesktopLine();
      previousCodeLine = code;
    }

    checkCommentLine();

    function checkWebLine() {
      // AS-02: Elevation & shadow rules
      if (PATTERNS.textShadowDeclaration.test(code) || PATTERNS.textShadowUtility.test(code)) {
        report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, codeCol(PATTERNS.textShadowDeclaration), "text-shadow",
          "Text shadow is forbidden; express hierarchy via size, weight, and text tokens.",
          "Remove text-shadow and use --type-* scale with --text-primary.");
      }
      const boxShadow = code.match(PATTERNS.boxShadowDeclaration);
      if (boxShadow) {
        const reason = analyzeShadowValue(extractDeclarationValue(boxShadow[1]));
        if (reason) {
          report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, codeCol(PATTERNS.boxShadowDeclaration), boxShadow[0],
            `Box shadow violation: ${reason}.`,
            "Use --elevation-0, --elevation-1, or --elevation-overlay (neutral black only).");
        }
      }
      for (const m of code.matchAll(PATTERNS.arbitraryShadowUtility)) {
        const reason = analyzeShadowValue(m[1].replace(/_/g, " "));
        if (reason) {
          report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, raw.indexOf(m[0]) + 1, m[0],
            `Shadow utility violation: ${reason}.`,
            "Replace with 1px border-border or neutral --elevation-* shadow.");
        }
      }
      for (const m of code.matchAll(PATTERNS.dropShadowFilter)) {
        const reason = analyzeShadowValue(m[1]);
        if (reason) {
          report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, raw.indexOf(m[0]) + 1, m[0],
            `Drop shadow violation: ${reason}.`,
            "Use neutral black --elevation-* tokens.");
        }
      }
      if (PATTERNS.coloredShadowUtility.test(code)) {
        const m = code.match(PATTERNS.coloredShadowUtility);
        report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, codeCol(PATTERNS.coloredShadowUtility), m[0],
          "Colored ambient shadow utility detected.",
          "Use 1px border (border-border) or neutral elevation (shadow-xs / shadow-sm).");
      }
      if (PATTERNS.oversizedShadowUtility.test(code)) {
        const m = code.match(PATTERNS.oversizedShadowUtility);
        report("AS-02", "NEUTRAL_ELEVATION_ONLY", WARN, lineNumber, codeCol(PATTERNS.oversizedShadowUtility), m[0],
          "Oversized floaty drop shadow detected.",
          "Use crisp 1px borders (border border-border) and --elevation-0/1.");
      }

      // AS-03: Motion rules
      const loopingCss = PATTERNS.loopingCssAnimation.test(code) && PATTERNS.animationKeyword.test(code);
      if (loopingCss) {
        const allowCtx = family === "style" && currentSelector ? currentSelector : `${currentSelector} ${nearbyContext}`;
        if (!PATTERNS.spinnerContext.test(allowCtx)) {
          report("AS-03", "MOTION_DISCIPLINE", ERROR, lineNumber, codeCol(PATTERNS.loopingCssAnimation), "infinite",
            "Looping CSS animation on an idle element; motion runs once.",
            "Remove infinite loop or restrict strictly to active I/O spinner/skeleton.");
        }
      }
      if (PATTERNS.loopingUtility.test(code) && !PATTERNS.spinnerContext.test(nearbyContext)) {
        const m = code.match(PATTERNS.loopingUtility);
        report("AS-03", "MOTION_DISCIPLINE", ERROR, lineNumber, codeCol(PATTERNS.loopingUtility), m[0],
          "Looping animation utility on an idle element; motion runs once.",
          "Restrict animate-pulse/bounce/ping strictly to active loading skeletons or spinners.");
      }
      const transition = code.match(PATTERNS.layoutTransition);
      if ((transition && PATTERNS.layoutPropertyName.test(` ${transition[1]}`)) || PATTERNS.layoutTransitionUtility.test(code)) {
        report("AS-03a", "COMPOSITOR_ONLY_MOTION", WARN, lineNumber, codeCol(PATTERNS.layoutTransition),
          (transition && transition[0]) || "layout-transition",
          "Transition on a layout property triggers reflow; animate transform or opacity only.",
          "Use transform (e.g. scaleX for progress bars) or opacity with --duration-fast/base/data.");
      }
      if (isCode && PATTERNS.jsLoopingRepeat.test(code)) {
        const m = code.match(PATTERNS.jsLoopingRepeat);
        report("AS-03b", "NO_ENDLESS_JS_LOOP", isEnterprise ? ERROR : WARN, lineNumber, codeCol(PATTERNS.jsLoopingRepeat), m[0],
          isEnterprise
            ? "Endless JS animation loop forbidden in enterprise profile."
            : "Endless JS animation loop must pause off-screen and respect prefers-reduced-motion.",
          "Use one-shot animation triggered by user action or active I/O.");
      }
      if (isCode && usesGsap && isEnterprise) {
        const forbiddenPlugin = PATTERNS.pluginImportContext.test(code)
          && FORBIDDEN_ENTERPRISE_PLUGINS.find((name) => new RegExp(`\\b${name}\\b`).test(code));
        if (forbiddenPlugin) {
          report("AS-03e", "GSAP_ENTERPRISE_ALLOWLIST", ERROR, lineNumber, raw.indexOf(forbiddenPlugin) + 1, forbiddenPlugin,
            `GSAP plugin '${forbiddenPlugin}' is forbidden in the enterprise profile.`,
            "Use allowed enterprise primitives (one-shot tween, Flip, Draggable) or set ui_profile: expressive.");
        } else if (PATTERNS.smootherCreate.test(code)) {
          report("AS-03e", "GSAP_ENTERPRISE_ALLOWLIST", ERROR, lineNumber, codeCol(PATTERNS.smootherCreate), "ScrollSmoother.create",
            "ScrollSmoother is forbidden in the enterprise profile.",
            "Preserve native scroll behavior for data-dense enterprise screens.");
        }
        if (PATTERNS.scrollPin.test(code) || PATTERNS.scrollScrub.test(code)) {
          const hit = PATTERNS.scrollPin.test(code) ? PATTERNS.scrollPin : PATTERNS.scrollScrub;
          report("AS-03e", "GSAP_ENTERPRISE_ALLOWLIST", ERROR, lineNumber, codeCol(hit), code.match(hit)[0],
            "ScrollTrigger pin/scrub hijacks navigation and is forbidden in enterprise profile.",
            "Remove pin/scrub or switch to IntersectionObserver + CSS one-shot transition.");
        }
      }
      if (PATTERNS.willChange.test(code)) {
        const selector = code.includes("{") ? extractSelector(code, previousCodeLine) : currentSelector;
        if (isGlobalSelector(selector)) {
          report("AS-03f", "SCOPED_WILL_CHANGE", WARN, lineNumber, codeCol(PATTERNS.willChange), "will-change",
            "will-change declared on a global selector wastes GPU memory.",
            "Apply will-change only to specific elements while actively animating.");
        }
      }

      // AS-04: Pill radius restriction
      const pill = code.match(PATTERNS.pillRadius) || code.match(PATTERNS.pillUtility);
      if (pill && !PATTERNS.pillTokenDefinition.test(code)) {
        const pillCtx = `${currentSelector} ${lines[index - 1] || ""} ${code}`;
        if (!PATTERNS.pillAllowedContext.test(pillCtx)) {
          report("AS-04", "RECTANGULAR_RADIUS", ERROR, lineNumber, raw.indexOf(pill[0]) + 1, pill[0],
            "Pill radius used outside avatars, counters, or spinners.",
            "Use --radius-sm (4px) for badges/chips, --radius-md (6px) for controls, --radius-lg (8px) for cards.");
        }
      }

      // AS-06: Gradients forbidden on flat surfaces
      if (PATTERNS.cssGradient.test(code) || PATTERNS.gradientUtility.test(code)) {
        const hit = PATTERNS.cssGradient.test(code) ? PATTERNS.cssGradient : PATTERNS.gradientUtility;
        report("AS-06", "FLAT_SURFACES", ERROR, lineNumber, codeCol(hit), code.match(hit)[0],
          "Gradient fill detected; surfaces and progress bars must stay flat.",
          "Use solid neutral tokens (--bg-surface, --bg-elevated) or --brand-primary.");
      }

      // AS-08: Glassmorphism backdrop-blur forbidden
      if (PATTERNS.backdropBlur.test(code)) {
        const m = code.match(PATTERNS.backdropBlur);
        report("AS-08", "WCAG_CONTRAST_OPAQUE", ERROR, lineNumber, codeCol(PATTERNS.backdropBlur), m[0],
          "Backdrop blur (glassmorphism) degrades text contrast.",
          "Use an opaque surface token (>= 90% opacity) with 1px --border-default.");
      }

      // AS-09: Focus outline removal without :focus-visible
      if (!hasFocusVisible && PATTERNS.removedOutline.test(code)) {
        const m = code.match(PATTERNS.removedOutline);
        report("AS-09", "VISIBLE_FOCUS_INDICATOR", ERROR, lineNumber, codeCol(PATTERNS.removedOutline), m[0],
          "Focus outline removed without a :focus-visible replacement in this file.",
          "Keep default focus outline or add :focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }.");
      }
    }

    function checkDesktopLine() {
      if (PATTERNS.rawDesktopColor.test(code)) {
        const m = code.match(PATTERNS.rawDesktopColor);
        report("AS-01", "TOKEN_COLOR_DISCIPLINE", ERROR, lineNumber, codeCol(PATTERNS.rawDesktopColor), m[0],
          "Unskinned raw desktop color detected.",
          "Bind to DevExpress SkinPalette or centralized EnterpriseTheme resource tokens.");
      }
      if (PATTERNS.gradientBrush.test(code) || PATTERNS.winFormsGradient.test(code)) {
        const hit = PATTERNS.gradientBrush.test(code) ? PATTERNS.gradientBrush : PATTERNS.winFormsGradient;
        report("AS-06", "FLAT_SURFACES", ERROR, lineNumber, codeCol(hit), code.match(hit)[0],
          "Desktop gradient brush detected; surfaces must stay flat.",
          "Use SolidColorBrush or flat EnterpriseTheme surface colors.");
      }
      const rowHeight = code.match(PATTERNS.rowHeight);
      if (rowHeight) {
        const h = parseInt(rowHeight[1], 10);
        if (h < DESKTOP_ROW_HEIGHT.min || h > DESKTOP_ROW_HEIGHT.max) {
          report("AS-07", "DENSE_GRID_BANDS", WARN, lineNumber, codeCol(PATTERNS.rowHeight), rowHeight[0],
            `Desktop row height ${h}px is outside the ${DESKTOP_ROW_HEIGHT.min}-${DESKTOP_ROW_HEIGHT.max}px band.`,
            "Set RowHeight to 28 (or within 24-28px) for dense ERP desktop grids.");
        }
      }
      if (PATTERNS.zebraStriping.test(code)) {
        const m = code.match(PATTERNS.zebraStriping);
        report("AS-07z", "ZEBRA_OPT_IN_ONLY", WARN, lineNumber, codeCol(PATTERNS.zebraStriping), m[0],
          "Zebra striping enabled; default is off unless read-only grid has >= 8 visible columns.",
          "Use 1px --border-subtle horizontal dividers + hover highlight, or add anti-slop-ignore AS-07z: >=8 readonly columns.");
      }
      if (PATTERNS.hiddenDesktopFocus.test(code)) {
        const m = code.match(PATTERNS.hiddenDesktopFocus);
        report("AS-09", "VISIBLE_FOCUS_INDICATOR", ERROR, lineNumber, codeCol(PATTERNS.hiddenDesktopFocus), m[0],
          "Native desktop focus cue disabled.",
          "Keep platform focus rectangle visible for keyboard operators.");
      }
      const dropShadow = code.match(PATTERNS.xamlDropShadow);
      if (dropShadow && !isNeutralBlack(dropShadow[1]) && !/^#?(?:FF)?000000$/i.test(dropShadow[1]) && dropShadow[1].toLowerCase() !== "black") {
        report("AS-02", "NEUTRAL_ELEVATION_ONLY", ERROR, lineNumber, codeCol(PATTERNS.xamlDropShadow), dropShadow[0],
          "Colored XAML DropShadowEffect detected.",
          "Use neutral black elevation or 1px border.");
      }
      if (!skipFontFile && PATTERNS.hardcodedFont.test(code)) {
        const m = code.match(PATTERNS.hardcodedFont);
        report("AS-D4", "CENTRALIZED_DESKTOP_FONT", WARN, lineNumber, codeCol(PATTERNS.hardcodedFont), m[0],
          "Hardcoded Font instantiation outside centralized theme/designer files.",
          "Use WindowsFormsSettings.DefaultFont or centralized EnterpriseTheme font tokens.");
      }
    }

    function checkCommentLine() {
      const commentText = info.kind ? info.body : info.trailing;
      if (hasAgentMetadata(raw, commentText)) {
        report("AS-C3", "NO_AGENT_PROVENANCE_IN_SOURCE", ERROR, lineNumber, 1, raw.trim(),
          "AI/agent attribution or changelog date found in source comment.",
          "Remove agent metadata; git history records authorship and dates.");
      }
      if (!info.kind || info.isDoc) return;
      if (looksLikeCode(info.body)) {
        report("AS-C2", "NO_COMMENTED_DEAD_CODE", ERROR, lineNumber, 1, raw.trim(),
          "Commented-out code (Dead Code) detected.",
          "Delete obsolete code; git keeps full revision history.");
      } else if (info.kind === "line" && PATTERNS.trivialVerbComment.test(info.body)) {
        report("AS-C1", "SELF_DOCUMENTING_CODE", WARN, lineNumber, 1, raw.trim(),
          "Narrating comment restates obvious code.",
          "Use self-documenting symbol names or state only a non-obvious WHY.");
      }
    }
  });

  // File-level GSAP checks (AS-03c, AS-03d, AS-03a)
  if (isCode && importsGsap && !PATTERNS.reducedMotionGate.test(cleanSource)) {
    const importLine = lineNumberAt(lineOffsets, cleanSource.search(PATTERNS.gsapImport));
    report("AS-03c", "REDUCED_MOTION_REQUIRED", WARN, importLine, 1, "gsap import",
      "GSAP imported without reduced-motion gating (gsap.matchMedia / prefers-reduced-motion).",
      "Gate animations using gsap.matchMedia() checking '(prefers-reduced-motion: reduce)'.");
  }
  if (isCode && usesGsap) {
    for (const range of findCallRanges(cleanSource, PATTERNS.effectHook)) {
      const effectBody = cleanSource.slice(range.start, range.end + 1);
      if (PATTERNS.animationCleanup.test(effectBody)) continue;
      for (const tween of effectBody.matchAll(PATTERNS.gsapTweenInEffect)) {
        report("AS-03d", "ANIMATION_CLEANUP_REQUIRED", WARN, lineNumberAt(lineOffsets, range.start + tween.index), 1, tween[0],
          "GSAP animation inside useEffect without cleanup.",
          "Use useGSAP() or return () => ctx.revert() inside useEffect.");
      }
    }
    for (const range of findCallRanges(cleanSource, PATTERNS.tweenCall)) {
      const tweenText = cleanSource.slice(range.start, range.end + 1);
      for (const prop of tweenText.matchAll(PATTERNS.gsapLayoutVar)) {
        report("AS-03a", "COMPOSITOR_ONLY_MOTION", WARN, lineNumberAt(lineOffsets, range.start + prop.index), 1, prop[0],
          "GSAP tween animates a layout property.",
          "Animate x, y, scale, or autoAlpha instead of width/height/top/left/margin/padding.");
      }
    }
  }

  // Scoped C# Desktop checks (AS-D1, AS-D2, AS-D3)
  if (family === "csharp") {
    analyzeCSharpDesktop(cleanSource, lineOffsets, report);
  }

  const { violations, suppressions } = applySuppressions(rawFindings, lines, changedLines);
  const errorCount = violations.filter((v) => v.severity === ERROR).length;
  const warningCount = violations.filter((v) => v.severity === WARN).length;
  const score = Math.max(0, 100 - (errorCount * 20 + warningCount * 5));

  return {
    passed: errorCount === 0,
    score,
    profile,
    errorCount,
    warningCount,
    violations,
    suppressions,
    summary: violations.length === 0
      ? "Zero AI slop detected. Software craftsmanship score: 100/100."
      : `${errorCount} error(s), ${warningCount} warning(s) detected. Craftsmanship score: ${score}/100.`
  };
}

// ---------------------------------------------------------------------------
// WCAG 2.1 CSS Token Contrast Auditor (AS-08)
// ---------------------------------------------------------------------------

const SURFACE_KEYWORDS = new Set(["bg", "background", "surface", "canvas", "elevated", "hover"]);
const TEXT_KEYWORDS = new Set(["text", "fg", "foreground"]);
const NEUTRAL_PREFIXES = new Set(["color", "clr", "theme"]);
const NON_COLOR_SEGMENTS = new Set(["border", "shadow", "elevation", "ring", "outline", "radius", "duration"]);

function classifyToken(name) {
  const segments = name.replace(/^--/, "").toLowerCase().split("-").filter(Boolean);
  while (segments.length > 1 && NEUTRAL_PREFIXES.has(segments[0])) segments.shift();
  if (segments.includes("disabled") || segments.includes("on")) return null;

  const joined = segments.join("-");
  if (joined.includes("border-input") || segments.includes("focus")) return { role: "non-text", group: "" };
  if (segments.some((seg) => NON_COLOR_SEGMENTS.has(seg))) return null;

  const textIdx = segments.findIndex((seg) => TEXT_KEYWORDS.has(seg));
  if (textIdx !== -1) return { role: "text", group: segments.slice(0, textIdx).join("-") };

  const surfaceIdx = segments.findIndex((seg) => SURFACE_KEYWORDS.has(seg));
  if (surfaceIdx !== -1) {
    return {
      role: "surface",
      group: segments.slice(0, surfaceIdx).join("-"),
      isPrimarySurface: segments.includes("surface")
    };
  }
  return null;
}

function parseTokenScopes(cssText) {
  const clean = String(cssText).replace(/\/\*[\s\S]*?\*\//g, "");
  const scopes = [];
  const blockPattern = /([^{}]*)\{([^{}]*)\}/g;
  let atRule = "";
  let lastEnd = 0;
  let match;
  while ((match = blockPattern.exec(clean)) !== null) {
    const gap = clean.slice(lastEnd, match.index);
    if (gap.includes("}")) atRule = "";
    const header = gap.match(/(@[^{};]+)\{\s*$/);
    if (header) atRule = header[1].trim();
    lastEnd = blockPattern.lastIndex;

    const tokens = new Map();
    for (const decl of match[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      tokens.set(decl[1], decl[2].replace(/!important/i, "").trim());
    }
    if (tokens.size === 0) continue;
    const selector = match[1].trim();
    scopes.push({ label: atRule ? `${atRule} ${selector}` : selector, atRule, selector, tokens });
  }
  return scopes;
}

function resolveTokenValue(name, tokens, depth = 0) {
  const value = tokens.get(name);
  if (value === undefined || depth > 8) return null;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_w, refName, fallback) => {
    const resolved = resolveTokenValue(refName, tokens, depth + 1);
    return resolved !== null ? resolved : (fallback || "").trim();
  });
}

export function auditTokens(cssText) {
  const scopes = parseTokenScopes(cssText);
  const baseScope = scopes.find((s) => !s.atRule && s.selector.includes(":root")) || scopes[0];
  const checked = [];
  const failures = [];
  if (!baseScope) return { checked, failures, passed: true };

  for (const scope of scopes) {
    const effective = scope === baseScope ? scope.tokens : new Map([...baseScope.tokens, ...scope.tokens]);
    const texts = [];
    const surfaces = [];
    for (const name of effective.keys()) {
      const role = classifyToken(name);
      const color = role ? parseColor(resolveTokenValue(name, effective) || "") : null;
      if (!color) continue;
      if (role.role === "surface") {
        surfaces.push({ name, group: role.group, color, isPrimarySurface: role.isPrimarySurface });
      } else {
        const minimum = role.role === "text" ? MIN_TEXT_CONTRAST : MIN_NON_TEXT_CONTRAST;
        texts.push({ name, group: role.group, color, kind: role.role, minimum });
      }
    }

    const backdrop = (surfaces.find((s) => s.group === "" && s.isPrimarySurface && s.color.a === 1)
      || surfaces.find((s) => s.group === "" && s.color.a === 1)
      || { color: { r: 255, g: 255, b: 255, a: 1 } }).color;

    for (const text of texts) {
      for (const surface of surfaces) {
        const pairsSemantically = surface.group === "" || surface.group === text.group;
        const declaredHere = scope === baseScope || scope.tokens.has(text.name) || scope.tokens.has(surface.name);
        if (!pairsSemantically || !declaredHere) continue;

        const surfaceColor = surface.color.a < 1 ? compositeOver(surface.color, backdrop) : surface.color;
        const textColor = text.color.a < 1 ? compositeOver(text.color, surfaceColor) : text.color;
        const ratio = contrastRatio(textColor, surfaceColor);
        const result = {
          scope: scope.label,
          kind: text.kind,
          text: text.name,
          surface: surface.name,
          ratio: Math.round(ratio * 100) / 100,
          minimum: text.minimum,
          passed: ratio >= text.minimum
        };
        checked.push(result);
        if (!result.passed) failures.push(result);
      }
    }
  }

  return { checked, failures, passed: failures.length === 0 };
}

// ---------------------------------------------------------------------------
// File Collection & Git Diff Scoping
// ---------------------------------------------------------------------------

export function collectSupportedFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return familyOf(targetPath) ? [targetPath] : [];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || WALK_EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile() && familyOf(entry.name) && !entry.name.includes(".min.")) {
        files.push(fullPath);
      }
    }
  };
  walk(targetPath);
  return files.sort();
}

export function lintUiFiles(filePaths, cwd = process.cwd(), options = {}) {
  const expanded = [];
  for (const f of filePaths) {
    const fullPath = path.isAbsolute(f) ? f : path.join(cwd, f);
    for (const resolved of collectSupportedFiles(fullPath)) {
      expanded.push(resolved);
    }
  }
  const profile = options.profile || resolveProfile(cwd);
  const results = [];
  for (const fullPath of expanded) {
    const content = fs.readFileSync(fullPath, "utf8");
    const report = lintUiContent(content, path.basename(fullPath), { ...options, cwd, profile });
    results.push({
      file: path.relative(cwd, fullPath).replace(/\\/g, "/"),
      ...report
    });
  }
  return results;
}

export function parseUnifiedDiff(diffText) {
  const changed = new Map();
  let currentFile = null;
  let nextLine = 0;
  for (const line of String(diffText).split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim().replace(/^"(.*)"$/, "$1");
      currentFile = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (currentFile && !changed.has(currentFile)) changed.set(currentFile, new Set());
      continue;
    }
    if (line.startsWith("--- ")) continue;
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      nextLine = parseInt(hunk[1], 10);
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("+")) {
      changed.get(currentFile).add(nextLine);
      nextLine++;
    } else if (line.startsWith(" ")) {
      nextLine++;
    }
  }
  for (const [file, addedLines] of changed) {
    if (addedLines.size === 0) changed.delete(file);
  }
  return changed;
}

function runGit(args, cwd) {
  const res = spawnSync("git", ["-c", "core.quotepath=off", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (res.error || res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.error ? res.error.message : (res.stderr || "").trim()}`);
  }
  return res.stdout;
}

export function lintDiff(cwd = process.cwd(), options = {}) {
  const topLevel = runGit(["rev-parse", "--show-toplevel"], cwd).trim();
  const diffArgs = ["diff", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR"];
  let source = "staged";
  let changed = parseUnifiedDiff(runGit(["diff", "--cached", ...diffArgs.slice(1)], topLevel));
  if (changed.size === 0) {
    source = "unstaged";
    changed = parseUnifiedDiff(runGit(diffArgs, topLevel));
  }

  const profile = options.profile || resolveProfile(cwd);
  const files = [];
  for (const [relPath, addedLines] of changed) {
    if (!familyOf(relPath) || DIFF_EXCLUDED_PATH.test(relPath)) continue;
    const absPath = path.join(topLevel, relPath);
    const content = source === "staged"
      ? runGit(["show", `:${relPath}`], topLevel)
      : (fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : "");
    const report = lintUiContent(content, path.basename(relPath), { cwd: topLevel, profile, changedLines: addedLines });
    files.push({ file: relPath, ...report });
  }

  const totalErrors = files.reduce((acc, f) => acc + f.errorCount, 0);
  const totalWarnings = files.reduce((acc, f) => acc + f.warningCount, 0);
  return {
    mode: "diff",
    source,
    profile,
    passed: totalErrors === 0,
    fileCount: files.length,
    errorCount: totalErrors,
    warningCount: totalWarnings,
    files
  };
}
