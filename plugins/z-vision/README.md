# z-vision

Sovereign Windows desktop perception and guarded precision agent arm for `z-plugin`. Zero npm dependencies and zero .NET SDK required — the native Windows host (`ZVisionHost.exe`) compiles on-the-fly from C# 5 sources via stock `.NET Framework 4.x` `csc.exe` and caches per SHA-256 content hash under `~/.z-plugin/z-vision/bin/`.

## Capabilities

- **Token-Diet Observation (`zvision_observe`)**:
  - Compact UI Automation (UIA) tree (`index`, `role`, `name`, `aid`, `rect`, supported patterns).
  - 64-bit Difference Hash (`dhash`) ported from `ZeroGraphics.Vision`: when `with_image: "auto"` (default) sees Hamming distance `<= 2` and UIA controls are available, redundant screenshots are suppressed.
  - Per-Monitor DPI-aware window capture (`PrintWindow` with `BitBlt` fallback) and auto-scaled screenshot coordinates.
- **Native Windows OCR (`zvision_ocr`)**:
  - Uses stock `Windows.Media.Ocr` (WinRT) when available on Windows 10/11, returning lines, words, and absolute screen coordinates; degrades gracefully when unavailable.
- **Precision Agent Arm (`zvision_act`, `zvision_plan`)**:
  - Physical `SendInput` mouse (`click`, `double_click`, `right_click`, `move`, `drag` multi-point strokes, `scroll`), full UTF-16/Vietnamese `KEYEVENTF_UNICODE` typing, STA clipboard-preserving `paste`, hotkey chords (`key`), and semantic UIA `Invoke` / `SetValue` (`physical: false`).
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
