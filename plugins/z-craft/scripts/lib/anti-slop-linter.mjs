/**
 * Anti-Slop AST & Heuristic Linter
 * Enforces production software craftsmanship and eliminates generic AI-generated slop.
 */

import fs from "node:fs";
import path from "node:path";

export const SLOP_RULES = [
  {
    id: "AS-1",
    name: "ARBITRARY_HEX_COLOR",
    severity: "error",
    description: "Hardcoded arbitrary hex colors detected. Map colors to Design System tokens (e.g. text-foreground, bg-surface, var(--color-primary)).",
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
    excludeFiles: [/tailwind\.config\./, /tokens\./, /theme\./, /colors\./],
    fixHint: "Replace with semantic design token class (e.g., bg-primary, text-muted-foreground) or CSS variable."
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
  }
];

/**
 * Lint string content for anti-slop violations.
 */
export function lintUiContent(content, filename = "snippet.tsx") {
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (const rule of SLOP_RULES) {
    if (rule.excludeFiles && rule.excludeFiles.some(re => re.test(filename))) {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      // Skip comments
      if (/^\s*(?:\/\/|\/\*|\*|<!--|#)/.test(lineText)) continue;

      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        violations.push({
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          line: i + 1,
          matched: match[0],
          message: rule.description,
          fixHint: rule.fixHint
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
    const report = lintUiContent(content, path.basename(fullPath));
    results.push({
      file: path.relative(cwd, fullPath).replace(/\\/g, "/"),
      ...report
    });
  }
  return results;
}
