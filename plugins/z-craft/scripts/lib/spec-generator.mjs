/**
 * UX Micro-Contract & State Matrix Generator
 * Translates natural language vibes into disciplined, verifiable UI specifications.
 */

export function generateMicroSpec(prompt, options = {}) {
  const cleanPrompt = (prompt || "").trim();
  
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
    antiSlopChecklist: [
      "[ ] No arbitrary neon gradients (solid surface or subtle borders only)",
      "[ ] Colors strictly mapped to design tokens (bg-background, text-foreground, border-border)",
      "[ ] No nested card wrappers (<Card><Card>)",
      `[ ] Sample data uses realistic domain identifiers (e.g. ${sampleId}) instead of 'Lorem Ipsum'`
    ]
  };

  if (options.format === "markdown") {
    return formatSpecAsMarkdown(spec);
  }

  return spec;
}

function formatSpecAsMarkdown(spec) {
  return `# ${spec.title}
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

---

### 3. Software Craftsmanship Checklist
${spec.antiSlopChecklist.join("\n")}
`;
}
