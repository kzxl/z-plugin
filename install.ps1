# Universal Installer & Linker for z-plugin Monorepo (Antigravity & ZCode)
[CmdletBinding()]
param(
    [string]$Plugin = "all",
    [switch]$Uninstall,
    [switch]$CleanLegacy
)

$repoRoot = $PSScriptRoot
$pluginsDir = Join-Path $repoRoot "plugins"

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

        # Check existing link
        if (Test-Path $targetDir) {
            $item = Get-Item $targetDir -Force
            if ($item.Attributes -match "ReparsePoint") {
                $currentTarget = (Get-Item $targetDir).Target
                if ($currentTarget -eq $src) {
                    Write-Host "[$($ide.Name)] Junction already up-to-date: $targetDir -> $src" -ForegroundColor DarkGray
                    continue
                } else {
                    Write-Host "[$($ide.Name)] Re-pointing junction from $currentTarget to $src..." -ForegroundColor Yellow
                    [System.IO.Directory]::Delete($targetDir)
                }
            } else {
                Write-Host "[$($ide.Name)] Replacing existing folder with junction: $targetDir..." -ForegroundColor Yellow
                Remove-Item -Path $targetDir -Recurse -Force
            }
        }

        try {
            New-Item -ItemType Junction -Path $targetDir -Target $src | Out-Null
            Write-Host "[$($ide.Name)] Linked Junction: $targetDir -> $src" -ForegroundColor Green
        } catch {
            Write-Warning "Could not create junction, falling back to copy: $_"
            Copy-Item -Path $src -Destination $targetDir -Recurse -Force
            Write-Host "[$($ide.Name)] Copied to: $targetDir" -ForegroundColor Green
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
                $serverScript = Join-Path $env:USERPROFILE ".gemini\config\plugins\$p\scripts\mcp-server.mjs"
                if (Test-Path $serverScript) {
                    $serverObj = [PSCustomObject]@{
                        command = "node"
                        args = @($serverScript -replace '\\', '/')
                    }
                    if (-not $mcp.mcpServers.$p) {
                        $mcp.mcpServers | Add-Member -MemberType NoteProperty -Name $p -Value $serverObj -Force
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
    Write-Host "`n[SUCCESS] z-plugin suite is now linked and active across both Antigravity and ZCode!" -ForegroundColor Green
    Write-Host "Active plugins: $($pluginsToProcess -join ', ')" -ForegroundColor Cyan
}
