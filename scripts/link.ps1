<#
.SYNOPSIS
    Links this repo into the directory Zebar loads widget packs from.

.DESCRIPTION
    Zebar discovers packs under ~\.glzr\zebar\. Developing there would put the
    code outside version control, so the repo is linked in instead.

    Creating a symlink needs elevation unless Developer Mode is on. Mirrors the
    New-Link helper in the dotfiles repo, including the .bak-<stamp> rescue of
    anything real already sitting at the target.
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$Source = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $env:USERPROFILE '.glzr\zebar\selene-zebar'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Write-Host ''
Write-Host '[Zebar pack]' -ForegroundColor Cyan
Write-Host "  $Target"
Write-Host "    -> $Source" -ForegroundColor DarkGray

if ($DryRun) {
    Write-Host '  (dry-run)' -ForegroundColor Yellow
    return
}

$parent = Split-Path -Parent $Target
if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$existing = Get-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.LinkType -eq 'SymbolicLink') {
        Remove-Item -LiteralPath $Target -Force -Recurse
    }
    else {
        $backup = "$Target.bak-$Stamp"
        Write-Host "  기존 항목 백업: $backup" -ForegroundColor Yellow
        Move-Item -LiteralPath $Target -Destination $backup
    }
}

New-Item -ItemType SymbolicLink -Path $Target -Value $Source | Out-Null
Write-Host '  링크 생성 완료' -ForegroundColor Green
Write-Host ''
Write-Host '다음: ~\.glzr\zebar\settings.json 의 startupConfigs 를' -ForegroundColor DarkGray
Write-Host '      { "pack": "selene-zebar", "widget": "bar", "preset": "default" } 로 변경' -ForegroundColor DarkGray
