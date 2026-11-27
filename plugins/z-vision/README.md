# z-vision

Sovereign Windows desktop perception and guarded precision agent arm for `z-plugin`. Zero npm dependencies and zero .NET SDK required — the native Windows host (`ZVisionHost.exe`) compiles on-the-fly from C# 5 sources via stock `.NET Framework 4.x` `csc.exe` and caches per SHA-256 content hash under `~/.z-plugin/z-vision/bin/`.

## Visual Demos

- **Token-Diet Observation (`dhash` + DWM bounds)**: ![Token-Diet Vision](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-vision-dhash.gif)
- **Virtual Mouse (`mode: "virtual"`)**: ![Virtual Mouse](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-virtual-mouse.gif)
- **Multi-Arrow Parallel (`zvision_parallel` + `ArrowOverlay.cs`)**: ![Multi-Arrow Parallel](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-multi-arrow-parallel.gif)

## Capabilities

- **Token-Diet Observation, OCR & Set-of-Marks (`zvision_windows`, `zvision_observe`, `zvision_ocr`)**:
  - Built-in `launch_exe` / `launch_args` and polling `wait_for` (`wait_state: "open"|"closed"`) on `zvision_windows`, returning both `bounds` (`DWMWA_EXTENDED_FRAME_BOUNDS`) and `client_bounds` (`GetClientRect`).
  - Cached UI Automation (UIA) tree (`with_uia: "full"|"diff"|"off"`, `only_interactive`, supported patterns, plus `SelectionPattern` readback for read-only ComboBoxes) hardened against transient COM disposal.
  - 64-bit Difference Hash (`dhash`) + `dirty_rect` + direct foreground `roi` capture: when `with_image: "auto"` suppresses redundant unchanged frames, `image_size` resets to unscaled `bounds` dimensions so coordinate mapping stays exact.
  - Automatic Set-of-Marks (`with_som: "off"|"auto"|"on"`) tagging non-UIA controls with `som_id` anchors, plus Per-Monitor DPI-aware capture and explicit `coord_space` (`image` | `window` | `client` | `screen`).
  - Stock `Windows.Media.Ocr` (WinRT) on Windows 10/11 returning lines, words, and absolute screen coordinates; degrades gracefully when unavailable.
- **Multi-Mode Actuation, Window Manager & Shapes (`zvision_act`, `zvision_parallel`)**:
  - **`mode: "auto"`**: Resolves the least-intrusive working path automatically — semantic UIA -> cached/probed `pen` (`PT_PEN`) or `virtual` verified via frame diff -> `physical` fallback.
  - **Semantic UIA (`mode: "uia"`)**: `click`, `set_value`, `expand`, `collapse`, `toggle`, `select_item`, `set_range`, and `scroll_into_view`.
  - **Virtual Mouse (`mode: "virtual"`)**: Resolves leaf child windows (`ChildWindowFromPointEx` + `ScreenToClient`) and posts `WM_MOUSEMOVE` / `WM_LBUTTON*` / `WM_MOUSEWHEEL` / `WM_CHAR` directly to `HWND` without hijacking the hardware cursor or stealing focus.
  - **Physical & Pen (`mode: "physical"` / `"pen"` / `"touch"`)**: Pixel-center `SendInput` / `PT_PEN` with `restore_cursor`, `hover`, `modifiers`, `modifier_drag`, UTF-16/Vietnamese `KEYEVENTF_UNICODE` typing, STA clipboard-preserving `paste`, and hotkey chords (`key`).
  - **Window Manager & `#32770` File Dialogs**: `move_window`, `snap_window`, `minimize`, `maximize`, `restore`, `close_window`, and native `file_dialog` automation (address bar, filename box, Confirm/Open button).
  - **Visual Targeting & Vector Shapes**: Target controls by `som_id` or `template_path`, draw native geometry primitives (`draw_shape`: `bezier` / `ellipse` / `rect` / `polygon`), and execute up to 8 concurrent `zvision_parallel` lanes (`virtual` or `touch`) with numbered click-through topmost arrows (`ArrowOverlay.cs`).
- **1-RPC Batching, Branching, Assertions & Macros (`zvision_plan`)**:
  - Executes up to **200** steps in a single 1-RPC `plan_batch` with per-step `retry`/`backoff_ms` and UIA/visual waiters (`wait_control`, `wait_window`, `wait_ocr`, `wait_pixel_color`, `wait_template`, `wait_settle`, `wait_text`).
  - Supports conditional branching (`if_control`, `if_ocr`, `if_pixel`), end-to-end assertions (`assert_control`, `assert_ocr`, `assert_pixel`), and 0-token parameterized macro replay (`macro_action: save|run|list|delete`).
- **Visual & Structured Analysis (`zvision_analyze`)**:
  - `extract_table` (with `auto_scroll` / `max_pages` pagination for virtualized grids), `clipboard_get` / `clipboard_set` (`text` / `image` / `files` / `clear`), multi-scale `match_template` (`TemplateMatcher.cs`), tight-bbox `sample_pixels`, `find_color_bounds`, `vectorize_image`, and `compare_reference`.
- **Safety, Region Input-Lock HUD & Audit Log (`zvision_stop`)**:
  - One-use `observation_id` with window-drift validation (`<= 4px`) and Stop-generation invalidation.
  - Process tiers: UAC/credential helpers `blocked`; terminals/IDEs `click-only` by default (including `file_dialog`); EN/VI sensitive labels & destructive hotkeys (`Alt+F4`, `Win+R`, `close_window`) require `confirm_sensitive: true`.
  - Dimmed click-through `RegionLockOverlay` (`lock_region`, `lock_policy: "soft"|"strict"`, `status_text`, `follow_window`, `WDA_EXCLUDEFROMCAPTURE`, `<= 30s` TTL) managed via `act`/`plan` or `zvision_stop(action="lock"|"unlock"|"status_text")`.
  - Dedicated `WH_KEYBOARD_LL` emergency stop (`Esc` or `Ctrl+Alt+F12`), `InputLedger` key/button release, and secret-redacted JSONL audit logging (`~/.z-plugin/z-vision/audit.jsonl`).

## CLI Quick Usage

```bash
node plugins/z-vision/scripts/cli.mjs build
node plugins/z-vision/scripts/cli.mjs status
node plugins/z-vision/scripts/cli.mjs windows [filter]
node plugins/z-vision/scripts/cli.mjs observe [hwnd] [--image] [--no-uia|--diff-uia]
node plugins/z-vision/scripts/cli.mjs ocr [hwnd]
node plugins/z-vision/scripts/cli.mjs table [hwnd] [index]
node plugins/z-vision/scripts/cli.mjs clipboard [get|set-text <txt>|set-image <path>|clear]
node plugins/z-vision/scripts/cli.mjs match <hwnd> <template_path> [min_score]
node plugins/z-vision/scripts/cli.mjs macro [list|run <name> [hwnd]|delete <name>]
node plugins/z-vision/scripts/cli.mjs lock [unlock|<hwnd> [status_text]]
node plugins/z-vision/scripts/cli.mjs sample <hwnd> <x> <y>
node plugins/z-vision/scripts/cli.mjs vectorize <image_path> [w] [h]
node plugins/z-vision/scripts/cli.mjs stop [reset]
```
