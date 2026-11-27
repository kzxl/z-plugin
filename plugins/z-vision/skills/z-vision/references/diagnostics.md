# Z-Vision Diagnostic & Troubleshooting Guide

| Error / Symptom | Root Cause | Remediation |
| :--- | :--- | :--- |
| `observation_id expired` / `window bounds drift > 4px` | Window moved, resized, or `observation_id` was already consumed (one-use contract) | Call `zvision_observe` again to capture fresh coordinates and a new `observation_id` |
| `restricted_process` blocks typing/hotkeys | Target is a terminal/IDE (`pwsh`, `cmd`, `WindowsTerminal`, `Code`, `devenv`, `rider64`, `regedit`) | Default is click-only (`file_dialog` included); use `run_command` or ask user instead of bypassing unless `allow_restricted: true` is explicitly warranted |
| `blocked_process` (`consent.exe` / `CredentialUIBroker.exe`) | OS UAC or credential prompt cannot be automated safely | Stop automation and hand off directly to the user to complete elevation/login |
| Action rejected due to sensitive label / `close_window` | Label matches destructive/auth/payment keywords or `Alt+F4` / `Win+R` | Obtain explicit user confirmation first, then pass `confirm_sensitive: true` with `reason` |
| Dimmed region lock stuck or stale virtual overlay | Previous run interrupted before unlock or TTL (`<= 30s`) | Press physical `Esc` / `Ctrl+Alt+F12` or call `zvision_stop(action: "unlock")`; call `zvision_stop(action: "reset")` only after user approval |
| Non-UIA app returns empty control tree | Canvas/Electron/custom-drawn UI lacks UIA automation peers | Re-run `zvision_observe` with `with_som: "on"` and target via `som_id`, `with_ocr: true`, or `match_template` |
