# selene-zebar

> A [Zebar](https://github.com/glzr-io/zebar) status bar for Windows, built for [GlazeWM](https://github.com/glzr-io/glazewm).

Minimal and quiet: a night-sky ground, moonlit silver, Inter typography.

> **Status: bar shell + workspaces.** The left region is live; centre and right
> are still empty.

## Why

Zebar renders its widgets in a WebView2 window, so a bar is plain HTML, CSS and
JavaScript. That buys the things a Qt-stylesheet bar cannot have: transitions,
flexbox and grid, container queries, and DevTools for debugging.

## Requirements

|                                               |                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------- |
| [Zebar](https://github.com/glzr-io/zebar)     | 3.3.1+ — `winget install -e --id glzr-io.zebar`                     |
| [GlazeWM](https://github.com/glzr-io/glazewm) | 3.10+ — `winget install -e --id glzr-io.glazewm`                    |
| Node                                          | 20+ (tooling only — the widget itself has no build step)            |
| [Inter](https://github.com/rsms/inter)        | body text                                                           |
| JetBrainsMono Nerd Font                       | icon glyphs — `winget install -e --id DEVCOM.JetBrainsMonoNerdFont` |

## Install

Zebar discovers packs one level deep under `~/.glzr/zebar/`, taking the pack ID
from the folder name. Rather than developing in that directory, link this repo
into it — the code stays under version control while Zebar reads it in place.

```powershell
# Administrator PowerShell (symlinks need elevation unless Developer Mode is on)
pnpm run link      # or: scripts/link.ps1 -DryRun to preview
```

Then point Zebar at the pack in `~/.glzr/zebar/settings.json`:

```json
{
  "startupConfigs": [
    { "pack": "selene-zebar", "widget": "bar", "preset": "default" }
  ]
}
```

## Layout

```
zpack.json              pack manifest — widgets, presets, privileges
bar/
  index.html            the widget Zebar loads
  bar.js                provider wiring and DOM reconciliation
  styles/
    tokens.css          the Selene colour ramp, typography, metrics, motion
    bar.css             reset and the three-region shell
    workspaces.css      workspace indicators
scripts/link.ps1        symlink into ~/.glzr/zebar
```

There is no bundler. Zebar serves the directory to WebView2 as-is, so saving a
file and refreshing the widget is the whole edit loop. `zebar` is imported from
esm.sh and held by the cache rule in `zpack.json`.

## Development

```powershell
pnpm install       # prettier only
pnpm format
```

Zebar widgets have no context menu, so DevTools is reached over WebView2's
remote debugging port. Launch Zebar with the port open:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process "C:\Program Files\glzr.io\Zebar\zebar.exe" `
  -ArgumentList 'start-widget-preset','--pack','selene-zebar','--widget-name','bar','--preset','default'
```

Then in Edge open `edge://inspect/#devices`, add `127.0.0.1:9222` under
**Configure**, and inspect the `selene-zebar` target. Editing a custom property
on `:root` in the Styles pane relays the whole bar instantly, which is the
fastest way to settle on spacing and colour values before writing them into
`tokens.css`.

## License

MIT
