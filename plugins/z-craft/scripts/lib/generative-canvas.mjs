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
    body { background-color: #020617; margin: 0; padding: 12px; }
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
