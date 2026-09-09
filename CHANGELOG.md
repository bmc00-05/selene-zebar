# Changelog

Notable changes to selene-zebar, newest first.

This file records what changed for someone using the bar, which is not the same
as what changed in the code — the commit history has that. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the major
version is 0, a minor bump may change how things look or behave.

## [0.2.0] — 2026-09-07

### Added

- **Hidden windows.** A count of the windows minimised in the focused
  workspace, in a square beside the focused-window title. Click it for the list
  — each window with its own icon and title — and click a window to bring it
  back. With the taskbar on auto-hide a minimised window left no trace anywhere
  in the bar; it was the one window state nothing here showed.

  Only the focused workspace is counted. GlazeWM tiles, so every window there
  that is not minimised is already on screen, which makes "minimised" exactly
  "hidden". Windows in other workspaces are not hidden but elsewhere, and the
  workspace dots already say so.

  The widget has its own chip in the settings panel, listed as **Hidden**.

### Changed

- **Empty workspace dots are now the same diameter as full ones**, and are told
  apart by being an outline rather than a disc. They used to be a pixel
  smaller, which is a weak thing to say next to outline-against-fill, and it
  cost the size ramp a step that the displayed and focused states could use.
- **The README is rewritten as user documentation** rather than a development
  log, with a centred header, version and licence badges, and a Limitations
  section. The state screenshots used to be drawn at three different scales
  because each was pasted at its own pixel width; they now share one.

### Known limitations

- The hidden-window count can lag. GlazeWM publishes no event when a window
  changes state, so the count is refreshed by the focus change that minimising
  normally causes. Minimise the window you are looking at and the count is
  right immediately; an application that minimises itself in the background is
  not counted until focus next moves.
- Restoring a window from the list gives it focus. GlazeWM offers no way to
  restore a window without focusing it.

## [0.1.0] — 2026-09-07

First release that someone else can install and use: follow the README and the
bar comes up.

### Added

- Nine widgets — workspaces, media, focused window, volume, RAM, clock with a
  month calendar, battery, layout, and power.
- A settings panel behind the crescent at the left end: a chip per widget,
  a live-spectrum switch, saver mode, and the two ways back to a working bar.
- Optional [cava](https://github.com/karlstav/cava) integration, which drives
  the media equaliser from what is actually coming out of the speakers. Without
  it the bars fall back to an animation, which is the default.
- Saver mode, which stops the animations that never end — the breathing halos,
  the equaliser, the marquee — while leaving the battery's critical pulse and
  the equaliser's held peaks alone, because those are readings rather than
  impressions.
- The typeface ships inside the pack, so there is nothing to install for the
  bar to look the way it does in the screenshots.

[0.2.0]: https://github.com/bo-mun/selene-zebar/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bo-mun/selene-zebar/releases/tag/v0.1.0
