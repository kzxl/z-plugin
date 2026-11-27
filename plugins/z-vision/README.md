# z-vision

Sovereign Windows desktop perception and guarded precision agent arm for `z-plugin`. Zero npm dependencies and zero .NET SDK required — the native Windows host (`ZVisionHost.exe`) compiles on-the-fly from C# 5 sources via stock `.NET Framework 4.x` `csc.exe` and caches per SHA-256 content hash under `~/.z-plugin/z-vision/bin/`.

## Visual Demos

- **Token-Diet Observation (`dhash` + DWM bounds)**: ![Token-Diet Vision](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-vision-dhash.gif)
- **Virtual Mouse (`mode: "virtual"`)**: ![Virtual Mouse](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-virtual-mouse.gif)
- **Multi-Arrow Parallel (`zvision_parallel` + `ArrowOverlay.cs`)**: ![Multi-Arrow Parallel](https://raw.githubusercontent.com/kzxl/z-vision/main/assets/demo-multi-arrow-parallel.gif)

## Capabilities

- **Token-Diet Observation & Launch (`zvision_windows`, `zvision_observe`)**:
  - Built-in `launch_exe` / `launch_args` on `zvision_windows` returns both `bounds` (`DWMWA_EXTENDED_FRAME_BOUNDS`) and `client_bounds` (`GetClientRect`).
  - Compact UI Automation (UIA) tree (`index`, `role`, `name`, `aid`, `rect`, supported patterns) hardened against transient COM disposal.
  - 64-bit Difference Hash (`dhash`) ported from `ZeroGraphics.Vision`: when `with_image: "auto"` suppresses redundant unchanged frames, `image_size` resets to unscaled `bounds` dimensions so coordinate mapping stays exact.
  - Per-Monitor DPI-aware window capture (`PrintWindow` with DWM-aligned `BitBlt` fallback) and explicit `coord_space` (`image` | `window` | `client` | `screen`).
- **Native Windows OCR (`zvision_ocr`)**:
  - Uses stock `Windows.Media.Ocr` (WinRT) when available on Windows 10/11, returning lines, words, and absolute screen coordinates; degrades gracefully when unavailable.
- **Precision Physical, Virtual & Multi-Pointer Arm (`zvision_act`, `zvision_plan`, `zvision_parallel`)**:
  - Physical pixel-center `SendInput` (`mode: "physical"`) with `restore_cursor` support, full UTF-16/Vietnamese `KEYEVENTF_UNICODE` typing, STA clipboard-preserving `paste`, hotkey chords (`key`), and semantic UIA `Invoke` / `SetValue` (`mode: "uia"` or `physical: false`).
  - **Virtual Mouse (`mode: "virtual"`)**: Resolves leaf child windows (`ChildWindowFromPointEx` + `ScreenToClient`) and posts `WM_MOUSEMOVE` / `WM_LBUTTON*` / `WM_MOUSEWHEEL` / `WM_CHAR` directly to `HWND` without hijacking the hardware cursor or stealing focus.
  - **Multi-Pointer & Multi-Arrow HUD (`zvision_parallel`, `ArrowOverlay.cs`)**: Executes up to 8 concurrent lanes (`virtual` per-lane `PostMessage` or Win8+ `touch` multi-contact `InjectTouchInput`) with numbered click-through topmost arrows (`#1`..`#N`).
  - Sequential batch `zvision_plan` (up to 50 steps) with `wait_settle` (`dhash` stability) and `wait_text`, stopping immediately on first failure.
- **Safety & Emergency Stop (`zvision_stop`)**:
  - One-use `observation_id` with window-drift validation (`<= 4px`) and Stop-generation invalidation.
  - Process tiers: UAC/credential helpers `blocked`; terminals/IDEs `click-only` by default; EN/VI sensitive labels & dangerous hotkeys require `confirm_sensitive: true`.
  - Dedicated `WH_KEYBOARD_LL` hook: physical `Esc` or `Ctrl+Alt+F12` immediately halts input and releases held keys/buttons via `InputLedger`.

## CLI Quick Usage

```bash
node plugins/z-vision/scripts/cli.mjs build
node plugins/z-vision/scripts/cli.mjs status
node plugins/z-vision/scripts/cli.mjs windows
node plugins/z-vision/scripts/cli.mjs observe 0 --image
node plugins/z-vision/scripts/cli.mjs stop
```
