/**
 * Who owns the size of the widget window.
 *
 * A Zebar widget only draws inside its own window, and this window is a 40px
 * strip. Anything taller than the bar — the Selene menu, the calendar, the
 * power overlay — has to grow the window while it is open and put it back
 * afterwards. Three panels doing that independently is what this file replaces.
 *
 * Panels do not set a size. They register a claim ("while I am open the window
 * should be this") and the applied geometry is recomputed from every live claim
 * at once. That is the whole point: two popovers handing over used to be an
 * ordering problem, because the browser opens the new one before it closes the
 * old one, and the closing panel would then shrink the window out from under
 * the panel that had just opened. Each component guarded against it by scanning
 * the DOM for other open popovers. With one owner there is nothing to order —
 * the closing panel drops its claim, the recomputed answer still includes the
 * open one, and the window stays where it is.
 */

import { readMs, readPx } from './css.js';

/** Live claims, keyed by the element that made them. */
const claims = new Map();

/** The widget window, planted by the first caller. There is only ever one. */
let win = null;

/**
 * Where the window sits and how wide it is, read once at mount.
 *
 * Never re-read: a close waits for the panel's exit before putting the window
 * back, so a reopen inside that wait would catch the window still grown, record
 * that as the resting geometry, and the widget would stay there for good.
 * Measured exactly that way once: 1920x50 -> 1920x1080 and no way back.
 *
 * The height is deliberately not part of this — see restingHeight().
 */
let resting = null;

let pending = null;

/**
 * The bar strip's height, in physical pixels.
 *
 * Taken from the tokens rather than from a measurement, because height is the
 * one dimension the panels change and so the one a measurement cannot be
 * trusted for. A reload while a panel is open records the grown height as the
 * resting one and the bar never shrinks back — and the menu's own "Reload bar"
 * is exactly that: it calls location.reload() with the menu still open and the
 * window still 220 tall. Position and width are safe to measure; nothing here
 * moves the window except the full-screen claim, which puts it back where the
 * preset already had it.
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
      ([pos, size]) => ({ pos, size }),
    );
  }

  el.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') {
      claims.set(el, spec);
      apply();
      return;
    }

    claims.delete(el);

    // The panel is still on screen for the length of its exit transition.
    // Applying now would shrink the window under a panel that is still painted:
    // an anchored panel loses the room below its anchor and position-try
    // flips it on top of the bar (measured jumping from y=35 to y=6), and the
    // power scrim, being `height: 100%`, simply covers the whole plate. So the
    // recompute waits one frame past the discrete `display` transition.
    //
    // Nothing cancels it. If a claim arrives in the meantime the recompute
    // reads the map as it is by then, and the worst case is writing the same
    // geometry twice.
    clearTimeout(pending);
    pending = setTimeout(apply, readMs('--dur-base') + 20);
  });

  // For the one case that must not wait: power.js runs lock and sleep, and a
  // full-screen widget still covering the desktop would be the first thing seen
  // on waking.
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
