/**
 * Anti-Slop AST & Heuristic Linter with Design Token Bridge
 * Enforces production software craftsmanship and eliminates generic AI-generated slop.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Scan workspace for Design Tokens (tokens.md, tokens.json, tailwind.config.*)
 */
export function loadWorkspaceTokens(cwd = process.cwd()) {
  const tokenCandidates = [
    path.join(cwd, "tokens.json"),
    path.join(cwd, "tokens.md"),
    path.join(cwd, "skills", "ui-design-system", "references", "tokens.md"),
    path.join(cwd, "theme.json")
  ];

  const availableTokens = new Set([
    "bg-background", "text-foreground", "bg-surface", "bg-card",
    "border-border", "bg-primary", "text-primary-foreground",
    "text-muted-foreground", "bg-muted", "text-accent", "bg-accent"
  ]);

  for (const p of tokenCandidates) {
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, "utf8");
        // Extract token names matching --color-xxx, token names, or css vars
        const matches = text.match(/(?:--color-[a-z0-9-]+|var\(--[a-z0-9-]+\)|[a-z0-9-]+-(?:foreground|background|surface|primary|border|muted))/gi) || [];
        for (const m of matches) availableTokens.add(m);
      } catch {}
    }
  }

  return Array.from(availableTokens);
}

/**
 * Map hex colors to nearest semantic design tokens
 */
function suggestTokenForHex(hex) {
  const cleanHex = hex.toLowerCase().replace('#', '');
  // Extract RGB
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }

  // Hue categorization
  if (r > 100 && b > 140 && g < 100) {
    // Purple / Indigo
    return { token: "bg-primary / text-accent", var: "var(--color-primary)" };
  } else if (b > 160 && r < 120) {
    // Blue / Cyan
    return { token: "bg-primary / text-info", var: "var(--color-info)" };
  } else if (g > 150 && r < 120) {
    // Green
    return { token: "bg-success / text-success", var: "var(--color-success)" };
  } else if (r > 180 && g < 100 && b < 100) {
    // Red / Destructive
    return { token: "bg-destructive / text-destructive", var: "var(--color-destructive)" };
  } else if (r === g && g === b) {
    // Grayscale
    if (r > 200) return { token: "bg-surface / bg-background", var: "var(--color-surface)" };
    if (r < 60) return { token: "bg-card / text-foreground", var: "var(--color-foreground)" };
    return { token: "border-border / text-muted-foreground", var: "var(--color-border)" };
  }

  return { token: "bg-surface / text-foreground", var: "var(--color-surface)" };
}

export const SLOP_RULES = [
  {
    id: "AS-1",
    name: "ARBITRARY_HEX_COLOR",
    severity: "error",
    description: "Hardcoded arbitrary hex colors detected. Map colors to Design System tokens (e.g. text-foreground, bg-surface, var(--color-primary)).",
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
    excludeFiles: [/tailwind\.config\./, /tokens\./, /theme\./, /colors\./],
    fixHint: (matched) => {
      const suggestion = suggestTokenForHex(matched);
      return `Replace '${matched}' with semantic design token '${suggestion.token}' or '${suggestion.var}'.`;
    }
  },
  {
    id: "AS-2",
    name: "NEON_AI_GRADIENT",
    severity: "error",
    description: "Gratuitous neon purple/pink/indigo AI gradient detected.",
    pattern: /(?:from-(?:purple|violet|fuchsia|pink)-(?:400|500|600)\s+to-(?:indigo|pink|purple|blue)-(?:400|500|600)|bg-gradient-to-(?:r|br|tr)\s+from-(?:violet|purple))/i,
    fixHint: "Use solid neutral backgrounds, subtle borders, or functional enterprise palettes."
  },
  {
    id: "AS-3",
    name: "FLOATY_AMBIENT_SHADOW",
    severity: "warning",
    description: "Overly dramatic or colored drop shadow detected (e.g. shadow-2xl, colored ambient glows).",
    pattern: /\b(?:shadow-(?:2xl|inner|indigo-[0-9]+\/[0-9]+|purple-[0-9]+\/[0-9]+)|drop-shadow-2xl)\b/i,
    fixHint: "Use crisp 1px borders (border border-border) or subtle elevation (shadow-xs, shadow-sm)."
  },
  {
    id: "AS-4",
    name: "GENERIC_PLACEHOLDER",
    severity: "warning",
    description: "Dummy or placeholder data detected in component code (e.g. Lorem ipsum, John Doe).",
    pattern: /\b(?:lorem\s+ipsum|dolor\s+sit\s+amet|john\s+doe|test@example\.com)\b/i,
    fixHint: "Use realistic domain-specific enterprise seed data (e.g. INV-2026-001, Nguyễn Văn A)."
  },
  {
    id: "AS-5",
    name: "DEAD_INTERACTION",
    severity: "error",
    description: "Dead button click handler or no-op link detected.",
    pattern: /(?:onClick=\{\s*\(\)\s*=>\s*\{\}\s*\}|href=["']#["']|href=["']javascript:void\(0\)["'])/i,
    fixHint: "Wire up a real handler, loading state, or disable the button with an explanation."
  },
  {
    id: "AS-6",
    name: "LOW_CONTRAST_TEXT",
    severity: "warning",
    description: "Low contrast text detected (WCAG AAA contrast hazard).",
    pattern: /(?:text-(?:gray|slate|zinc)-400\s+bg-white|text-(?:gray|slate|zinc)-500\s+bg-gray-50)/i,
    fixHint: "Increase text contrast to at least text-muted-foreground / text-foreground (WCAG 4.5:1+)."
  },
  {
    id: "AS-7",
    name: "XAML_WINFORMS_SLOP",
    severity: "error",
    description: "Unskinned raw color or non-standard brush in desktop XAML/WinForms.",
    pattern: /(?:Color\.FromArgb\(\s*\d+\s*,\s*255\s*,\s*0\s*,\s*255\s*\)|Background=["']#(?:FF)?[78][0-9A-Fa-f]{5}["'])/i,
    fixHint: "Bind to DevExpress SkinPalette or Application.Current.Resources token brush."
  },
  {
    id: "AS-8",
    name: "DEVEXPRESS_BEGIN_UPDATE",
    severity: "error",
    multiline: true,
    description: "Modifying DevExpress GridControl/GridView rows in a loop without wrapping in BeginUpdate() / EndUpdate().",
    pattern: /(?:for|foreach)\s*\([^)]+\)\s*\{[^}]*(?:gridView\d*|gridControl\d*)\.(?:SetRowCellValue|AddNewRow|DeleteRow)/is,
    fixHint: "Wrap the loop in gridControl.BeginUpdate() ... try/finally { gridControl.EndUpdate(); } for 10x UI throughput."
  },
  {
    id: "AS-9",
    name: "WINFORMS_WAIT_INDICATOR",
    severity: "warning",
    multiline: true,
    description: "Async background I/O or Task without SplashScreenManager or WaitForm overlay.",
    pattern: /(?:await\s+Task\.Run|BackgroundWorker)\b(?!.*(?:SplashScreenManager|ShowWaitForm|ShowOverlayForm))/s,
    fixHint: "Show a loading overlay using SplashScreenManager.ShowOverlayForm(this) during async background work."
  },
  {
    id: "AS-10",
    name: "WPF_DISPATCHER_BLOCKING",
    severity: "error",
    multiline: true,
    description: "Blocking Dispatcher.Invoke(...) called inside an async method, causing UI thread deadlocks.",
    pattern: /\basync\b[\s\S]*?\bDispatcher\.Invoke\s*\(/s,
    fixHint: "Use 'await Dispatcher.InvokeAsync(...)' instead of blocking 'Dispatcher.Invoke(...)'.",
  },
  {
    id: "AS-11",
    name: "HARDCODED_FONT_FAMILY",
    severity: "warning",
    description: "Hardcoded font instantiation bypassing enterprise design tokens and DevExpress skinning.",
    pattern: /new\s+Font\s*\(\s*["'](?:Segoe UI|Arial|Tahoma|Microsoft Sans Serif)["']\s*,\s*\d+/i,
    fixHint: "Use WindowsFormsSettings.DefaultFont or DevExpress AppearanceObject instead of hardcoded Font instances."
  }
];

/**
 * Strips comments while preserving newlines and character positions for accurate line numbering
 */
export function sanitizeSource(content) {
  let clean = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '));
  clean = clean.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, ' '));
  clean = clean.replace(/(?<!:)\/\/[^\r\n]*/g, (m) => ' '.repeat(m.length));
  return clean;
}

/**
 * Lint string content for anti-slop violations.
 */
export function lintUiContent(content, filename = "snippet.tsx", cwd = process.cwd()) {
  const violations = [];
  const cleanContent = sanitizeSource(content);
  const cleanLines = cleanContent.split(/\r?\n/);
  const lines = content.split(/\r?\n/);

  for (const rule of SLOP_RULES) {
    if (rule.excludeFiles && rule.excludeFiles.some(re => re.test(filename))) {
      continue;
    }

    if (rule.multiline) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match;
      while ((match = regex.exec(cleanContent)) !== null) {
        const hint = typeof rule.fixHint === "function" ? rule.fixHint(match[0]) : rule.fixHint;
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        violations.push({
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          line,
          matched: match[0].trim().slice(0, 80),
          message: rule.description,
          fixHint: hint
        });
        if (!rule.pattern.global) break;
      }
      continue;
    }

    for (let i = 0; i < cleanLines.length; i++) {
      const lineText = cleanLines[i];
      if (!lineText.trim()) continue;

      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        const hint = typeof rule.fixHint === "function" ? rule.fixHint(match[0]) : rule.fixHint;
        violations.push({
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          line: i + 1,
          matched: match[0],
          message: rule.description,
          fixHint: hint
        });
        if (!rule.pattern.global) break;
      }
    }
  }

  const errorCount = violations.filter(v => v.severity === "error").length;
  const warningCount = violations.filter(v => v.severity === "warning").length;
  const score = Math.max(0, 100 - (errorCount * 20 + warningCount * 5));

  return {
    passed: errorCount === 0,
    score,
    errorCount,
    warningCount,
    violations,
    summary: violations.length === 0
      ? "Zero AI slop detected. Software craftsmanship score: 100/100."
      : `${errorCount} errors, ${warningCount} warnings detected. Craftsmanship score: ${score}/100.`
  };
}

/**
 * Lint files on disk
 */
export function lintUiFiles(filePaths, cwd = process.cwd()) {
  const results = [];
  for (const f of filePaths) {
    const fullPath = path.isAbsolute(f) ? f : path.join(cwd, f);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf8");
    const report = lintUiContent(content, path.basename(fullPath), cwd);
    results.push({
      file: path.relative(cwd, fullPath).replace(/\\/g, "/"),
      ...report
    });
  }
  return results;
}
