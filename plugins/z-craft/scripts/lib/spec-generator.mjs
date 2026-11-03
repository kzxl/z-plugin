/**
 * UX Micro-Contract & State Matrix Generator with Inter-Plugin Mesh
 * Connects to z-gate (Helper Discovery) and z-brain (Episodic Gotchas).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Lazy load inter-plugin peers gracefully via Service Registry or dynamic locator
let findHelpers = null;
let searchKnowledge = null;

try {
  const { defaultServiceRegistry } = await import('../../../../packages/z-runtime/src/service-registry.mjs');
  findHelpers = defaultServiceRegistry.get('IHelperDiscoveryService')?.findHelpers || null;
  searchKnowledge = defaultServiceRegistry.get('IKnowledgeEngine')?.searchKnowledge || null;
} catch {}

if (!findHelpers) {
  const gatePaths = [
    process.env.ZGATE_MODULE_PATH,
    path.resolve(process.env.USERPROFILE || '', '.gemini', 'config', 'plugins', 'z-gate', 'scripts', 'lib', 'helper-discovery.mjs'),
    path.resolve(process.env.USERPROFILE || '', '.zcode', 'plugins', 'z-gate', 'scripts', 'lib', 'helper-discovery.mjs'),
    path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'z-gate', 'scripts', 'lib', 'helper-discovery.mjs')
  ].filter(Boolean);
  for (const p of gatePaths) {
    if (fs.existsSync(p)) {
      try {
        const m = await import(pathToFileURL(p).href);
        findHelpers = m.findHelpers;
        break;
      } catch {}
    }
  }
}

if (!searchKnowledge) {
  const brainPaths = [
    process.env.ZBRAIN_SEARCH_PATH,
    path.resolve(process.env.USERPROFILE || '', '.gemini', 'config', 'plugins', 'z-brain', 'scripts', 'lib', 'search.mjs'),
    path.resolve(process.env.USERPROFILE || '', '.zcode', 'plugins', 'z-brain', 'scripts', 'lib', 'search.mjs'),
    path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'z-brain', 'scripts', 'lib', 'search.mjs')
  ].filter(Boolean);
  for (const p of brainPaths) {
    if (fs.existsSync(p)) {
      try {
        const m = await import(pathToFileURL(p).href);
        searchKnowledge = m.searchKnowledge;
        break;
      } catch {}
    }
  }
}

export function generateMicroSpec(prompt, options = {}) {
  const cleanPrompt = (prompt || "").trim();
  const cwd = options.cwd || process.cwd();
  
  // Extract domain keywords
  const isInventory = /kho|tồn\s*kho|stock|inventory|vật\s*tư/i.test(cleanPrompt);
  const isFinance = /kế\s*toán|tiền|hóa\s*đơn|thu\s*chi|invoice|payment|finance/i.test(cleanPrompt);
  const isSales = /bán\s*hàng|đơn\s*hàng|order|khách\s*hàng|customer|sales/i.test(cleanPrompt);
  const isDashboard = /dashboard|báo\s*cáo|thống\s*kê|chart|analytics/i.test(cleanPrompt);

  let domain = "Enterprise Management";
  let sampleEntity = "Item";
  let sampleId = "ENT-2026-001";
  if (isInventory) {
    domain = "Warehouse & Inventory";
    sampleEntity = "Vật tư / Hàng hóa";
    sampleId = "INV-VT-1002";
  } else if (isFinance) {
    domain = "Accounting & Finance";
    sampleEntity = "Chứng từ thanh toán";
    sampleId = "PAY-2026-0891";
  } else if (isSales) {
    domain = "Sales & Orders";
    sampleEntity = "Đơn đặt hàng";
    sampleId = "ORD-2026-042";
  } else if (isDashboard) {
    domain = "Executive Dashboard";
    sampleEntity = "Chỉ số KPI";
    sampleId = "KPI-REV-Q1";
  }

  // 1. Inter-Plugin Mesh: Query z-gate for reusable helpers
  let reusableAssets = [];
  if (typeof findHelpers === 'function') {
    try {
      const helperResults = findHelpers({ query: cleanPrompt, directory: cwd, maxMatches: 4 });
      if (Array.isArray(helperResults)) {
        reusableAssets = helperResults.map(h => ({
          method: h.method,
          class: h.class,
          file: h.file,
          isExtension: h.isExtension,
          hint: h.doc || `Reuse ${h.class}.${h.method}() instead of hand-rolling custom logic (R_REUSE).`
        }));
      }
    } catch {}
  }

  // 2. Inter-Plugin Mesh: Query z-brain for historical gotchas
  let historicalGotchas = [];
  if (typeof searchKnowledge === 'function') {
    try {
      const atoms = searchKnowledge({ query: cleanPrompt, limit: 3 });
      if (Array.isArray(atoms)) {
        historicalGotchas = atoms.map(a => ({
          id: a.id,
          problem: a.question,
          fix: a.gotcha_fix || a.answer
        }));
      }
    } catch {}
  }

  const spec = {
    title: `UX Micro-Contract: ${cleanPrompt.slice(0, 60)}${cleanPrompt.length > 60 ? "..." : ""}`,
    domain,
    prompt: cleanPrompt,
    stateMatrix: {
      defaultState: {
        name: "Populated / Normal State",
        requirements: [
          "Display data table / card grid with strict pagination (default 20 items/page).",
          "Include primary sortable columns and status badges.",
          "Visual density: Compact row height (36px–40px in enterprise desktop/web), crisp 1px borders."
        ]
      },
      loadingState: {
        name: "Loading / Async State",
        requirements: [
          "Render skeleton rows with subtle pulse animation matching exact table columns.",
          "FORBIDDEN: Blank white screen or single generic spinning circle.",
          "Preserve filter bar layout during fetch."
        ]
      },
      emptyState: {
        name: "Zero Data / Empty State",
        requirements: [
          `Clear message: "Không tìm thấy ${sampleEntity.toLowerCase()} nào".`,
          "Distinguish between 'No data exists yet' vs 'No search/filter match'.",
          "Provide actionable CTA button (e.g. 'Tạo mới' or 'Xóa bộ lọc')."
        ]
      },
      errorState: {
        name: "Error / Network Failure State",
        requirements: [
          "Non-destructive error banner or card with clear explanation.",
          "Include explicit 'Thử lại (Retry)' action button.",
          "Never leak raw stack traces or unformatted HTTP 500 dumps to the user."
        ]
      }
    },
    edgeCases: [
      {
        scenario: "High Volume Data (10,000+ records)",
        mitigation: "Server-side pagination + row virtualization to maintain 60 FPS."
      },
      {
        scenario: "Long Text / Cell Overflow",
        mitigation: "Apply truncate (text-ellipsis) with hover tooltip."
      },
      {
        scenario: "Mobile / Responsive Viewport",
        mitigation: "Collapse wide table into structured key-value list cards."
      }
    ],
    reusableAssets,
    historicalGotchas,
    antiSlopChecklist: [
      "[ ] No arbitrary neon gradients (solid surface or subtle borders only)",
      "[ ] Colors strictly mapped to design tokens (bg-background, text-foreground, border-border)",
      "[ ] No nested card wrappers (<Card><Card>)",
      `[ ] Sample data uses realistic domain identifiers (e.g. ${sampleId}) instead of 'Lorem Ipsum'`
    ]
  };

  if (reusableAssets.length > 0) {
    spec.antiSlopChecklist.push(`[ ] Reused existing codebase helper(s): ${reusableAssets.map(a => a.method).join(', ')}`);
  }

  if (options.format === "markdown") {
    return formatSpecAsMarkdown(spec);
  }

  return spec;
}

function formatSpecAsMarkdown(spec) {
  let md = `# ${spec.title}
**Domain:** ${spec.domain}  
**Vibe Prompt:** *"${spec.prompt}"*

---

### 1. Mandatory UI State Matrix

| State | Requirements & Invariants |
| :--- | :--- |
| **1. Populated (Default)** | ${spec.stateMatrix.defaultState.requirements.join("<br>• ")} |
| **2. Loading (Skeleton)** | ${spec.stateMatrix.loadingState.requirements.join("<br>• ")} |
| **3. Empty (Zero State)** | ${spec.stateMatrix.emptyState.requirements.join("<br>• ")} |
| **4. Error (Failure)** | ${spec.stateMatrix.errorState.requirements.join("<br>• ")} |

---

### 2. Edge Case Defenses
${spec.edgeCases.map(e => `- **${e.scenario}**: ${e.mitigation}`).join("\n")}
`;

  // Inter-plugin: Add z-gate helpers section if any found
  if (spec.reusableAssets && spec.reusableAssets.length > 0) {
    md += `\n---

### 3. Reusable Codebase Assets (R_REUSE • z-gate)
> [!TIP]
> The following helpers already exist in the codebase. **Reuse them** rather than writing redundant hand-rolled logic:

| Method | Class | Location | Hint |
| :--- | :--- | :--- | :--- |
${spec.reusableAssets.map(a => `| \`${a.method}\` | \`${a.class}\` | \`${a.file}\` | ${a.hint} |`).join("\n")}
`;
  }

  // Inter-plugin: Add z-brain historical gotchas if any found
  if (spec.historicalGotchas && spec.historicalGotchas.length > 0) {
    md += `\n---

### 4. Historical Failure Modes & Gotchas (z-brain)
> [!WARNING]
> Historical lessons recorded for this domain. Avoid repeating these past regressions:

${spec.historicalGotchas.map(g => `- **[#${g.id}] ${g.problem}** › Fix: *${g.fix}*`).join("\n")}
`;
  }

  md += `\n---

### ${spec.reusableAssets.length > 0 || spec.historicalGotchas.length > 0 ? "5" : "3"}. Software Craftsmanship Checklist
${spec.antiSlopChecklist.join("\n")}
`;

  return md;
}
