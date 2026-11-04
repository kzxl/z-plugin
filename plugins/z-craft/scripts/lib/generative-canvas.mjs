/**
 * Generative Canvas Engine
 * Generates self-contained, interactive HTML/Tailwind previews for zero-deploy visual verification.
 */

import fs from "node:fs";
import path from "node:path";

export function generateCanvasWidget({
  title = "Z-Craft Live Preview",
  componentName = "FeatureComponent",
  htmlContent = "",
  states = {}
}) {
  const safeTitle = escapeHtml(title);

  // If no htmlContent provided, provide a high-craft enterprise demo widget
  const bodyContent = htmlContent || `
  <div class="p-6 bg-slate-900 text-slate-100 min-h-[360px] font-sans antialiased rounded-lg border border-slate-800 shadow-sm">
    <div class="flex items-center justify-between pb-4 border-b border-slate-800">
      <div>
        <h2 class="text-base font-semibold tracking-tight text-white">${safeTitle}</h2>
        <p class="text-xs text-slate-400">Enterprise High-Density UI • Crafted with z-craft</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live Preview</span>
      </div>
    </div>

    <!-- State Switcher Bar -->
    <div class="flex items-center gap-2 my-4 p-1.5 bg-slate-950/60 rounded border border-slate-800 text-xs">
      <span class="text-slate-400 px-2 font-mono">STATE:</span>
      <button onclick="switchState('default')" class="px-2.5 py-1 rounded bg-slate-800 text-white font-medium hover:bg-slate-700 transition" id="btn-default">Populated</button>
      <button onclick="switchState('loading')" class="px-2.5 py-1 rounded text-slate-400 hover:text-white transition" id="btn-loading">Loading</button>
      <button onclick="switchState('empty')" class="px-2.5 py-1 rounded text-slate-400 hover:text-white transition" id="btn-empty">Empty</button>
      <button onclick="switchState('error')" class="px-2.5 py-1 rounded text-slate-400 hover:text-white transition" id="btn-error">Error</button>
    </div>

    <!-- Container for States -->
    <div id="view-container">
      <!-- Default View -->
      <div id="view-default" class="space-y-3">
        <div class="overflow-x-auto rounded border border-slate-800">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800">
              <tr>
                <th class="px-3 py-2">ID</th>
                <th class="px-3 py-2">Mã nghiệp vụ</th>
                <th class="px-3 py-2">Số lượng / Giá trị</th>
                <th class="px-3 py-2">Trạng thái</th>
                <th class="px-3 py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr class="hover:bg-slate-800/40 transition">
                <td class="px-3 py-2 font-mono text-slate-400">#001</td>
                <td class="px-3 py-2 font-medium text-white">Vật tư thép cuộn SS400</td>
                <td class="px-3 py-2 font-mono text-slate-300">12,500 kg</td>
                <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Đã nhập kho</span></td>
                <td class="px-3 py-2 text-right"><button class="text-blue-400 hover:underline">Chi tiết</button></td>
              </tr>
              <tr class="hover:bg-slate-800/40 transition">
                <td class="px-3 py-2 font-mono text-slate-400">#002</td>
                <td class="px-3 py-2 font-medium text-white">Bu lông lục giác M12x50</td>
                <td class="px-3 py-2 font-mono text-slate-300">4,800 cái</td>
                <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">Chờ duyệt</span></td>
                <td class="px-3 py-2 text-right"><button class="text-blue-400 hover:underline">Chi tiết</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Loading View -->
      <div id="view-loading" class="hidden space-y-2">
        <div class="h-8 bg-slate-800/60 rounded animate-pulse"></div>
        <div class="h-8 bg-slate-800/40 rounded animate-pulse"></div>
        <div class="h-8 bg-slate-800/30 rounded animate-pulse"></div>
      </div>

      <!-- Empty View -->
      <div id="view-empty" class="hidden text-center py-10 border border-dashed border-slate-800 rounded">
        <p class="text-sm text-slate-400">Không có bản ghi nào phù hợp bộ lọc.</p>
        <button class="mt-3 px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 transition">Thêm mới bản ghi</button>
      </div>

      <!-- Error View -->
      <div id="view-error" class="hidden p-4 rounded bg-rose-950/20 border border-rose-900/40 text-xs">
        <p class="font-medium text-rose-400">Lỗi kết nối cơ sở dữ liệu (ERR_CONN_TIMEOUT)</p>
        <p class="text-slate-400 mt-1">Không thể đồng bộ danh sách mục tiêu. Vui lòng thử lại.</p>
        <button onclick="switchState('default')" class="mt-3 px-3 py-1 rounded bg-rose-900/40 text-rose-200 border border-rose-800 hover:bg-rose-900/60 transition">Thử lại</button>
      </div>
    </div>
  </div>
  `;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Offline & Enterprise Fallback Tokens */
    body { background-color: #020617; color: #f8fafc; margin: 0; padding: 12px; font-family: system-ui, -apple-system, sans-serif; }
    .hidden { display: none !important; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #1e293b; padding: 8px 12px; }
    button { cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  ${bodyContent}
  <script>
    function switchState(state) {
      ['default', 'loading', 'empty', 'error'].forEach(s => {
        const view = document.getElementById('view-' + s);
        const btn = document.getElementById('btn-' + s);
        if (view) view.classList.toggle('hidden', s !== state);
        if (btn) {
          if (s === state) {
            btn.className = 'px-2.5 py-1 rounded bg-slate-800 text-white font-medium hover:bg-slate-700 transition';
          } else {
            btn.className = 'px-2.5 py-1 rounded text-slate-400 hover:text-white transition';
          }
        }
      });
    }
  </script>
</body>
</html>`;

  return {
    title,
    html: fullHtml,
    previewBlock: `<antigravity-ui title="${safeTitle}">\n${fullHtml}\n</antigravity-ui>`
  };
}

/**
 * Extracts architectural domain community from file path or symbol name (Leiden Community analog)
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
  if (/payment|billing/i.test(s)) return "Billing";
  if (/auth|user|token/i.test(s)) return "Auth";
  if (/product|material/i.test(s)) return "Catalog";

  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent && !['src', 'app', 'lib', 'scripts', 'bench', 'services'].includes(parent.toLowerCase())) {
      return parent.charAt(0).toUpperCase() + parent.slice(1);
    }
  }

  return "Core";
}

const COMMUNITY_COLORS = {
  Order: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Inventory: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Billing: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Auth: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Customer: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Presentation: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  Composition: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  Catalog: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Core: "bg-slate-800 text-slate-300 border-slate-700",
};

const COMMUNITY_HEX = {
  Order: "#3b82f6",
  Inventory: "#10b981",
  Billing: "#f59e0b",
  Auth: "#a855f7",
  Customer: "#06b6d4",
  Presentation: "#ec4899",
  Composition: "#6366f1",
  Catalog: "#14b8a6",
  Core: "#64748b",
};

/**
 * Graphify: Generates an interactive Architecture Topology Canvas preview
 */
export function generateGraphCanvasWidget({
  title = "Architecture Call Graph",
  nodes = [],
  edges = [],
  workspaceRoot = process.cwd()
} = {}) {
  let graphNodes = [...nodes];
  let graphEdges = [...edges];

  if (graphNodes.length === 0) {
    try {
      const cacheDir = path.join(workspaceRoot, ".z-plugin", "cache", "symbols");
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir).filter(f => f.endsWith(".json"));
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

  const nodeIds = new Set(topNodes.map(n => n.id));
  const topEdges = graphEdges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to)).slice(0, 100);

  const safeTitle = escapeHtml(title);

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #020617; color: #f8fafc; margin: 0; padding: 14px; font-family: system-ui, sans-serif; }
    .node-box { transition: all 0.2s ease; cursor: pointer; }
    .node-box:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
  </style>
</head>
<body>
  <div class="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
    <div class="flex items-center justify-between pb-4 border-b border-slate-800">
      <div>
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span>🕸️</span> ${safeTitle}
        </h2>
        <p class="text-xs text-slate-400">Graphify Architecture Topology • ${topNodes.length} nodes, ${topEdges.length} call edges, ${communities.length} bounded communities</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">Interactive Topology</span>
      </div>
    </div>

    <!-- View Switcher & Communities Bar -->
    <div class="my-3 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-400 font-mono mr-1">DOMAINS:</span>
        <button onclick="setCommunityFilter('ALL')" id="pill-ALL" class="px-2.5 py-1 rounded text-xs font-medium bg-blue-600 text-white transition">All (${topNodes.length})</button>
        ${communities.map(c => `
          <button onclick="setCommunityFilter('${escapeHtml(c.name)}')" id="pill-${escapeHtml(c.name)}" class="px-2.5 py-1 rounded text-xs font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60 transition">
            ${escapeHtml(c.name)} (${c.count})
          </button>
        `).join('')}
      </div>
      <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
        <button id="viewBtnCards" onclick="switchView('cards')" class="px-2.5 py-1 rounded bg-blue-600 text-white font-medium transition">🗂️ Cards</button>
        <button id="viewBtnForce" onclick="switchView('force')" class="px-2.5 py-1 rounded text-slate-400 hover:text-white transition">🕸️ Force Graph</button>
      </div>
    </div>

    <!-- Search filter -->
    <div class="my-3 flex items-center gap-3">
      <input type="text" id="filterInput" placeholder="Filter symbol or file..." class="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-blue-500 w-64" oninput="filterGraph()">
      <span class="text-xs text-slate-400" id="filterStats">Showing all nodes</span>
    </div>

    <!-- Force-Directed Interactive SVG Canvas -->
    <div id="forceContainer" class="hidden relative my-3">
      <svg id="forceSvg" viewBox="0 0 900 520" class="w-full h-[520px] bg-slate-950 rounded-lg border border-slate-800 cursor-grab">
        <defs>
          <marker id="arrow" viewBox="0 -5 10 10" refX="18" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-5L10,0L0,5" fill="#475569"></path>
          </marker>
        </defs>
        <g id="svgLinks"></g>
        <g id="svgNodes"></g>
      </svg>
      <div id="nodePopover" class="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-700 backdrop-blur-sm p-3 rounded-lg text-xs text-white max-w-xs hidden shadow-xl pointer-events-none">
        <div id="popoverTitle" class="font-bold text-blue-400"></div>
        <div id="popoverSub" class="text-[11px] text-slate-400"></div>
        <div id="popoverDeg" class="text-[10px] text-slate-500 mt-1"></div>
      </div>
    </div>

    <!-- Node Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="nodesContainer">
      ${topNodes.map(n => {
        const badgeColor = COMMUNITY_COLORS[n.community] || "bg-slate-800 text-slate-300 border-slate-700";
        return `
        <div class="node-box p-3 rounded-lg border ${n.isGodNode ? 'bg-amber-950/20 border-amber-600/50 hover:border-amber-400' : 'bg-slate-950/60 border-slate-800 hover:border-blue-500/50'} text-xs" data-name="${escapeHtml(n.name)}" data-file="${escapeHtml(n.file || '')}" data-community="${escapeHtml(n.community)}">
          <div class="flex items-center justify-between">
            <span class="font-mono font-semibold ${n.isGodNode ? 'text-amber-400' : 'text-blue-400'}">${escapeHtml(n.name)}</span>
            <div class="flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 rounded text-[10px] border ${badgeColor}">${escapeHtml(n.community)}</span>
              <span class="px-1.5 py-0.5 rounded text-[10px] ${n.isGodNode ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-slate-800 text-slate-400'}">${n.isGodNode ? 'God Node (Deg: ' + n.degree + ')' : (n.kind || 'symbol')}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 truncate mt-1">${escapeHtml(n.file || 'unknown')}</div>
        </div>
      `;}).join('')}
    </div>
  </div>

  <script>
    const RAW_NODES = ${JSON.stringify(topNodes.map(n => ({
      id: n.id,
      name: n.name,
      file: n.file,
      community: n.community,
      degree: n.degree || 0,
      isGodNode: Boolean(n.isGodNode)
    })))};
    const RAW_EDGES = ${JSON.stringify(topEdges.map(e => ({ from: e.from, to: e.to })))};
    const HEX_COLORS = ${JSON.stringify(COMMUNITY_HEX)};

    let currentCommunity = 'ALL';
    let currentView = 'cards';
    let forceInitialized = false;

    function switchView(mode) {
      currentView = mode;
      const isCards = mode === 'cards';
      document.getElementById('nodesContainer').classList.toggle('hidden', !isCards);
      document.getElementById('forceContainer').classList.toggle('hidden', isCards);
      document.getElementById('viewBtnCards').className = isCards
        ? 'px-2.5 py-1 rounded bg-blue-600 text-white font-medium transition'
        : 'px-2.5 py-1 rounded text-slate-400 hover:text-white transition';
      document.getElementById('viewBtnForce').className = !isCards
        ? 'px-2.5 py-1 rounded bg-blue-600 text-white font-medium transition'
        : 'px-2.5 py-1 rounded text-slate-400 hover:text-white transition';

      if (!isCards && !forceInitialized) {
        initForcePhysics();
        forceInitialized = true;
      }
    }

    function initForcePhysics() {
      const svg = document.getElementById('forceSvg');
      const gLinks = document.getElementById('svgLinks');
      const gNodes = document.getElementById('svgNodes');
      const popover = document.getElementById('nodePopover');

      const width = 900;
      const height = 520;
      const cx = width / 2;
      const cy = height / 2;

      const simNodes = RAW_NODES.map((n, i) => {
        const angle = i * 0.5;
        const r = 40 + i * 4.5;
        return {
          ...n,
          x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 20,
          y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 20,
          vx: 0,
          vy: 0,
          radius: n.isGodNode ? 14 : Math.max(6, Math.min(12, 6 + n.degree)),
          color: HEX_COLORS[n.community] || '#64748b'
        };
      });

      const nodeMap = new Map(simNodes.map(n => [n.id, n]));
      const simLinks = RAW_EDGES
        .filter(e => nodeMap.has(e.from) && nodeMap.has(e.to))
        .map(e => ({ source: nodeMap.get(e.from), target: nodeMap.get(e.to) }));

      gLinks.innerHTML = simLinks.map((l, i) =>
        '<line id="link-' + i + '" stroke="#334155" stroke-width="1.2" stroke-opacity="0.6" marker-end="url(#arrow)"/>'
      ).join('');

      gNodes.innerHTML = simNodes.map((n, i) =>
        '<g id="node-grp-' + i + '" class="cursor-pointer">' +
        (n.isGodNode ? '<circle r="' + (n.radius + 6) + '" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,3" opacity="0.8"/>' : '') +
        '<circle id="node-cir-' + i + '" r="' + n.radius + '" fill="' + n.color + '" stroke="#0f172a" stroke-width="2"/>' +
        '<text font-size="10" fill="#94a3b8" text-anchor="middle" dy="' + (n.radius + 12) + '">' + n.name + '</text>' +
        '</g>'
      ).join('');

      let stepCount = 0;
      function tick() {
        for (let i = 0; i < simNodes.length; i++) {
          const n1 = simNodes[i];
          for (let j = i + 1; j < simNodes.length; j++) {
            const n2 = simNodes[j];
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 260) {
              const f = (1200 / (dist * dist));
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
          const targetDist = 70;
          const f = (dist - targetDist) * 0.035;
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          l.source.vx += fx; l.source.vy += fy;
          l.target.vx -= fx; l.target.vy -= fy;
        }

        for (const n of simNodes) {
          n.vx += (cx - n.x) * 0.015;
          n.vy += (cy - n.y) * 0.015;
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(30, Math.min(width - 30, n.x));
          n.y = Math.max(30, Math.min(height - 30, n.y));
        }

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

        stepCount++;
        if (stepCount < 120) requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);

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
          simNodes.forEach((other, oi) => {
            const otherGrp = document.getElementById('node-grp-' + oi);
            if (otherGrp) otherGrp.style.opacity = '1';
          });
        });
      });
    }

    function setCommunityFilter(comm) {
      currentCommunity = comm;
      document.querySelectorAll('[id^="pill-"]').forEach(btn => {
        if (btn.id === 'pill-' + comm) {
          btn.className = 'px-2.5 py-1 rounded text-xs font-medium bg-blue-600 text-white transition';
        } else {
          btn.className = 'px-2.5 py-1 rounded text-xs font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60 transition';
        }
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
        const commMatch = currentCommunity === 'ALL' || comm === currentCommunity;
        const textMatch = !q || name.includes(q) || file.includes(q);
        const match = commMatch && textMatch;
        b.style.display = match ? 'block' : 'none';
        if (match) visible++;
      });
      document.getElementById('filterStats').textContent = 'Showing ' + visible + ' / ' + boxes.length + ' nodes';
    }
  </script>
</body>
</html>`;

  return {
    title,
    nodeCount: topNodes.length,
    edgeCount: topEdges.length,
    communities,
    html: fullHtml,
    previewBlock: `<antigravity-ui title="${safeTitle}">\n${fullHtml}\n</antigravity-ui>`
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
