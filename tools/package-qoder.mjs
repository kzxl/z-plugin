#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'dist', `z-plugin-qoder-${meta.version}.zip`);
const runtime = {
  'z-token': ['scan', 'fsindex', 'symbol-cache', 'build', 'diet', 'dashboard', 'run', 'test-runner', 'config', 'ledger'],
  'z-brain': ['db', 'search', 'format', 'harvest', 'harvest-queue', 'git-harvester', 'workspace', 'edit-observer', 'preflight'],
  'z-mind': ['rules', 'bootstrap', 'doctor', 'plan-generator', 'arch-doctor'],
  'z-gate': ['helper-discovery', 'nev-auditor', 'code-reviewer', 'diff-parser', 'review-formatter', 'git-hook'],
  'z-craft': ['anti-slop-linter', 'spec-generator', 'generative-canvas', 'time-machine', 'scaffolder'],
};
const skills = {
  'z-token': ['Đọc và tìm kiếm mã nguồn gọn qua MCP khi cần outline, symbol, call graph hoặc tìm kiếm giới hạn.', 'Dùng outline, search, read_symbol trước khi đọc toàn bộ file. Dùng blast_radius và trace_data_flow khi cần đánh giá ảnh hưởng. Truyền đường dẫn workspace tuyệt đối khi schema cho phép. Chỉ chạy build/run theo yêu cầu hoặc phạm vi kiểm thử đã được cho phép. Không tuyên bố đã bật oversized-read guard: gói Qoder không đăng ký hooks. Các chế độ on/lite/ultra/off chỉ là sở thích hội thoại; không thay đổi cấu hình runtime. Dashboard là HTML được tạo, không phải UI Qoder đã xác minh; chỉ mở trình duyệt khi người dùng yêu cầu.'],
  'z-brain': ['Tra cứu tri thức cục bộ bằng MCP khi người dùng cần lịch sử quyết định hoặc thông tin đã lưu.', 'Dùng zbrain_fetch hoặc zbrain_query rồi zbrain_view cho chi tiết liên quan. Trước khi sửa file quan trọng, gọi zbrain_impact với brief=true (hoặc z-brain preflight <file>) để lấy churn 30 ngày, blast radius, file cùng sửa, test bị ảnh hưởng, gotcha và invariant trong ~300 token. Kiểm chứng thông tin với mã nguồn hiện tại. Chỉ dùng zbrain_harvest, zbrain_observe hoặc zbrain_harvest_git khi người dùng yêu cầu lưu hoặc nhập tri thức; không tự lưu kết quả mỗi tác vụ. Không lưu secrets, dữ liệu khách hàng hoặc nội dung nhạy cảm. Không giả định CLI z-brain đã được cài.'],
  'z-gate': ['Review diff, kiểm tra rủi ro bảo mật và tìm helper có sẵn qua MCP.', 'Dùng zgate_review hoặc zgate_audit_diff theo schema tool thực tế. Dùng zgate_find_helpers trước khi đề xuất helper mới. Trình bày bằng chứng và giới hạn của phân tích tĩnh; không đảm bảo phát hiện mọi lỗi. Gói này không tự chặn git add/commit và không cài hook. Chỉ dùng zgate_install_hook khi người dùng yêu cầu rõ. Không tự stage, commit hay push. Không giả định CLI z-gate đã được cài.'],
  'z-craft': ['Thiết kế, kiểm tra giao diện và tạo HTML preview qua MCP khi người dùng yêu cầu UI.', 'Dùng zcraft_spec để đề xuất trạng thái Default/Loading/Empty/Error và zcraft_lint_ui để hỗ trợ review. HTML từ zcraft_preview chưa chứng minh giao diện đã render đúng: dùng browser để kiểm thử. Chỉ scaffold hoặc tạo checkpoint trong phạm vi được cho phép. Khôi phục checkpoint có thể ghi đè file; kiểm tra thay đổi và xin xác nhận trước khi khôi phục. Không tuyên bố rollback không có rủi ro.'],
  'z-mind': ['Tra cứu quy tắc kỹ thuật, review kế hoạch và kiểm tra kiến trúc qua MCP.', 'Dùng zmind_rules, zmind_audit, zmind_plan hoặc zmind_doctor theo schema đã khám phá. Đối chiếu với yêu cầu và quy ước dự án, không áp đặt quy tắc không phù hợp. zmind_init ghi file dự án và template hiện có còn tham chiếu host cũ; không chạy tự động. Chỉ đề xuất bootstrap sau khi người dùng chấp thuận nội dung và vị trí ghi.'],
  'z-bugfix': ['Quy trình sửa bug có bằng chứng và kiểm thử hồi quy.', 'Xác định cách tái hiện, truy vết symbol bằng z-token nếu có, sửa nhỏ nhất và kiểm thử golden path cùng trường hợp lỗi. Tra cứu zmind_rules khi phù hợp. Không tự lưu memory, commit hoặc thay cấu hình.'],
  'z-refactor': ['Refactor có kiểm soát, giữ nguyên hành vi và đánh giá phạm vi ảnh hưởng.', 'Xác định hợp đồng hành vi, dùng blast_radius hoặc zbrain_impact brief=true nếu có, thay đổi tối thiểu và kiểm thử trước/sau. Dùng zgate_review khi phù hợp. Không mở rộng phạm vi hoặc tạo abstraction cho nhu cầu giả định.'],
  'z-architecture': ['Đánh giá kiến trúc và so sánh phương án dựa trên bằng chứng mã nguồn.', 'Thu thập yêu cầu và ràng buộc, dùng zmind_doctor hoặc zmind_audit nếu phù hợp. Phân biệt dữ kiện với giả thuyết, nêu tradeoff và chờ đồng ý trước khi triển khai câu hỏi mang tính thảo luận.'],
  'z-teamwork': ['Chia công việc thành các phần độc lập khi người dùng cần phối hợp nhiều agent.', 'Chỉ dùng công cụ delegation thực sự có trong phiên và trong phạm vi được cho phép. Phân định file ownership, tránh sửa trùng và xác minh kết quả trả về. Không giả định tên tool, model hoặc command của host khác. Không tự commit, push hoặc đăng thông báo ra hệ thống chia sẻ.'],
};

if (fs.existsSync(output)) throw new Error(`Archive already exists: ${output}`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'z-plugin-qoder-'));
const write = (relative, content) => {
  const target = path.join(stage, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const copy = relative => {
  const source = path.join(root, relative);
  if (!fs.statSync(source).isFile()) throw new Error(`Not a file: ${relative}`);
  write(relative, fs.readFileSync(source));
};
try {
  write('.qoder-plugin/plugin.json', JSON.stringify({ name: 'z-plugin', version: meta.version, description: 'Bộ công cụ z-plugin cho Qoder: 5 MCP server và 9 Skill kỹ thuật.', author: { name: 'kzxl' }, keywords: ['qoder-plugin', 'mcp', 'code-quality'] }, null, 2) + '\n');
  const mcpServers = {};
  for (const [id, libs] of Object.entries(runtime)) {
    copy(`plugins/${id}/plugin.json`);
    copy(`plugins/${id}/scripts/mcp-server.mjs`);
    for (const lib of libs) copy(`plugins/${id}/scripts/lib/${lib}.mjs`);
    const serverFile = path.join(stage, `plugins/${id}/scripts/mcp-server.mjs`);
    let server = fs.readFileSync(serverFile, 'utf8');
    if (id === 'z-token') server = server.replace('".zcode-plugin", "plugin.json"', '"plugin.json"');
    // Qoder packages must not silently load extensions from another host's directories.
    server = server.replace(/,\s*path\.resolve\(homeDir, ["']\.gemini["'], ["']config["'], ["']extensions["']\),?\s*path\.resolve\(homeDir, ["']\.zcode["'], ["']extensions["']\)/g, '');
    fs.writeFileSync(serverFile, server);
    write(`bin/${id}.mjs`, `import path from 'node:path';\nimport { fileURLToPath, pathToFileURL } from 'node:url';\nif (process.env.Z_PLUGIN_WORKSPACE) process.chdir(process.env.Z_PLUGIN_WORKSPACE);\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\nawait import(pathToFileURL(path.join(root, 'plugins', '${id}', 'scripts', 'mcp-server.mjs')).href);\n`);
    mcpServers[id] = { command: 'node', args: [`\${QODER_PLUGIN_ROOT}/bin/${id}.mjs`] };
  }
  copy('plugins/z-token/scripts/config.json');
  copy('plugins/z-brain/data/synonyms.json');
  copy('packages/z-runtime/src/service-registry.mjs');
  copy('LICENSE');
  write('.mcp.json', JSON.stringify({ mcpServers }, null, 2) + '\n');
  for (const [name, [description, body]] of Object.entries(skills)) {
    write(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${body}\n\nKhám phá MCP và đọc schema trước khi gọi; không đoán tên hoặc tham số. Nếu tool không khả dụng, báo rõ và dùng công cụ hiện có. Tuân thủ chính sách an toàn và quyền của Qoder.\n`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, '.qoder-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== 'z-plugin' || !manifest.version) throw new Error('Invalid manifest');
  for (const name of Object.keys(skills)) {
    const skill = fs.readFileSync(path.join(stage, `skills/${name}/SKILL.md`), 'utf8');
    if (!skill.startsWith(`---\nname: ${name}\ndescription: `)) throw new Error(`Invalid skill: ${name}`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (process.platform === 'win32') {
    const literal = value => `'${value.replaceAll("'", "''")}'`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${literal(stage)}, ${literal(output)})`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-q', '-r', output, '.'], { cwd: stage, stdio: 'inherit' });
  }
  console.log(`Qoder archive: ${output}`);
  console.log('5 MCP servers; 9 Skills; no host hooks, agents, commands, UI registration or user configuration changes. z-brain edit tracking runs through its in-process watcher and reconcile pass.');
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
