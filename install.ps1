# Universal Installer & Linker for z-plugin Monorepo (Antigravity & ZCode)
[CmdletBinding()]
param(
    [string]$Plugin = "all",
    [switch]$Uninstall,
    [switch]$CleanLegacy,
    [switch]$Development
)

$repoRoot = $PSScriptRoot
$pluginsDir = Join-Path $repoRoot "plugins"

function Convert-ZCodeSubagents([string]$TargetPluginDir) {
    if (-not (Test-Path $TargetPluginDir)) { return }
    $dirItem = Get-Item $TargetPluginDir -Force
    if ($dirItem.Attributes -match "ReparsePoint") { return }
    $agentsDir = Join-Path $TargetPluginDir "agents"
    if (-not (Test-Path $agentsDir)) { return }
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    foreach ($agentFile in (Get-ChildItem -Path $agentsDir -Filter "*.md")) {
        $rawAgent = Get-Content $agentFile.FullName -Raw
        $zcodeAgent = $rawAgent -replace "(?m)^subagent:\s*\S+\r?\n", "" -replace "(?m)^mainAgent:\s*\S+\r?\n", "" -replace "(?m)^tools:\s*\[read_file,\s*run_command,\s*manage_task\]", "tools: [Read, Bash]"
        if ($zcodeAgent -ne $rawAgent) {
            [System.IO.File]::WriteAllText($agentFile.FullName, $zcodeAgent, $utf8NoBom)
        }
    }
}

$availablePlugins = Get-ChildItem -Path $pluginsDir -Directory | Select-Object -ExpandProperty Name

if ($Plugin -ne "all" -and $availablePlugins -notcontains $Plugin) {
    Write-Error "Plugin '$Plugin' not found. Available plugins: $($availablePlugins -join ', ')"
    exit 1
}

$pluginsToProcess = if ($Plugin -eq "all") { $availablePlugins } else { @($Plugin) }

$ideRoots = @(
    @{ Name = "Antigravity"; Path = (Join-Path $env:USERPROFILE ".gemini\config\plugins") },
    @{ Name = "ZCode";       Path = (Join-Path $env:USERPROFILE ".zcode\plugins") }
)

# 1. Clean legacy junctions if requested or during install
$legacyNames = @("zero-token", "token-diet")
foreach ($ide in $ideRoots) {
    foreach ($leg in $legacyNames) {
        $legPath = Join-Path $ide.Path $leg
        if (Test-Path $legPath) {
            Write-Host "Cleaning legacy plugin link at $($ide.Name): $legPath" -ForegroundColor DarkGray
            try {
                $item = Get-Item $legPath -Force
                if ($item.Attributes -match "ReparsePoint") {
                    [System.IO.Directory]::Delete($legPath)
                } else {
                    Remove-Item -Path $legPath -Recurse -Force
                }
            } catch {}
        }
    }
}

# 2. Process plugins
foreach ($pName in $pluginsToProcess) {
    $src = Join-Path $pluginsDir $pName

    Write-Host "`n=== Processing plugin: $pName ===" -ForegroundColor Cyan

    foreach ($ide in $ideRoots) {
        $targetDir = Join-Path $ide.Path $pName

        if ($Uninstall) {
            if (Test-Path $targetDir) {
                Write-Host "[$($ide.Name)] Removing link: $targetDir" -ForegroundColor Yellow
                $item = Get-Item $targetDir -Force
                if ($item.Attributes -match "ReparsePoint") {
                    [System.IO.Directory]::Delete($targetDir)
                } else {
                    Remove-Item -Path $targetDir -Recurse -Force
                }
            }
            continue
        }

        # Ensure parent exists
        if (!(Test-Path $ide.Path)) {
            New-Item -Path $ide.Path -ItemType Directory -Force | Out-Null
        }

        # Check existing link/folder
        if (Test-Path $targetDir) {
            $item = Get-Item $targetDir -Force
            if ($item.Attributes -match "ReparsePoint") {
                Write-Host "[$($ide.Name)] Removing legacy junction for $targetDir..." -ForegroundColor Yellow
                [System.IO.Directory]::Delete($targetDir)
            }
        }

        # Development mode: link directly to repo source via symlink or junction
        if ($Development) {
            try {
                if (Test-Path $targetDir) {
                    $item = Get-Item $targetDir -Force
                    if ($item.Attributes -match "ReparsePoint") {
                        [System.IO.Directory]::Delete($targetDir)
                    } else {
                        $localData = Join-Path $targetDir "data"
                        $hasData = (Test-Path $localData) -and (Get-ChildItem -Path $localData -Filter "*.sqlite*" -ErrorAction SilentlyContinue)
                        if (!$hasData) {
                            Remove-Item -Path $targetDir -Recurse -Force -ErrorAction Stop
                        }
                    }
                }
                New-Item -ItemType SymbolicLink -Path $targetDir -Target $src -Force -ErrorAction Stop | Out-Null
                Write-Host "[$($ide.Name)] Linked development symlink: $targetDir -> $src" -ForegroundColor Green
                continue
            } catch {
                try {
                    New-Item -ItemType Junction -Path $targetDir -Target $src -Force -ErrorAction Stop | Out-Null
                    Write-Host "[$($ide.Name)] Linked development junction: $targetDir -> $src" -ForegroundColor Green
                    continue
                } catch {
                    Write-Warning "Could not link development symlink/junction: $_. Falling back to copy sync."
                }
            }
        }

        try {
            if (!(Test-Path $targetDir)) {
                New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
            }
            # Mirror files into target directory while preserving local SQLite databases and checkpoints
            robocopy $src $targetDir /MIR /XF *.sqlite* /XD .git node_modules data /NP /NFL /NDL /NJH /NJS | Out-Null
            Write-Host "[$($ide.Name)] Synchronized directory: $targetDir" -ForegroundColor Green
        } catch {
            Write-Warning "Could not copy: $_"
            Copy-Item -Path $src -Destination $targetDir -Recurse -Force
            Write-Host "[$($ide.Name)] Copied to: $targetDir" -ForegroundColor Green
        }

        if ($ide.Name -eq "ZCode") { Convert-ZCodeSubagents -TargetPluginDir $targetDir }
    }
}

# 2.5 Process extension DLCs
$extensionsDir = Join-Path $repoRoot "extensions"
if (Test-Path $extensionsDir) {
    $availableExtensions = Get-ChildItem -Path $extensionsDir -Directory | Select-Object -ExpandProperty Name
    $extensionRoots = @(
        @{ Name = "Antigravity"; Path = (Join-Path $env:USERPROFILE ".gemini\config\extensions") },
        @{ Name = "ZCode";       Path = (Join-Path $env:USERPROFILE ".zcode\extensions") }
    )

    foreach ($extName in $availableExtensions) {
        $extSrc = Join-Path $extensionsDir $extName
        Write-Host "`n=== Processing Extension DLC: $extName ===" -ForegroundColor Magenta

        foreach ($ide in $extensionRoots) {
            $extTarget = Join-Path $ide.Path $extName

            if ($Uninstall) {
                if (Test-Path $extTarget) {
                    Write-Host "[$($ide.Name)] Removing extension link: $extTarget" -ForegroundColor Yellow
                    $item = Get-Item $extTarget -Force
                    if ($item.Attributes -match "ReparsePoint") {
                        [System.IO.Directory]::Delete($extTarget)
                    } else {
                        Remove-Item -Path $extTarget -Recurse -Force
                    }
                }
                continue
            }

            if (!(Test-Path $ide.Path)) {
                New-Item -Path $ide.Path -ItemType Directory -Force | Out-Null
            }

            if ($Development) {
                try {
                    if (Test-Path $extTarget) {
                        $item = Get-Item $extTarget -Force
                        if ($item.Attributes -match "ReparsePoint") {
                            [System.IO.Directory]::Delete($extTarget)
                        } else {
                            Remove-Item -Path $extTarget -Recurse -Force
                        }
                    }
                    New-Item -ItemType Junction -Path $extTarget -Target $extSrc -Force -ErrorAction Stop | Out-Null
                    Write-Host "[$($ide.Name)] Linked development extension junction: $extTarget -> $extSrc" -ForegroundColor Green
                    continue
                } catch {
                    Write-Warning "Could not link extension junction: $_. Falling back to copy sync."
                }
            }

            try {
                if (!(Test-Path $extTarget)) {
                    New-Item -Path $extTarget -ItemType Directory -Force | Out-Null
                }
                robocopy $extSrc $extTarget /MIR /XD .git node_modules /NP /NFL /NDL /NJH /NJS | Out-Null
                Write-Host "[$($ide.Name)] Synchronized extension: $extTarget" -ForegroundColor Green
            } catch {
                Copy-Item -Path $extSrc -Destination $extTarget -Recurse -Force
                Write-Host "[$($ide.Name)] Copied extension: $extTarget" -ForegroundColor Green
            }
        }
    }
}

# 3. Synchronize MCP configs and enabled plugins state for Antigravity & ZCode
$antigravityConfigPath = Join-Path $env:USERPROFILE ".gemini\config\config.json"
if (Test-Path $antigravityConfigPath) {
    try {
        $cfg = Get-Content $antigravityConfigPath -Raw | ConvertFrom-Json
        if (-not $cfg.plugins) { $cfg | Add-Member -MemberType NoteProperty -Name "plugins" -Value ([PSCustomObject]@{}) }
        foreach ($p in $pluginsToProcess) {
            if (-not $cfg.plugins.$p) {
                $cfg.plugins | Add-Member -MemberType NoteProperty -Name $p -Value ([PSCustomObject]@{ enabled = (-not $Uninstall) }) -Force
            } else {
                $cfg.plugins.$p.enabled = (-not $Uninstall)
            }
        }
        $cfg | ConvertTo-Json -Depth 10 | Set-Content $antigravityConfigPath -Encoding utf8
        Write-Host "[Antigravity] Synchronized enabled plugins in config.json" -ForegroundColor Green
    } catch {
        Write-Warning "Could not update config.json: $_"
    }
}

$mcpConfigPaths = @(
    (Join-Path $env:USERPROFILE ".gemini\config\mcp_config.json"),
    (Join-Path $env:USERPROFILE ".gemini\antigravity\mcp_config.json")
)
foreach ($mcpPath in $mcpConfigPaths) {
    if (Test-Path $mcpPath) {
        try {
            $mcp = Get-Content $mcpPath -Raw | ConvertFrom-Json
            if (-not $mcp.mcpServers) { $mcp | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{}) }
            foreach ($p in $pluginsToProcess) {
                if ($Uninstall) {
                    if ($mcp.mcpServers.$p) {
                        $mcp.mcpServers.PSObject.Properties.Remove($p)
                    }
                    continue
                }
                $serverScript = Join-Path $env:USERPROFILE ".gemini\config\plugins\$p\scripts\mcp-server.mjs"
                if (Test-Path $serverScript) {
                    $serverObj = [PSCustomObject]@{
                        command = "node"
                        args = @($serverScript -replace '\\', '/')
                    }
                    if (-not $mcp.mcpServers.$p) {
                        $mcp.mcpServers | Add-Member -MemberType NoteProperty -Name $p -Value $serverObj -Force
                    } else {
                        $mcp.mcpServers.$p = $serverObj
                    }
                }
            }
            $mcp | ConvertTo-Json -Depth 10 | Set-Content $mcpPath -Encoding utf8
            Write-Host "[Antigravity] Synchronized MCP config: $mcpPath" -ForegroundColor Green
        } catch {
            Write-Warning "Could not update ${mcpPath}: $_"
        }
    }
}

# 4. Synchronize ZCode CLI config
$zcodeConfigPath = Join-Path $env:USERPROFILE ".zcode\cli\config.json"
if (Test-Path $zcodeConfigPath) {
    try {
        $zcfg = Get-Content $zcodeConfigPath -Raw | ConvertFrom-Json
        if (-not $zcfg.plugins) { $zcfg | Add-Member -MemberType NoteProperty -Name "plugins" -Value ([PSCustomObject]@{}) }
        if (-not $zcfg.plugins.enabledPlugins) { $zcfg.plugins | Add-Member -MemberType NoteProperty -Name "enabledPlugins" -Value ([PSCustomObject]@{}) }
        foreach ($p in $pluginsToProcess) {
            $zcfg.plugins.enabledPlugins | Add-Member -MemberType NoteProperty -Name $p -Value (-not $Uninstall) -Force
            $zcfg.plugins.enabledPlugins | Add-Member -MemberType NoteProperty -Name "$p@z-plugin" -Value (-not $Uninstall) -Force
        }
        $zcfg | ConvertTo-Json -Depth 10 | Set-Content $zcodeConfigPath -Encoding utf8
        Write-Host "[ZCode] Synchronized enabled plugins in cli/config.json" -ForegroundColor Green
    } catch {
        Write-Warning "Could not update ZCode config.json: $_"
    }
}

if ($Uninstall) {
    Write-Host "`nUnlink completed successfully." -ForegroundColor Green
} else {
    try {
        Push-Location $repoRoot
        npm link --silent 2>$null | Out-Null
        Pop-Location
        Write-Host "[CLI] Linked global 'z-plugin' command on PATH" -ForegroundColor Green
    } catch {
        if ((Get-Location).Path -eq $repoRoot) { Pop-Location }
    }
    Write-Host "`n[SUCCESS] z-plugin suite is now linked and active across both Antigravity and ZCode!" -ForegroundColor Green
    Write-Host "Active plugins: $($pluginsToProcess -join ', ')" -ForegroundColor Cyan
}
