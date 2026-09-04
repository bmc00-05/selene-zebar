<#
.SYNOPSIS
    Prints a window's icon as a single line of base64-encoded PNG.

.DESCRIPTION
    Run by the bar through Zebar's shellExec, once per application, when a
    window of that application is first focused. The bar caches the result, so
    the ~0.9s this costs is almost entirely PowerShell starting up, paid once
    per app per session.

    The icon is asked of the WINDOW, not the executable. That matters for PWAs:
    YouTube Music and Gemini are both chrome.exe, and only the window carries
    their own icon. WM_GETICON is tried big then small, then the class icon.

    Written for Windows PowerShell 5.1 on purpose, against the repo rule that
    prefers 7. This file is not developer tooling — Zebar runs it on whichever
    machine installs the pack, and powershell.exe is the only interpreter every
    Windows install has. pwsh is a Store app that may not be there. Everything
    used here (Add-Type, System.Drawing, IntPtr) is .NET Framework, so 5.1
    handles it; switching to pwsh is a one-word change in zpack.json.

.PARAMETER Handle
    The window handle (HWND) as an integer, as reported by GlazeWM.

.OUTPUTS
    One line of base64 PNG on stdout. Nothing at all when the window has no
    icon — the bar treats empty output as "use the fallback glyph".
#>
param(
    [Parameter(Mandatory = $true)]
    [int]$Handle
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class SeleneWindowIcon
{
    // SendMessageTimeout rather than SendMessage: a hung window would otherwise
    // block this process, and with it the bar's icon for as long as it hangs.
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(
        IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam,
        uint flags, uint timeoutMs, out IntPtr result);

    // 64-bit entry point. Windows PowerShell 5.1 is 64-bit on x64 Windows.
    [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
    public static extern IntPtr GetClassLongPtr(IntPtr hWnd, int index);
}
"@

$hwnd = [IntPtr]$Handle
$WM_GETICON = 0x7F
$ICON_BIG = 1
$ICON_SMALL = 0
$GCLP_HICON = -14
$SMTO_ABORTIFHUNG = 0x2
$TIMEOUT_MS = 200

function Get-IconHandle {
    param([IntPtr]$Which)
    $result = [IntPtr]::Zero
    $ok = [SeleneWindowIcon]::SendMessageTimeout(
        $hwnd, $WM_GETICON, $Which, [IntPtr]::Zero,
        $SMTO_ABORTIFHUNG, $TIMEOUT_MS, [ref]$result)
    if ($ok -ne [IntPtr]::Zero) { return $result }
    return [IntPtr]::Zero
}

$hIcon = Get-IconHandle ([IntPtr]$ICON_BIG)
if ($hIcon -eq [IntPtr]::Zero) { $hIcon = Get-IconHandle ([IntPtr]$ICON_SMALL) }
if ($hIcon -eq [IntPtr]::Zero) { $hIcon = [SeleneWindowIcon]::GetClassLongPtr($hwnd, $GCLP_HICON) }
if ($hIcon -eq [IntPtr]::Zero) { exit 0 }

$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = New-Object System.IO.MemoryStream
$icon.ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)

# Write, not WriteLine: the bar trims anyway, but a bare line is easier to
# eyeball when running this by hand.
[Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
