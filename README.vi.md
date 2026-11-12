# 🔌 z-plugin — Bộ công cụ Tối ưu Ngữ cảnh & Kiểm soát Chất lượng cho AI Coding Agent

[![Phiên bản](https://img.shields.io/badge/version-1.9.0-blue.svg)](package.json)
[![Môi trường](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Nền tảng](https://img.shields.io/badge/N%E1%BB%81n%20t%E1%BA%A3ng-Cursor%20%7C%20Claude%20Code%20%7C%20Antigravity%20%7C%20ZCode%20%7C%20Qoder%20%7C%20Windsurf-FF6F00)](https://github.com/kzxl/z-plugin)
[![Giao thức](https://img.shields.io/badge/Giao%20th%E1%BB%A9c-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![Kiểm thử](https://img.shields.io/badge/Tests-27%20b%E1%BB%99%20test%20%7C%20620%2B%20assertions-brightgreen)](package.json)
[![Giấy phép](https://img.shields.io/badge/Gi%E1%BA%A5y%20ph%C3%A9p-MIT-blue.svg)](LICENSE)

[English](README.md) · [Tiếng Việt](README.vi.md) · [Lộ trình phát triển](ROADMAP.md) · [Lịch sử cập nhật](CHANGELOG.md)

> **Chấm dứt lãng phí token, ngăn chặn lỗi ngầm hồi quy và loại bỏ hoàn toàn code rác (AI slop).**  
> `z-plugin` là bộ công cụ kỹ thuật và máy chủ MCP gọn nhẹ, thuần Node.js không dependency nặng, giúp biến **Cursor**, **Claude Code**, **Google Antigravity**, **ZCode**, **Qoder**, và **Windsurf** thành các kỹ sư senior thực thụ.

---

## ⚡ Khởi động nhanh trong 30 giây

Không cần clone repo hay cấu hình thủ công. Chạy trực tiếp ngay trong thư mục dự án của bạn:

```bash
# Cấu hình tự động cho Cursor (.cursorrules + .cursor/mcp.json)
npx @kzxl/z-plugin init cursor

# Hoặc cấu hình cho Claude Code (CLAUDE.md + .claude_mcp.json)
npx @kzxl/z-plugin init claude

# Hoặc cấu hình cho TẤT CẢ các agent (Cursor, Claude, Windsurf, Copilot, Cline)
npx @kzxl/z-plugin init all

# Xem giao diện demo trực quan các tính năng
npx @kzxl/z-plugin demo

# Mở dashboard trực quan về token và chi phí (không cần chạy dịch vụ nền)
npx @kzxl/z-plugin dashboard --open
```

Đối với **Google Antigravity 2.0** và **ZCode**, đồng bộ toàn bộ plugin, subagent và đăng ký MCP bằng PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Đối với **Qoder Desktop**, tải `z-plugin-qoder-<phiên bản>.zip` từ [bản phát hành mới nhất](https://github.com/kzxl/z-plugin/releases/latest) rồi nhập bằng trình cài Plugin của Qoder (xem [Qoder Desktop](#qoder-desktop)).

---

## 💥 Tại sao cần `z-plugin`? (Trước vs. Sau)

| Nỗi đau thực tế khi dùng AI Agent | Khi kích hoạt `z-plugin` | Hiệu quả đo lường |
| :--- | :--- | :---: |
| **Tràn bộ nhớ ngữ cảnh (Context Blowout):** Agent đọc cả file vài nghìn dòng hoặc `grep` không giới hạn, ngốn 40k–80k token mỗi lượt. | **AST Context Diet (`z-token`):** Chỉ trích xuất chữ ký method và đọc đúng khoảng dòng cần sửa; chặn đọc file quá khổ. | **Tiết kiệm 95.5% Token** |
| **Lỗi ngầm hồi quy (Breaking Regressions):** Refactor hàm A làm gãy 6 service liên quan ở xa mà agent không hề hay biết. | **Call-Graph <2ms (`z-token`):** Thuật toán BFS tìm đường gọi hàm ngắn nhất (`trace_path`) xuyên qua Interface và CQRS. | **0 Lỗi Hồi quy** |
| **Lỗ hổng bảo mật tiềm ẩn:** Agent truyền trực tiếp biến từ người dùng vào câu SQL hoặc lệnh thực thi hệ thống (`exec`). | **Taint Analysis (`z-gate`):** Phân tích luồng dữ liệu vào các điểm nhạy cảm, nhận biết sớm các mệnh đề guard (`if return`). | **Chống Taint Flow** |
| **AI "mất trí nhớ" (Amnesia):** Cứ mở phiên chat mới là agent lại quên hết kinh nghiệm xử lý lỗi, lặp lại cùng một sai lầm cũ. | **Bộ nhớ dài hạn (`z-brain`):** Lưu trữ SQLite WAL cục bộ với tìm kiếm lai BM25 + Trigram để gọi lại bài học cũ tức thì. | **Học liên tục** |
| **Code rác & AI Slop:** Agent tự ý chèn màu gradient tím neon, shadow quá khổ, tạo nút bấm chết (`onClick={() => {}}`). | **Anti-Slop AST Linter (`z-craft`):** Bắt buộc tuân thủ token màu của dự án và ma trận 4 trạng thái giao diện (4-State UX). | **Điểm chuẩn $\ge$ 90/100** |

---

## 🧩 5 Siêu năng lực cốt lõi

```
                    ┌──────────────────────────────────────────────┐
                    │      AI Coding Agent (Cursor / Claude / ...)  │
                    └──────────────────────┬───────────────────────┘
                                           │ Giao thức MCP JSON-RPC / CLI
                    ┌──────────────────────▼───────────────────────┐
                    │          z-runtime (Bộ định tuyến nhận thức)  │
                    └──────┬──────────┬──────────┬──────────┬──────┘
                           │          │          │          │
             ┌─────────────▼┐   ┌─────▼────────┐ │    ┌─────▼────────┐
             │   z-token    │   │   z-brain    │ │    │   z-craft    │
             │ Tiết kiệm    │   │ Bộ nhớ dài hạn│ │   │ Diệt AI Slop │
             │ token & AST  │   │ SQLite FTS5  │ │    │ 4-State UX   │
             └──────────────┘   └──────────────┘ │    └──────────────┘
                                ┌────────────────▼───┐
                                │ z-mind  &  z-gate  │
                                │ Chuẩn mực kỹ thuật │
                                │ & Kiểm tra an toàn │
                                └────────────────────┘
```

### 1. 🛡️ `z-token` — Tường lửa Token & Phân tích Call-Graph
- **Tiết kiệm token kỷ lục:** Giảm tới **95.5% token** khi đọc các file lớn và **99.2% token** khi đọc log build nhiều warning.
- **AST Outline:** Trích xuất nhanh chữ ký class, hàm, method kèm số dòng cho hơn 16 ngôn ngữ (`outline`), không cần nạp cả file vào ngữ cảnh.
- **Call-Graph BFS <2ms:** Tìm đường dẫn gọi hàm ngắn nhất giữa 2 hàm/lớp bất kỳ (`trace_path`), tự động bắc cầu giữa Interface (`IService` ↔ `Service`) và MediatR/CQRS.
- **Tính toán bán kính ảnh hưởng (Blast Radius):** Cảnh báo agent khi sửa các "God Node" có quá nhiều class phụ thuộc.

### 2. 🧠 `z-brain` — Bộ nhớ dài hạn & Truy vết bài học kinh nghiệm
- **Ghi nhớ liên phiên:** Tự động lưu và truy xuất các giải pháp sửa lỗi, bài học kiến trúc, và gotcha giữa các phiên làm việc khác nhau.
- **Tìm kiếm lai (Hybrid Search):** Kết hợp SQLite FTS5 BM25 với Trigram Semantic Similarity và hệ số suy giảm theo thời gian.
- **Mở rộng ngữ cảnh từng bước (Progressive Disclosure):** Chỉ nạp mục lục tóm tắt L0 (~30 token/bài học) trước khi làm; chỉ tải chi tiết L2 khi thật sự cần thiết.
- **Lịch sử sửa file tự động:** Hook của host ghi mọi lần sửa file (tool, số dòng thêm/xóa, patch đã che secrets) vào `file_events`; watcher theo dõi git và lượt reconcile bù cho host không có hook, không cần ghi log thủ công.
- **Chỉ mục file workspace:** `file_index` lưu path, mtime, size, hash, ngôn ngữ và số symbol; `zbrain_history`, `zbrain_changes`, `zbrain_impact` trả lời file đã đổi gì và phụ thuộc gì.
- **Pre-flight Brief:** `zbrain_impact(file, brief: true)` (hoặc `z-brain preflight <file>`) trả về bản tóm tắt trước khi sửa, giới hạn cứng ~300 token: churn 30 ngày, blast radius và God Node từ call graph, file cùng sửa, file test bị ảnh hưởng, gotcha cũ và invariant `z-mind` tương ứng. Thiếu cache hoặc plugin thì tự giảm cấp, không lỗi.
- **Một bộ nhớ cho mọi IDE:** database nằm tại `~/.z-plugin/brain.sqlite` (ghi đè bằng `ZBRAIN_DB_PATH`), nên tri thức học ở Qoder, ZCode hay Antigravity đều dùng chung. DB thời 1.8 trở về trước được tự động adopt, `PRAGMA user_version` chặn nâng cấp schema sai hướng, và `z-brain db info|backup|restore|import` quản trị dữ liệu.
- **Câu trả lời có trần token:** lịch sử chỉ hiện 10–12 event mới nhất, tối đa 2 patch preview ngắn; timeline và thông tin file cắt bớt summary dài để tra cứu không phình ngữ cảnh.
- **Hàng đợi ghi bất đồng bộ (`AsyncHarvestQueue`):** Điều phối khóa ghi SQLite khi có nhiều sub-agent hoạt động đồng thời, kèm spool JSONL khi database bận.

### 3. ⚖️ `z-mind` — Bộ khung tư duy kỹ thuật & Kỷ luật phát triển
- **58 Nguyên tắc bất biến:** Tự động áp dụng SOLID (`R_CORE`), Test-Driven Development (`R_TDD`), Net Engineering Value (`R_NEV`), và Bằng chứng thực nghiệm (`R_PROOF`).
- **Chẩn đoán lỗi 4 giai đoạn:** Buộc agent phải lập luận cô lập nguyên nhân gốc rễ trước khi đụng vào code chạy thật.
- **Gói quy tắc mở rộng (Rule Packs):** Dễ dàng mở rộng cho các lĩnh vực chuyên biệt (ERP, Fintech, Y tế).

### 4. 🔍 `z-gate` — Tái sử dụng code, Taint Analysis & Đánh giá trước commit
- **Tận dụng tài nguyên sẵn có (`R_REUSE`):** Quét các hàm tiện ích (`Helpers/`, `Extensions/`) có sẵn trong repo, ngăn agent viết code trùng lặp vô ích.
- **Phân tích luồng dữ liệu bẩn (`trace_data_flow`):** Phát hiện nguy cơ SQL Injection, Command Injection trước khi code chạy.
- **Audit Diff trước khi commit:** Chặn tình trạng "Wrapper Hell" (tạo interface chỉ có 1 implementation), bẫy deadlock sync-over-async (`.Result`, `.Wait()`), và phình dòng code vô lý.

### 5. ✨ `z-craft` — Linter chống AI Slop & Chuẩn hóa trải nghiệm người dùng
- **Anti-AI-Slop AST Linter (`R_ANTI_SLOP`):** Quét và loại bỏ gradient tím neon sến sẩm, mã màu hex tùy tiện, shadow quá khổ, và các event handler rỗng.
- **Ma trận 4 trạng thái giao diện (4-State UX):** Bắt buộc component phải có: Mặc định, Loading skeleton, Trạng thái rỗng (Empty), và Báo lỗi kèm nút Thử lại (Retry).
- **Topology Canvas tương tác:** Sinh biểu đồ lực SVG tương tác để trực quan hóa kiến trúc codebase theo cụm Leiden.
- **Cỗ máy thời gian (Vibe Time-Machine):** Chụp checkpoint 1 cú click để thoải mái thử nghiệm thiết kế giao diện mà không làm bẩn lịch sử Git.

---

## 📦 Các module & Extension trong Monorepo

| Thành phần | Loại | Phiên bản | Trọng tâm & Tính năng chính |
| :--- | :---: | :---: | :--- |
| [**`z-runtime`**](packages/z-runtime) | **Kernel** | `1.9.0` | **Vi nhân xử lý:** EventBus trong bộ nhớ, Local IPC liên tiến trình, Router nhận thức <1ms, Điều phối ngân sách token linh hoạt. |
| [**`z-token`**](plugins/z-token) | **Plugin** | `1.9.0` | **Tối ưu ngữ cảnh & Call-Graph:** BFS tìm đường gọi hàm <2ms (`trace_path`), Blast radius, AST outline, Capped search, Lọc log build. |
| [**`z-brain`**](plugins/z-brain) | **Plugin** | `1.9.0` | **Bộ nhớ dài hạn:** SQLite WAL nhúng, Tìm kiếm lai BM25 + Trigram, Đồ thị bài học gotchas, Hàng đợi ghi bất đồng bộ, Lịch sử sửa file và chỉ mục file tự động, Pre-flight Brief giới hạn token, một database dùng chung theo user. |
| [**`z-mind`**](plugins/z-mind) | **Plugin** | `1.9.0` | **Hệ điều hành nhận thức:** 58 nguyên tắc kỹ thuật chuẩn hóa, Quy trình sửa lỗi 4 pha, Cổng đánh giá Net Engineering Value. |
| [**`z-gate`**](plugins/z-gate) | **Plugin** | `1.9.0` | **Cổng an toàn & Review:** Phân tích luồng Taint, Tận dụng helper có sẵn (`R_REUSE`), Audit diff trước khi commit, Git PreToolUse hook. |
| [**`z-craft`**](plugins/z-craft) | **Plugin** | `1.9.0` | **Tay nghề phần mềm (Craftsmanship):** Linter diệt AI slop, Sinh đặc tả UX 4 trạng thái, Canvas topology đồ thị lực SVG, Snapshot giao diện. |
| [**`dlc-erp`**](extensions/dlc-erp) | **DLC** | `1.9.0` | **Phần mở rộng ERP:** Kiểm toán số học tài chính (`decimal` vs `double`), Quy trình bàn giao kho WMS 2 bước, Khóa chống xung đột SQL `UPDLOCK`. |

---

## 💻 Hướng dẫn cài đặt theo từng IDE / Agent

### Qoder Desktop

Yêu cầu Node.js >=22.13 có `node:sqlite` và lệnh `node` trong PATH. Từ thư mục repository, chạy:

```bash
npm run package:qoder
npm run test:qoder
```

Gói được tạo tại `dist/z-plugin-qoder-<phiên bản>.zip` (cũng được đính kèm trong mỗi GitHub Release), với `.qoder-plugin/plugin.json` ở gốc ZIP. Nhập ZIP bằng trình cài Plugin của Qoder; script đóng gói không cài đặt hoặc thay đổi cấu hình người dùng. Nếu ZIP đã tồn tại, script từ chối ghi đè: di chuyển bản cũ trước khi đóng gói lại.

Gói gồm 5 MCP server và 9 Skill được điều chỉnh cho Qoder. MCP sử dụng `${QODER_PLUGIN_ROOT}`; mặc định công cụ làm việc trong thư mục hiện tại của tiến trình do host cung cấp. Nếu host không khởi chạy trong workspace dự án, đặt biến môi trường `Z_PLUGIN_WORKSPACE` thành đường dẫn dự án tuyệt đối trước khi khởi chạy Qoder. Giữ nguyên các biến cấu hình như `ZBRAIN_DB_PATH`, `ZERO_TOKEN_CONFIG` và `ZERO_TOKEN_DATA` khi cần vị trí dữ liệu riêng.

Gói không chứa hooks, agents, commands, UI registration, DLC ERP hoặc cấu hình riêng của máy; không tự tải extension từ thư mục Antigravity/ZCode. Không dùng `install.ps1` để cài Qoder. Skill không tự lưu memory, commit, cài Git hook hoặc khôi phục checkpoint. `zmind_init` vẫn dùng template host cũ nên không chạy tự động.

Kiểm thử gói xác minh cấu trúc ZIP, cú pháp runtime, handshake MCP, danh sách tool, một tool cơ bản trên mỗi server và workspace override trong môi trường tạm. Đây chưa phải bằng chứng Qoder Desktop đã nạp plugin hoặc mọi tool đã hoạt động; UI và luồng cài thực tế cần được kiểm tra riêng.

### Cursor
Chạy lệnh `npx @kzxl/z-plugin init cursor`. Lệnh sẽ tự động tạo:
- `.cursorrules`: Hướng dẫn Cursor tuân thủ 58 nguyên tắc kỹ thuật và ưu tiên gọi các công cụ tiết kiệm token.
- `.cursor/mcp.json`: Đăng ký máy chủ MCP cung cấp `outline`, `search`, `trace_path`, `zbrain_fetch`, và `zgate_review`.

### Claude Code
Chạy lệnh `npx @kzxl/z-plugin init claude`. Lệnh sẽ tạo:
- `CLAUDE.md`: Bản tóm tắt nguyên tắc kỹ thuật ngắn gọn dành cho Claude Code CLI.
- `.claude_mcp.json`: Danh sách endpoint MCP.

### Google Antigravity 2.0 & ZCode
Chạy lệnh PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```
Lệnh sẽ đồng bộ (sao chép) plugin vào `~/.gemini/config/plugins/` và `~/.zcode/plugins/`, đăng ký MCP và kích hoạt các hook nguyên bản (`PreToolUse`, `PostToolUse`). Dùng `-Development` nếu muốn tạo liên kết thay vì sao chép.

### Codex
Chạy `node tools/agent-bridge.mjs export codex`. Lệnh tạo `AGENTS.md`, bổ sung các bảng `[mcp_servers.z-*]` còn thiếu vào `.codex/config.toml` (giữ nguyên bảng cũ) và cài `.codex/hooks.json` để mọi lần sửa file qua `apply_patch` được ghi vào z-brain.

### Qoder Desktop (hook cấp dự án)
Gói plugin Qoder không kèm hook; z-brain vẫn tự động nhờ watcher và lượt reconcile git trong MCP server ở lần gọi tool đầu tiên. Nếu muốn hook cấp dự án, chạy `node tools/agent-bridge.mjs export qoder`: lệnh merge sâu `.qoder/settings.json`, giữ nguyên `mcpServers` và nhóm hook đã có.

### Antigravity (hook cấp dự án)
Chạy `node tools/agent-bridge.mjs export antigravity` để merge `.agents/hooks.json` dưới nhóm `z-brain` và đăng ký MCP trong `.agents/mcp_config.json`, không ghi đè cấu hình có sẵn.

### Windsurf, Copilot, Cline, Codex, Qoder, Antigravity
Chạy lệnh `npx @kzxl/z-plugin init all` để tạo cấu hình cho Cursor, Claude Code, Windsurf, Cline, Copilot, Codex, Qoder và Antigravity trong một lần. Copilot chỉ nhận instructions (không có cấu hình MCP). Continue và Roo Code chưa được hỗ trợ.

---

## 📈 Dashboard theo dõi token (không cần dịch vụ nền)

Xem lượng ngữ cảnh bị chặn, hiệu quả các tool MCP, mức tiêu thụ ngữ cảnh của Antigravity và ZCode, cùng tri thức trong `z-brain` mà không cần dịch vụ chạy nền. Mục **Edit Activity** hiển thị số edit hôm nay, file thay đổi nhiều trong 7 ngày và các edit gần nhất (thao tác, tool, dòng thêm/xóa) đọc trực tiếp từ SQLite — không tốn token ngữ cảnh:

```bash
# 1. Trong khung chat agent, từ bất kỳ dự án nào:
/z-token dashboard

# 2. CLI toàn cục từ bất kỳ thư mục nào (được install.ps1 liên kết):
z-plugin dashboard --open

# 3. Máy chủ HTTP cục bộ tạm thời (127.0.0.1), tự làm mới /api/metrics (Ctrl+C để dừng):
z-plugin dashboard --serve --open
```

---

## 📊 Kết quả đo lường thực nghiệm

*Đo đạc thực tế trên các dự án phần mềm doanh nghiệp C# (.NET Framework & SDK-style) và TypeScript.*

| Kịch bản kiểm thử | Agent thông thường (Trước) | Có `z-plugin` (Sau) | Lượng token tiết kiệm |
| :--- | ---:| ---:| :---: |
| Đọc 1 file class lớn (đọc cả file) | 38.749 tokens | 1.761 tokens (`outline`) | **95.5%** |
| Tìm 1 symbol khắp repository (`grep -rn`) | 9.218 tokens | 1.698 tokens (`search`) | **81.6%** |
| Đọc log build nhiều warning | 55.783 tokens | 461 tokens (`build`) | **99.2%** |
| Solution .NET Framework 59 dự án qua MSBuild | 27.258 tokens | 2.104 tokens | **92.3%** |
| Truy vết đường gọi hàm đa tầng (`trace_path`) | Mất vài phút mở tay từng file | **0.97 ms** (Bộ nhớ đệm BFS) | **Tức thì** |

---

## 🧪 Kiểm thử & Bằng chứng thực nghiệm (`R_PROOF`)

Toàn bộ các gói và module đều được kiểm chứng độc lập bởi 25 bộ kiểm thử tự động đạt tiêu chuẩn Level 3+:

```bash
# Kiểm tra cú pháp toàn bộ monorepo
npm run check

# Chạy toàn bộ 27 bộ test (hơn 620 assertions thành công)
npm test

# Đóng gói và kiểm tra ZIP plugin cho Qoder
npm run package:qoder
npm run test:qoder

# Kiểm tra smoke test máy chủ MCP
npm run smoke

# Chạy đo lường benchmark đo token tiết kiệm
npm run bench
```

---

## 📄 Giấy phép mã nguồn

Dự án được phân phối mã nguồn mở theo giấy phép [MIT License](LICENSE).
