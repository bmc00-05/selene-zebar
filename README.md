# selene-zebar

> A [Zebar](https://github.com/glzr-io/zebar) status bar for Windows, built for [GlazeWM](https://github.com/glzr-io/glazewm).

Catppuccin Mocha palette, Inter typography, moonlit accents.

> **Status: scaffolding.** Nothing is built yet — this repo was just initialised.

## Why

Zebar renders its widgets in a WebView2 window, so a bar is plain HTML, CSS and
JavaScript. That buys the things a Qt-stylesheet bar cannot have: transitions,
flexbox and grid, container queries, and DevTools for debugging.

## Requirements

| | |
|---|---|
| [Zebar](https://github.com/glzr-io/zebar) | 3.3.1+ — `winget install -e --id glzr-io.zebar` |
| [GlazeWM](https://github.com/glzr-io/glazewm) | 3.10+ — `winget install -e --id glzr-io.glazewm` |
| Node | 20+ |
| [Inter](https://github.com/rsms/inter) | body text |
| JetBrainsMono Nerd Font | icon glyphs — `winget install -e --id DEVCOM.JetBrainsMonoNerdFont` |

## Install

Zebar loads widget packs from `~/.glzr/zebar/`. Rather than developing in that
directory, link this repo into it — the code stays under version control while
Zebar reads it in place.

```powershell
# Administrator PowerShell (symlinks need elevation unless Developer Mode is on)
New-Item -ItemType SymbolicLink `
         -Path   "$env:USERPROFILE\.glzr\zebar\selene-zebar" `
         -Value  "C:\dev\projects\selene-zebar"
```

Then point Zebar at the pack in `~/.glzr/zebar/settings.json`:

```json
{
  "startupConfigs": [
    { "pack": "selene-zebar", "widget": "bar", "preset": "default" }
  ]
}
```

## Development

```powershell
pnpm install
pnpm dev     # not wired up yet
```

## License

MIT
