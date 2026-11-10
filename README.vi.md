# 🔌 z-plugin — Bộ công cụ Tối ưu Ngữ cảnh & Kiểm soát Chất lượng cho AI Coding Agent

[![Phiên bản](https://img.shields.io/badge/version-1.4.0-blue.svg)](package.json)
[![Môi trường](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Nền tảng](https://img.shields.io/badge/N%E1%BB%81n%20t%E1%BA%A3ng-Cursor%20%7C%20Claude%20Code%20%7C%20Antigravity%20%7C%20Windsurf-FF6F00)](https://github.com/kzxl/z-plugin)
[![Giao thức](https://img.shields.io/badge/Giao%20th%E1%BB%A9c-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![Kiểm thử](https://img.shields.io/badge/Tests-22%20b%E1%BB%99%20test%20%7C%20580%2B%20assertions-brightgreen)](package.json)
[![Giấy phép](https://img.shields.io/badge/Gi%E1%BA%A5y%20ph%C3%A9p-MIT-blue.svg)](LICENSE)

[English](README.md) · [Tiếng Việt](README.vi.md) · [Lộ trình phát triển](ROADMAP.md) · [Lịch sử cập nhật](CHANGELOG.md)

> **Chấm dứt lãng phí token, ngăn chặn lỗi ngầm hồi quy và loại bỏ hoàn toàn code rác (AI slop).**  
> `z-plugin` là bộ công cụ kỹ thuật và máy chủ MCP gọn nhẹ, thuần Node.js không dependency nặng, giúp biến **Cursor**, **Claude Code**, **Google Antigravity**, và **Windsurf** thành các kỹ sư senior thực thụ.

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
```

Đối với **Google Antigravity 2.0** và **ZCode**, liên kết toàn bộ plugin thông qua directory junction bằng PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

---

## 💥 Tại sao cần `z-plugin`? (Trước vs. Sau)

| Nỗi đau thực tế khi dùng AI Agent | Khi kích hoạt `z-plugin` | Hiệu quả đo lường |
| :--- | :--- | :---: |
| **Tràn bộ nhớ ngữ cảnh (Context Blowout):** Agent đọc cả file vài nghìn dòng hoặc `grep` không giới hạn, ngốn 40k–80k token mỗi lượt. | **AST Context Diet (`z-token`):** Chỉ trích xuất chữ ký method và đọc đúng khoảng dòng cần sửa; chặn đọc file quá khổ. | **Tiết kiệm 95.5% Token** |
| **Lỗi ngầm hồi quy (Breaking Regressions):** Refactor hàm A làm gãy 6 service liên quan ở xa mà agent không hề hay biết. | **Call-Graph <2ms (`z-token`):** Thuật toán BFS tìm đường gọi hàm ngắn nhất (`tracePath`) xuyên qua Interface và CQRS. | **0 Lỗi Hồi quy** |
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
- **Call-Graph BFS <2ms:** Tìm đường dẫn gọi hàm ngắn nhất giữa 2 hàm/lớp bất kỳ (`tracePath`), tự động bắc cầu giữa Interface (`IService` ↔ `Service`) và MediatR/CQRS.
- **Tính toán bán kính ảnh hưởng (Blast Radius):** Cảnh báo agent khi sửa các "God Node" có quá nhiều class phụ thuộc.

### 2. 🧠 `z-brain` — Bộ nhớ dài hạn & Truy vết bài học kinh nghiệm
- **Ghi nhớ liên phiên:** Tự động lưu và truy xuất các giải pháp sửa lỗi, bài học kiến trúc, và gotcha giữa các phiên làm việc khác nhau.
- **Tìm kiếm lai (Hybrid Search):** Kết hợp SQLite FTS5 BM25 với Trigram Semantic Similarity và hệ số suy giảm theo thời gian.
- **Mở rộng ngữ cảnh từng bước (Progressive Disclosure):** Chỉ nạp mục lục tóm tắt L0 (~30 token/bài học) trước khi làm; chỉ tải chi tiết L2 khi thật sự cần thiết.
- **Hàng đợi ghi bất đồng bộ (`AsyncHarvestQueue`):** Điều phối khóa ghi SQLite khi có nhiều sub-agent hoạt động đồng thời.

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
| [**`z-runtime`**](packages/z-runtime) | **Kernel** | `1.4.0` | **Vi nhân xử lý:** EventBus trong bộ nhớ, Local IPC liên tiến trình, Router nhận thức <1ms, Điều phối ngân sách token linh hoạt. |
| [**`z-token`**](plugins/z-token) | **Plugin** | `1.4.0` | **Tối ưu ngữ cảnh & Call-Graph:** BFS tìm đường gọi hàm <2ms (`tracePath`), Blast radius, AST outline, Capped search, Lọc log build. |
| [**`z-brain`**](plugins/z-brain) | **Plugin** | `1.4.0` | **Bộ nhớ dài hạn:** SQLite WAL nhúng, Tìm kiếm lai BM25 + Trigram, Đồ thị bài học gotchas, Hàng đợi ghi bất đồng bộ. |
| [**`z-mind`**](plugins/z-mind) | **Plugin** | `1.4.0` | **Hệ điều hành nhận thức:** 58 nguyên tắc kỹ thuật chuẩn hóa, Quy trình sửa lỗi 4 pha, Cổng đánh giá Net Engineering Value. |
| [**`z-gate`**](plugins/z-gate) | **Plugin** | `1.4.0` | **Cổng an toàn & Review:** Phân tích luồng Taint, Tận dụng helper có sẵn (`R_REUSE`), Audit diff trước khi commit, Git PreToolUse hook. |
| [**`z-craft`**](plugins/z-craft) | **Plugin** | `1.4.0` | **Tay nghề phần mềm (Craftsmanship):** Linter diệt AI slop, Sinh đặc tả UX 4 trạng thái, Canvas topology đồ thị lực SVG, Snapshot giao diện. |
| [**`dlc-erp`**](extensions/dlc-erp) | **DLC** | `1.4.0` | **Phần mở rộng ERP:** Kiểm toán số học tài chính (`decimal` vs `double`), Quy trình bàn giao kho WMS 2 bước, Khóa chống xung đột SQL `UPDLOCK`. |

---

## 💻 Hướng dẫn cài đặt theo từng IDE / Agent

### Cursor
Chạy lệnh `npx @kzxl/z-plugin init cursor`. Lệnh sẽ tự động tạo:
- `.cursorrules`: Hướng dẫn Cursor tuân thủ 58 nguyên tắc kỹ thuật và ưu tiên gọi các công cụ tiết kiệm token.
- `.cursor/mcp.json`: Đăng ký máy chủ MCP cung cấp `outline`, `search`, `tracePath`, `zbrain_fetch`, và `zgate_review`.

### Claude Code
Chạy lệnh `npx @kzxl/z-plugin init claude`. Lệnh sẽ tạo:
- `CLAUDE.md`: Bản tóm tắt nguyên tắc kỹ thuật ngắn gọn dành cho Claude Code CLI.
- `.claude_mcp.json`: Danh sách endpoint MCP.

### Google Antigravity 2.0 & ZCode
Chạy lệnh PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```
Lệnh sẽ tạo các directory junction tại `~/.gemini/config/plugins/` và `~/.zcode/plugins/` để kích hoạt các hook nguyên bản (`PreToolUse`, `PostToolUse`).

### Windsurf, Copilot, Cline, Roo Code
Chạy lệnh `npx @kzxl/z-plugin init all` để tự động tạo cấu hình cho toàn bộ các agent được hỗ trợ chỉ trong một lần chạy duy nhất.

---

## 📊 Kết quả đo lường thực nghiệm

*Đo đạc thực tế trên các dự án phần mềm doanh nghiệp C# (.NET Framework & SDK-style) và TypeScript.*

| Kịch bản kiểm thử | Agent thông thường (Trước) | Có `z-plugin` (Sau) | Lượng token tiết kiệm |
| :--- | ---:| ---:| :---: |
| Đọc 1 file class lớn (đọc cả file) | 38.749 tokens | 1.761 tokens (`outline`) | **95.5%** |
| Tìm 1 symbol khắp repository (`grep -rn`) | 9.218 tokens | 1.698 tokens (`search`) | **81.6%** |
| Đọc log build nhiều warning | 55.783 tokens | 461 tokens (`build`) | **99.2%** |
| Solution .NET Framework 59 dự án qua MSBuild | 27.258 tokens | 2.104 tokens | **92.3%** |
| Truy vết đường gọi hàm đa tầng (`tracePath`) | Mất vài phút mở tay từng file | **0.97 ms** (Bộ nhớ đệm BFS) | **Tức thì** |

---

## 🧪 Kiểm thử & Bằng chứng thực nghiệm (`R_PROOF`)

Toàn bộ các gói và module đều được kiểm chứng độc lập bởi 22 bộ kiểm thử tự động đạt tiêu chuẩn Level 3+:

```bash
# Kiểm tra cú pháp toàn bộ monorepo
npm run check

# Chạy toàn bộ 22 bộ test (hơn 580 assertions thành công)
npm test

# Kiểm tra smoke test máy chủ MCP
npm run smoke

# Chạy đo lường benchmark đo token tiết kiệm
npm run bench
```

---

## 📄 Giấy phép mã nguồn

Dự án được phân phối mã nguồn mở theo giấy phép [MIT License](LICENSE).
