# Safe Credentials Protocol (`R_SEC`)

**Goal:** Verify and provision API keys or secrets without ever loading their values into agent context or terminal logs.

## 1. Decision Table

| Situation | Do | Never Do | Verify |
| :--- | :--- | :--- | :--- |
| Check if secret exists | Check exit code silently (`Select-String -Quiet` / `grep -sq`) | `cat .env`, `Get-Content .env`, `printenv`, `echo $KEY`, `gci Env:` | Command returns exit code `0` with empty stdout |
| Secret is missing | Stop and hand user a hidden-input terminal command | Ask user to paste secret in chat | User confirms key was written locally |
| Inspect template schema | Read `.env.example`, `.env.sample`, or `.env.template` | Read `.env`, `.env.local`, `.env.production` | Only placeholder names appear in output |

## 2. Silent Presence Check (Zero Output)

- **Windows PowerShell:**
  ```powershell
  if (Test-Path .env) { Select-String -Path .env -Pattern "^KEY_NAME=" -Quiet } else { $false }
  ```
- **Bash / POSIX:**
  ```bash
  grep -sq "^KEY_NAME=" ~/.env
  ```

Exit code `0` (`$true`) means configured; non-zero (`$false`) means missing.

## 3. Hidden-Input Provisioning Prompt

When a required key is missing, stop tool execution and ask the user to run one of these locally (typing is masked):

- **Windows PowerShell:**
  ```powershell
  $v = Read-Host "Enter KEY_NAME (hidden)" -AsSecureString; $p = [Net.NetworkCredential]::new('', $v).Password; Add-Content .env "KEY_NAME=$p"; Remove-Variable v,p
  ```
- **Bash / POSIX:**
  ```bash
  printf "Enter KEY_NAME (hidden): " && read -rs v && echo && printf "\nKEY_NAME=%s\n" "$v" >> ~/.env && unset v && echo "Saved."
  ```
