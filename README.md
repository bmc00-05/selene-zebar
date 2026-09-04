# selene-zebar

> A [Zebar](https://github.com/glzr-io/zebar) status bar for Windows, built for [GlazeWM](https://github.com/glzr-io/glazewm).

Minimal and quiet: a night-sky ground, moonlit silver, Inter typography.

> **Status: left and centre are live.** The mark opens a menu, the workspace
> indicators track GlazeWM, and the centre shows the focused window. The right
> region is still empty.

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

## Design

The name is Selene, the moon, and the palette follows from it: a night-sky
ground with moonlit silver on top. Three rules hold it together.

**One hue.** Every colour in the bar sits at hue 278 — a violet leaning blue.
Only lightness and chroma move, from `oklch(15% 0.013 278)` at the darkest to
`oklch(94% 0.016 278)` at the lightest. The accent is not a different colour,
just the highest chroma on the same ramp, which is why it reads as silver
carrying violet rather than as violet.

**Colours are written in `oklch()`.** Its lightness is perceptual, so
`68% → 76% → 84%` are evenly spaced steps to the eye where the same jumps in
hex are not. Retuning a step means editing one number. Hex is noted in a
comment for the colour picker.

**Every colour lives in `tokens.css`**, and nothing below that file writes a
raw colour. Swapping the palette is one file.

Two constraints shape the geometry. Lengths are multiples of 4 because a 1.25×
display only lands those on whole device pixels — 18px and 7px came out at 22.5
and 8.75, which left a dot visibly off-centre inside its ring. And sizes are
animated with `transform: scale()` rather than width and height, because
animating the box re-rounds its edges to the device grid every frame and the
circle wobbles.

The bar's translucency is a floor, not a taste: at 88% the dimmest text still
clears WCAG AA against a white wallpaper, and 85% does not.

## Layout

```
zpack.json                pack manifest — widgets, presets, privileges
bar/
  index.html              the widget Zebar loads
  bar.js                  provider wiring; hands each tick to the components
  components/
    workspaces.js         workspace indicators, reconciled by name
    active-window.js      focused window's icon and title
    menu.js               the popover behind the mark
  scripts/
    window-icon.ps1       extracts a window's icon, run through shellExec
  styles/
    tokens.css            the Selene ramp, typography, metrics, motion
    bar.css               reset and the three-region shell
    brand.css             the mark and its menu
    workspaces.css        workspace indicators
    active-window.css     focused-window readout
scripts/link.ps1          symlink into ~/.glzr/zebar
```

Components share one contract: `mount(root, zebar)` returns an `update(output)`
that takes the whole provider output and picks what it needs, including whether
to show itself. `bar.js` never learns what any of them reads, so adding a widget
is a provider line and a mount line.

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
