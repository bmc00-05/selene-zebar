/**
 * Who owns the size of the widget window.
 *
 * A Zebar widget only draws inside its own window, and this window is a 40px
 * strip. Anything taller than the bar — the menu, the calendar, the media
 * panel, the power overlay — has to grow the window while it is open and put
 * it back afterwards. Growing it is safe: the strip GlazeWM keeps clear comes
 * from the preset in zpack.json, not from the live window, so nothing on the
 * desktop shifts.
 *
 * Panels do not set a size. They register a claim ("while I am open the window
 * should be this") and the geometry is recomputed from every live claim at
 * once. Two popovers handing over is otherwise an ordering problem: the
 * browser opens the new one before it closes the old one, and the closing
 * panel would shrink the window out from under the one that had just opened.
 * With one owner there is nothing to order — the closing panel drops its
 * claim, the recomputed answer still includes the open one, and the window
 * stays where it is.
 *
 * The same registry closes every open panel when the window loses focus.
 * Light dismiss only covers clicks this window receives; a click on another
 * application never reaches the page, and the panel would sit there open.
 */

import { readMs, readPx } from './css.js';

/** Live claims, keyed by the popover that made them. Present while open. */
const claims = new Map();

/** The widget window, planted by the first caller. There is only ever one. */
let win = null;

/**
 * Where the window sits and how wide it is, read once at mount and never
 * re-read: a close waits for the panel's exit before putting the window back,
 * so a reopen inside that wait would catch the window still grown and record
 * that as the resting geometry for good.
 *
 * The height is deliberately not part of this — see restingHeight().
 */
let resting = null;

/**
 * The same values, once they have arrived, reachable without awaiting.
 *
 * `pagehide` cannot await: a promise continuation is not guaranteed to run
 * before the page is gone, so the restore below reads this instead.
 */
let restingNow = null;

let pending = null;

/**
 * The bar strip's height, in physical pixels.
 *
 * Taken from the tokens rather than measured, because height is the one
 * dimension the panels change and so the one a measurement cannot be trusted
 * for: a reload while a panel is open — the menu's own "Reload bar" is exactly
 * that — would record the grown height as the resting one. Position and width
 * are safe to measure; nothing here moves the window except the full-screen
 * claim, which puts it back where the preset had it.
 *
 * tokens.css states the other half of this: --bar-inset-y plus --bar-height
 * must equal the preset height in zpack.json.
 */
function restingHeight() {
  const logical = readPx('--bar-inset-y') + readPx('--bar-height');
  return Math.round(logical * window.devicePixelRatio);
}

/**
 * Grows the window while `el` is open, and puts it back when it closes.
 *
 * @param {HTMLElement} el      the popover
 * @param {object} widget       from zebar.currentWidget()
 * @param {object} spec         what the window should be while open
 * @param {number} [spec.height]      logical height, for a panel that hangs
 *                                    off the bar
 * @param {boolean} [spec.fullScreen] cover the screen, moving the window too
 * @returns {{ restoreNow: () => void }}
 */
export function growWindowWhileOpen(el, widget, spec) {
  if (!win) {
    win = widget.tauriWindow;
    // Physical both ways: what the window reports is what it is given back,
    // with no logical/physical rounding in between.
    resting = Promise.all([win.outerPosition(), win.innerSize()]).then(
      ([pos, size]) => {
        restingNow = { pos, size };
        return restingNow;
      },
    );

    // Copied first: hiding a popover drops its claim from the map mid-loop.
    win.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        for (const open of [...claims.keys()]) {
          open.hidePopover();
        }
      }
    });

    /*
     * The window outlives the page, and the claims do not.
     *
     * The menu's own "Reload bar" can only be pressed while the menu is open,
     * and `location.reload()` destroys the page before the popover's close
     * event can fire — so the claim is never dropped, and the window stays at
     * --menu-window-h. Measured: 40 logical before, 360 with the menu up, and
     * still 360 after the reload with the panel closed. The bar draws 40 of
     * that and the invisible 320 keeps taking every click, which over a
     * top-docked window means the title bars and close buttons underneath it
     * stop responding.
     *
     * Two halves, because neither is enough alone. This one stops the state
     * from arising at all, and it is the only one that can — the reload path
     * still knows where the window belongs. It is best effort: the page may go
     * before the calls land.
     *
     * Nothing here is awaited. Both are bare IPC messages, which is what gives
     * them their chance of getting out; the answers are of no use to a page
     * that is about to stop existing.
     */
    window.addEventListener('pagehide', () => {
      if (!restingNow) {
        return;
      }

      claims.clear();
      win.setPosition({
        type: 'Physical',
        x: restingNow.pos.x,
        y: restingNow.pos.y,
      });
      win.setSize({
        type: 'Physical',
        width: restingNow.size.width,
        height: restingHeight(),
      });
    });

    /*
     * And the other half: a page that has come up while the window is still
     * grown, because the restore above did not get out in time — or because
     * the reload came from outside the page entirely (the tray's "Empty cache
     * && reload configs", a devtools reload) with a panel open.
     *
     * There are no claims yet, so this takes the resting branch and puts the
     * strip back. In the ordinary case it writes the geometry the window
     * already has, which costs one no-op pair of IPC calls at startup.
     *
     * What this cannot repair is where the window was: `resting` has just been
     * measured from a window that was left in the wrong place, and only the
     * height is recoverable from the tokens. That is harmless for the panels,
     * which never move the window — the power overlay is the one exception,
     * and on a single monitor with a full-width top-docked bar its position is
     * the resting one anyway. Closing that last gap needs the preset's own
     * geometry, which the page cannot read: currentWidget() does not carry it
     * and zpack.json is not served (includeFiles has no *.json).
     */
    apply();
  }

  el.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') {
      claims.set(el, spec);
      apply();
      return;
    }

    claims.delete(el);

    // The panel is still on screen for the length of its exit transition.
    // Applying now would shrink the window under a panel that is still
    // painted: an anchored panel loses the room below its anchor and
    // position-try flips it on top of the bar, and the power scrim, being
    // `height: 100%`, covers the whole plate. So the recompute waits one frame
    // past the discrete `display` transition.
    //
    // Nothing cancels it. If a claim arrives in the meantime the recompute
    // reads the map as it is by then, and the worst case is writing the same
    // geometry twice.
    clearTimeout(pending);
    pending = setTimeout(apply, readMs('--dur-base') + 20);
  });

  // For the one case that must not wait: power.js runs lock and sleep, and a
  // full-screen widget still covering the desktop would be the first thing
  // seen on waking.
  return {
    restoreNow() {
      claims.delete(el);
      clearTimeout(pending);
      apply();
    },
  };
}

/** Recomputes the window from every live claim and writes it. */
async function apply() {
  const { pos, size } = await resting;

  if (!claims.size) {
    await win.setPosition({ type: 'Physical', x: pos.x, y: pos.y });
    await win.setSize({
      type: 'Physical',
      width: size.width,
      height: restingHeight(),
    });
    return;
  }

  const specs = [...claims.values()];

  if (specs.some(spec => spec.fullScreen)) {
    await win.setPosition({ type: 'Logical', x: 0, y: 0 });
    await win.setSize({
      type: 'Logical',
      width: window.screen.width,
      height: window.screen.height,
    });
  } else {
    // The tallest claim wins, so a shorter panel closing under a taller one
    // cannot shrink the window.
    await win.setPosition({ type: 'Physical', x: pos.x, y: pos.y });
    await win.setSize({
      type: 'Logical',
      width: window.innerWidth,
      height: Math.max(...specs.map(spec => spec.height ?? 0)),
    });
  }
}
