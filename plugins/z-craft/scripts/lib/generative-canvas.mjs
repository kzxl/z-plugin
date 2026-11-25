/**
 * Generative Canvas Engine
 * Generates self-contained, interactive HTML/Tailwind previews aligned with
 * Antigravity host theme tokens (gstatic Tailwind allowlist + <agent-embed>)
 * and canonical Anti-Slop laws (quiet, dense, flat, zero emoji chrome, real handlers).
 */

import fs from "node:fs";
import path from "node:path";

const TAILWIND_GSTATIC_URL = "https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js";

function toFileUri(filePath) {
  const norm = path.resolve(filePath).replace(/\\/g, "/");
  return norm.startsWith("/") ? `file://${norm}` : `file:///${norm}`;
}

export function generateCanvasWidget({
  title = "Z-Craft Live Preview",
  componentName = "FeatureComponent",
  htmlContent = "",
  savePath = "",
  states = {}
}) {
  const safeTitle = escapeHtml(title);

  const bodyContent = htmlContent || `
  <div class="py-2 space-y-3 text-[var(--foreground)] font-sans antialiased">
    <div class="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-[var(--foreground)]">${safeTitle}</h2>
        <p class="text-xs text-[var(--muted-foreground)] mt-0.5">Enterprise High-Density View</p>
      </div>
      <div class="flex items-center gap-1 p-0.5 bg-[var(--card)] rounded-md border border-[var(--card-border)] text-xs">
        <button type="button" onclick="switchState('default')" class="px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium transition-colors" id="btn-default">Dữ liệu</button>
        <button type="button" onclick="switchState('loading')" class="px-2.5 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors" id="btn-loading">Đang tải</button>
        <button type="button" onclick="switchState('empty')" class="px-2.5 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors" id="btn-empty">Trống</button>
        <button type="button" onclick="switchState('error')" class="px-2.5 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors" id="btn-error">Lỗi</button>
      </div>
    </div>

    <div id="detailBanner" class="hidden px-3 py-2 rounded-md border border-[var(--card-border)] bg-[var(--card)] text-xs flex items-center justify-between">
      <span id="detailText"></span>
      <button type="button" onclick="closeDetail()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] font-medium">Đóng</button>
    </div>

    <div id="view-container">
      <div id="view-default" class="space-y-2">
        <div class="overflow-x-auto rounded-md border border-[var(--card-border)] bg-[var(--card)]">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="border-b border-[var(--card-border)] text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
              <tr>
                <th class="px-3 py-2">Mã</th>
                <th class="px-3 py-2">Vật tư</th>
                <th class="px-3 py-2 text-right">Số lượng</th>
                <th class="px-3 py-2">Trạng thái</th>
                <th class="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody id="tableBody" class="divide-y divide-[var(--card-border)]">
              <tr class="h-9">
                <td class="px-3 font-mono tabular-nums text-[var(--muted-foreground)]">INV-001</td>
                <td class="px-3 font-medium">Vật tư thép cuộn SS400</td>
                <td class="px-3 text-right font-mono tabular-nums">12,500 kg</td>
                <td class="px-3"><span class="px-2 py-0.5 rounded-sm text-[11px] font-semibold border border-[var(--card-border)] text-[var(--success)]">Đã nhập kho</span></td>
                <td class="px-3 text-right"><button type="button" onclick="showDetail('INV-001', 'Vật tư thép cuộn SS400 — 12,500 kg')" class="text-[var(--link)] hover:underline font-medium">Xem chi tiết</button></td>
              </tr>
              <tr class="h-9">
                <td class="px-3 font-mono tabular-nums text-[var(--muted-foreground)]">INV-002</td>
                <td class="px-3 font-medium">Bu lông lục giác M12x50</td>
                <td class="px-3 text-right font-mono tabular-nums">4,800 cái</td>
                <td class="px-3"><span class="px-2 py-0.5 rounded-sm text-[11px] font-semibold border border-[var(--card-border)] text-[var(--warning)]">Chờ duyệt</span></td>
                <td class="px-3 text-right"><button type="button" onclick="showDetail('INV-002', 'Bu lông lục giác M12x50 — 4,800 cái')" class="text-[var(--link)] hover:underline font-medium">Xem chi tiết</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="view-loading" class="hidden space-y-2" aria-busy="true">
        <div data-role="skeleton" class="h-9 bg-[var(--card)] border border-[var(--card-border)] rounded-sm animate-pulse motion-reduce:animate-none"></div>
        <div data-role="skeleton" class="h-9 bg-[var(--card)] border border-[var(--card-border)] rounded-sm animate-pulse motion-reduce:animate-none"></div>
        <div data-role="skeleton" class="h-9 bg-[var(--card)] border border-[var(--card-border)] rounded-sm animate-pulse motion-reduce:animate-none"></div>
      </div>

      <div id="view-empty" class="hidden text-center py-8 border border-[var(--card-border)] bg-[var(--card)] rounded-md">
        <p class="text-xs text-[var(--muted-foreground)]">Không có bản ghi nào phù hợp bộ lọc hiện tại.</p>
        <button type="button" onclick="addDemoRecord()" class="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]">Thêm bản ghi</button>
      </div>

      <div id="view-error" class="hidden p-4 rounded-md bg-[var(--card)] border border-[var(--error)] text-xs">
        <p class="font-semibold text-[var(--error)]">Không thể đồng bộ dữ liệu kho (ERR_CONN_TIMEOUT)</p>
        <p class="text-[var(--muted-foreground)] mt-1">Kiểm tra kết nối dịch vụ dữ liệu và thực hiện tải lại.</p>
        <button type="button" onclick="switchState('default')" class="mt-3 px-3 py-1 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold">Thử lại</button>
      </div>
    </div>
  </div>
  `;

  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <script src="${TAILWIND_GSTATIC_URL}"></script>
  <style>
    :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-0 m-0">
  ${bodyContent}
  <script>
    function switchState(state) {
      ['default', 'loading', 'empty', 'error'].forEach(s => {
        const view = document.getElementById('view-' + s);
        const btn = document.getElementById('btn-' + s);
        if (view) view.classList.toggle('hidden', s !== state);
        if (btn) {
          btn.className = s === state
            ? 'px-2.5 py-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium transition-colors'
            : 'px-2.5 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors';
        }
      });
    }
    function showDetail(code, summary) {
      const banner = document.getElementById('detailBanner');
      const text = document.getElementById('detailText');
      if (banner && text) {
        text.textContent = code + ': ' + summary;
        banner.classList.remove('hidden');
      }
    }
    function closeDetail() {
      const banner = document.getElementById('detailBanner');
      if (banner) banner.classList.add('hidden');
    }
    function addDemoRecord() {
      switchState('default');
      showDetail('INV-003', 'Đã khởi tạo bản ghi mẫu mới');
    }
  </script>
</body>
</html>`;

  const previewBlock = savePath
    ? `<agent-embed src="${toFileUri(savePath)}"></agent-embed>`
    : `<antigravity-ui title="${safeTitle}">\n${fullHtml}\n</antigravity-ui>`;

  return {
    title,
    html: fullHtml,
    previewBlock
  };
}

/**
 * Extracts architectural domain community from file path or symbol name
 */
export function extractDomainCommunity(filePath = "", symbolName = "") {
  const norm = String(filePath || "").replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);

  for (const p of parts) {
    if (/order|checkout|cart/i.test(p)) return "Order";
    if (/inventory|stock|warehouse|bin/i.test(p)) return "Inventory";
    if (/customer|client|partner|crm/i.test(p)) return "Customer";
    if (/payment|billing|invoice|finance/i.test(p)) return "Billing";
    if (/auth|identity|user|security|permission/i.test(p)) return "Auth";
    if (/catalog|product|item|material/i.test(p)) return "Catalog";
    if (/views|forms|ui|components|pages/i.test(p)) return "Presentation";
    if (/composition|di|bootstrap|extensions/i.test(p)) return "Composition";
    if (/core|shared|common|utils|helpers/i.test(p)) return "Core";
  }

  const s = String(symbolName || "");
  if (/order|checkout/i.test(s)) return "Order";
  if (/inventory|stock|warehouse/i.test(s)) return "Inventory";
  if (/customer|client/i.test(s)) return "Customer";
  if (/payment|billing|invoice/i.test(s)) return "Billing";
  if (/auth|user|token/i.test(s)) return "Auth";
  if (/product|material/i.test(s)) return "Catalog";

  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent && !["src", "app", "lib", "scripts", "bench", "services"].includes(parent.toLowerCase())) {
      return parent.charAt(0).toUpperCase() + parent.slice(1);
    }
  }

  return "Core";
}

const COMMUNITY_VAR = {
  Order: "var(--chart-1)",
  Inventory: "var(--chart-2)",
  Billing: "var(--chart-3)",
  Auth: "var(--chart-4)",
  Customer: "var(--chart-5)",
  Presentation: "var(--chart-6)",
  Composition: "var(--primary)",
  Catalog: "var(--success)",
  Core: "var(--muted-foreground)"
};

/**
 * Graphify: Generates an interactive Architecture Topology Canvas preview
 */
export function generateGraphCanvasWidget({
  title = "Architecture Call Graph",
  nodes = [],
  edges = [],
  savePath = "",
  workspaceRoot = process.cwd()
} = {}) {
  let graphNodes = [...nodes];
  let graphEdges = [...edges];

  if (graphNodes.length === 0) {
    try {
      const cacheDir = path.join(workspaceRoot, ".z-plugin", "cache", "symbols");
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
        for (const bf of files) {
          const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, bf), "utf8"));
          if (raw.symbols) {
            for (const symKey of Object.keys(raw.symbols)) {
              for (const item of raw.symbols[symKey]) {
                const calls = item.calls || [];
                graphNodes.push({
                  id: item.name,
                  name: item.name,
                  file: item.file,
                  kind: item.kind,
                  degree: calls.length,
                  isGodNode: calls.length >= 8
                });
                for (const callee of calls) {
                  graphEdges.push({ from: item.name, to: callee });
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  const uniqueNodesMap = new Map();
  for (const n of graphNodes) {
    if (!uniqueNodesMap.has(n.id)) uniqueNodesMap.set(n.id, n);
  }
  const topNodes = Array.from(uniqueNodesMap.values()).slice(0, 60);
  for (const n of topNodes) {
    n.community = n.community || extractDomainCommunity(n.file, n.name);
  }

  const communityCounts = new Map();
  for (const n of topNodes) {
    communityCounts.set(n.community, (communityCounts.get(n.community) || 0) + 1);
  }
  const communities = Array.from(communityCounts.entries()).map(([name, count]) => ({ name, count }));

  const nodeIds = new Set(topNodes.map((n) => n.id));
  const topEdges = graphEdges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)).slice(0, 100);
  const safeTitle = escapeHtml(title);

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <script src="${TAILWIND_GSTATIC_URL}"></script>
  <style>
    .node-box { transition: border-color 120ms ease; cursor: pointer; }
    :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-0 m-0">
  <div class="p-4 bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
    <div class="flex items-center justify-between pb-3 border-b border-[var(--card-border)]">
      <div>
        <h2 class="text-base font-semibold text-[var(--foreground)]">${safeTitle}</h2>
        <p class="text-xs text-[var(--muted-foreground)]">Architecture Topology • ${topNodes.length} nodes, ${topEdges.length} call edges, ${communities.length} domains</p>
      </div>
      <span class="px-2 py-0.5 text-xs font-mono border border-[var(--card-border)] text-[var(--primary)] rounded-sm">Topology</span>
    </div>

    <div class="my-3 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--card-border)]">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs text-[var(--muted-foreground)] font-mono mr-1">DOMAINS:</span>
        <button type="button" onclick="setCommunityFilter('ALL')" id="pill-ALL" class="px-2.5 py-1 rounded-sm text-xs font-medium bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors">All (${topNodes.length})</button>
        ${communities.map((c) => `
          <button type="button" onclick="setCommunityFilter('${escapeHtml(c.name)}')" id="pill-${escapeHtml(c.name)}" class="px-2.5 py-1 rounded-sm text-xs font-medium bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] transition-colors">
            ${escapeHtml(c.name)} (${c.count})
          </button>
        `).join("")}
      </div>
      <div class="flex items-center gap-1 bg-[var(--background)] p-0.5 rounded-md border border-[var(--card-border)] text-xs">
        <button type="button" id="viewBtnCards" onclick="switchView('cards')" class="px-2.5 py-1 rounded-sm bg-[var(--primary)] text-[var(--primary-foreground)] font-medium transition-colors">Cards</button>
        <button type="button" id="viewBtnForce" onclick="switchView('force')" class="px-2.5 py-1 rounded-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Force Graph</button>
      </div>
    </div>

    <div class="my-3 flex items-center gap-3">
      <input type="text" id="filterInput" placeholder="Filter symbol or file..." class="px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-md text-xs text-[var(--foreground)] w-64" oninput="filterGraph()">
      <span class="text-xs text-[var(--muted-foreground)] tabular-nums" id="filterStats">Showing all nodes</span>
    </div>

    <div id="forceContainer" class="hidden relative my-3">
      <svg id="forceSvg" viewBox="0 0 900 520" class="w-full h-[520px] bg-[var(--background)] rounded-md border border-[var(--card-border)]">
        <defs>
          <marker id="arrow" viewBox="0 -5 10 10" refX="18" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="var(--muted-foreground)"></path>
          </marker>
        </defs>
        <g id="svgLinks"></g>
        <g id="svgNodes"></g>
      </svg>
      <div id="nodePopover" class="absolute bottom-3 left-3 bg-[var(--card)] border border-[var(--card-border)] p-3 rounded-md text-xs text-[var(--foreground)] max-w-xs hidden pointer-events-none">
        <div id="popoverTitle" class="font-semibold text-[var(--primary)]"></div>
        <div id="popoverSub" class="text-[11px] text-[var(--muted-foreground)]"></div>
        <div id="popoverDeg" class="text-[11px] text-[var(--muted-foreground)] mt-1 tabular-nums"></div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="nodesContainer">
      ${topNodes.map((n) => `
        <div class="node-box p-3 rounded-md border ${n.isGodNode ? "border-[var(--warning)]" : "border-[var(--card-border)]"} bg-[var(--background)] text-xs" data-name="${escapeHtml(n.name)}" data-file="${escapeHtml(n.file || "")}" data-community="${escapeHtml(n.community)}">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono font-semibold ${n.isGodNode ? "text-[var(--warning)]" : "text-[var(--primary)]"} truncate">${escapeHtml(n.name)}</span>
            <div class="flex items-center gap-1 shrink-0">
              <span class="px-1.5 py-0.5 rounded-sm text-[11px] border border-[var(--card-border)] text-[var(--foreground)]">${escapeHtml(n.community)}</span>
              <span class="px-1.5 py-0.5 rounded-sm text-[11px] ${n.isGodNode ? "text-[var(--warning)] font-semibold" : "text-[var(--muted-foreground)]"}">${n.isGodNode ? "God Node (Deg: " + n.degree + ")" : (n.kind || "symbol")}</span>
            </div>
          </div>
          <div class="text-[11px] text-[var(--muted-foreground)] truncate mt-1">${escapeHtml(n.file || "unknown")}</div>
        </div>
      `).join("")}
    </div>
  </div>

  <script>
    const RAW_NODES = ${JSON.stringify(topNodes.map((n) => ({
      id: n.id,
      name: n.name,
      file: n.file,
      community: n.community,
      degree: n.degree || 0,
      isGodNode: Boolean(n.isGodNode)
    })))};
    const RAW_EDGES = ${JSON.stringify(topEdges.map((e) => ({ from: e.from, to: e.to })))};
    const COMMUNITY_COLORS = ${JSON.stringify(COMMUNITY_VAR)};

    let currentCommunity = 'ALL';
    let forceInitialized = false;

    function switchView(mode) {
      const isCards = mode === 'cards';
      document.getElementById('nodesContainer').classList.toggle('hidden', !isCards);
      document.getElementById('forceContainer').classList.toggle('hidden', isCards);
      document.getElementById('viewBtnCards').className = isCards
        ? 'px-2.5 py-1 rounded-sm bg-[var(--primary)] text-[var(--primary-foreground)] font-medium transition-colors'
        : 'px-2.5 py-1 rounded-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors';
      document.getElementById('viewBtnForce').className = !isCards
        ? 'px-2.5 py-1 rounded-sm bg-[var(--primary)] text-[var(--primary-foreground)] font-medium transition-colors'
        : 'px-2.5 py-1 rounded-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors';

      if (!isCards && !forceInitialized) {
        initForcePhysics();
        forceInitialized = true;
      }
    }

    function initForcePhysics() {
      const gLinks = document.getElementById('svgLinks');
      const gNodes = document.getElementById('svgNodes');
      const popover = document.getElementById('nodePopover');
      const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const width = 900;
      const height = 520;
      const cx = width / 2;
      const cy = height / 2;

      const simNodes = RAW_NODES.map((n, i) => {
        const angle = i * 0.5;
        const r = 40 + i * 4.5;
        return {
          ...n,
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          vx: 0,
          vy: 0,
          radius: n.isGodNode ? 14 : Math.max(6, Math.min(12, 6 + n.degree)),
          color: COMMUNITY_COLORS[n.community] || 'var(--muted-foreground)'
        };
      });

      const nodeMap = new Map(simNodes.map(n => [n.id, n]));
      const simLinks = RAW_EDGES
        .filter(e => nodeMap.has(e.from) && nodeMap.has(e.to))
        .map(e => ({ source: nodeMap.get(e.from), target: nodeMap.get(e.to) }));

      gLinks.innerHTML = simLinks.map((_l, i) =>
        '<line id="link-' + i + '" stroke="var(--card-border)" stroke-width="1.2" marker-end="url(#arrow)"/>'
      ).join('');

      gNodes.innerHTML = simNodes.map((n, i) =>
        '<g id="node-grp-' + i + '" class="cursor-pointer">' +
        (n.isGodNode ? '<circle r="' + (n.radius + 5) + '" fill="none" stroke="var(--warning)" stroke-width="1.75" stroke-dasharray="3,3"/>' : '') +
        '<circle id="node-cir-' + i + '" r="' + n.radius + '" fill="' + n.color + '" stroke="var(--background)" stroke-width="2"/>' +
        '<text font-size="11" fill="var(--muted-foreground)" text-anchor="middle" dy="' + (n.radius + 14) + '">' + n.name + '</text>' +
        '</g>'
      ).join('');

      function stepSimulation() {
        for (let i = 0; i < simNodes.length; i++) {
          const n1 = simNodes[i];
          for (let j = i + 1; j < simNodes.length; j++) {
            const n2 = simNodes[j];
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 260) {
              const f = 1200 / (dist * dist);
              const fx = (dx / dist) * f;
              const fy = (dy / dist) * f;
              n1.vx += fx; n1.vy += fy;
              n2.vx -= fx; n2.vy -= fy;
            }
          }
        }
        for (const l of simLinks) {
          const dx = l.target.x - l.source.x;
          const dy = l.target.y - l.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - 70) * 0.035;
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          l.source.vx += fx; l.source.vy += fy;
          l.target.vx -= fx; l.target.vy -= fy;
        }
        for (const n of simNodes) {
          n.vx = (n.vx + (cx - n.x) * 0.015) * 0.82;
          n.vy = (n.vy + (cy - n.y) * 0.015) * 0.82;
          n.x = Math.max(30, Math.min(width - 30, n.x + n.vx));
          n.y = Math.max(30, Math.min(height - 30, n.y + n.vy));
        }
      }

      function renderPositions() {
        simLinks.forEach((l, i) => {
          const lineEl = document.getElementById('link-' + i);
          if (lineEl) {
            lineEl.setAttribute('x1', l.source.x);
            lineEl.setAttribute('y1', l.source.y);
            lineEl.setAttribute('x2', l.target.x);
            lineEl.setAttribute('y2', l.target.y);
          }
        });
        simNodes.forEach((n, i) => {
          const grp = document.getElementById('node-grp-' + i);
          if (grp) grp.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
        });
      }

      if (reducedMotion) {
        for (let k = 0; k < 80; k++) stepSimulation();
        renderPositions();
      } else {
        let stepCount = 0;
        function tick() {
          stepSimulation();
          renderPositions();
          stepCount++;
          if (stepCount < 100) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }

      simNodes.forEach((n, i) => {
        const grp = document.getElementById('node-grp-' + i);
        if (!grp) return;
        grp.addEventListener('mouseenter', () => {
          document.getElementById('popoverTitle').textContent = n.name + (n.isGodNode ? ' [GOD NODE]' : '');
          document.getElementById('popoverSub').textContent = (n.file || 'unknown') + ' • Domain: ' + n.community;
          document.getElementById('popoverDeg').textContent = 'Connections: ' + n.degree;
          popover.classList.remove('hidden');
          simNodes.forEach((other, oi) => {
            const isSelf = other.id === n.id;
            const isNeigh = simLinks.some(l => (l.source.id === n.id && l.target.id === other.id) || (l.target.id === n.id && l.source.id === other.id));
            const otherGrp = document.getElementById('node-grp-' + oi);
            if (otherGrp) otherGrp.style.opacity = (isSelf || isNeigh) ? '1' : '0.2';
          });
        });
        grp.addEventListener('mouseleave', () => {
          popover.classList.add('hidden');
          simNodes.forEach((_other, oi) => {
            const otherGrp = document.getElementById('node-grp-' + oi);
            if (otherGrp) otherGrp.style.opacity = '1';
          });
        });
      });
    }

    function setCommunityFilter(comm) {
      currentCommunity = comm;
      document.querySelectorAll('[id^="pill-"]').forEach(btn => {
        btn.className = btn.id === 'pill-' + comm
          ? 'px-2.5 py-1 rounded-sm text-xs font-medium bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors'
          : 'px-2.5 py-1 rounded-sm text-xs font-medium bg-[var(--background)] text-[var(--foreground)] border border-[var(--card-border)] transition-colors';
      });
      filterGraph();
    }

    function filterGraph() {
      const q = (document.getElementById('filterInput').value || '').toLowerCase();
      const boxes = document.querySelectorAll('.node-box');
      let visible = 0;
      boxes.forEach(b => {
        const name = b.getAttribute('data-name').toLowerCase();
        const file = b.getAttribute('data-file').toLowerCase();
        const comm = b.getAttribute('data-community');
        const match = (currentCommunity === 'ALL' || comm === currentCommunity) && (!q || name.includes(q) || file.includes(q));
        b.style.display = match ? 'block' : 'none';
        if (match) visible++;
      });
      document.getElementById('filterStats').textContent = 'Showing ' + visible + ' / ' + boxes.length + ' nodes';
    }
  </script>
</body>
</html>`;

  const previewBlock = savePath
    ? `<agent-embed src="${toFileUri(savePath)}"></agent-embed>`
    : `<antigravity-ui title="${safeTitle}">\n${fullHtml}\n</antigravity-ui>`;

  return {
    title,
    nodeCount: topNodes.length,
    edgeCount: topEdges.length,
    communities,
    html: fullHtml,
    previewBlock
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
