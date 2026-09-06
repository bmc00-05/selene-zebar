/**
 * What GlazeWM is doing with the windows, in one 16px mark.
 *
 * Three things that are otherwise invisible until they bite: which way the next
 * tiling window will go (alt+v), whether a binding mode is on (alt+r), and
 * whether window management is paused altogether (alt+shift+p). The last two
 * are the ones worth having a widget for — left on by accident, they make the
 * window manager look broken.
 *
 * Every part of the mark is in the markup and `data-state` decides which are
 * drawn — the same division the speaker in volume.css uses, and nothing here
 * draws shapes.
 *
 * Clicking flips the tiling direction, which is the one of the three that is
 * both harmless to change and tedious to reach for.
 *
 * Whether the focused window is tiling, floating or fullscreen was meant to be
 * here too, and is not.
 *
 * GlazeWM never says. Its event list is fixed — `glazewm sub --events` prints
 * it — and nothing in it covers a window changing state. Measured over the IPC
 * socket directly, `set-floating` and `set-fullscreen` each emitted zero
 * events while `query focused` and `query windows` both reported the change;
 * only going back to tiling emitted anything, and that carried the state from
 * before the move. So the provider is never told to re-read, and neither
 * `focusedContainer` nor `allWindows` goes stale-free.
 *
 * It could be polled. The page can open its own socket to the IPC server and a
 * `query focused` round trip measures 2.1ms, so a second's polling would cost
 * about 0.2% of a core — cheap. It is left out anyway: a floating window is
 * already obvious on screen, so the readout would buy nothing for a second
 * connection to keep alive and reconnect.
 */

/** The picture for each state, in the order stateOf() decides them. */
const LABELS = {
  paused: 'Window management paused',
  'tiling-h': 'Tiling — next window to the side',
  'tiling-v': 'Tiling — next window below',
};

/**
 * Wires the mark into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .layout button
 * @returns {(output: object) => void}
 */
export function mountLayout(root) {
  const html = document.documentElement;

  /** The last provider output, held for clicks — it carries runCommand. */
  let latest = null;

  let shownState = null;
  let shownLabel = null;

  root.addEventListener('click', () => {
    // Nothing is drawn here. The command goes to GlazeWM and comes back as a
    // TILING_DIRECTION_CHANGED event, so update() below does the drawing —
    // painting first would risk showing a direction that never took.
    latest?.runCommand('toggle-tiling-direction');
  });

  return function update({ glazewm }) {
    latest = glazewm;

    if (!glazewm) {
      root.hidden = true;
      // The provider is down, so whether the WM is paused is not known. Saying
      // nothing is the honest answer; see the note on this attribute below.
      html.removeAttribute('data-wm-paused');
      shownState = null;
      shownLabel = null;
      return;
    }

    root.hidden = false;

    // Published on the root rather than kept to this widget, because the
    // workspace halos answer it too (workspaces.css). It is written whether or
    // not this widget is switched on — that rule is about the workspaces being
    // honest, not about this icon being visible.
    html.toggleAttribute('data-wm-paused', glazewm.isPaused);

    const state = stateOf(glazewm);
    if (state !== shownState) {
      shownState = state;
      // One state at a time, as with the battery and the volume; the
      // stylesheet decides which parts of the mark that draws.
      root.dataset.state = state;
    }

    const label = labelOf(glazewm, state);
    if (label !== shownLabel) {
      shownLabel = label;
      // The mark is abstract on purpose, so it carries a tooltip — the same
      // trade the workspace dots make by having no numbers.
      root.title = label;
      root.setAttribute('aria-label', label);
    }
  };
}

/**
 * Collapses everything the provider says about the layout into the one label
 * the stylesheet switches on.
 *
 * Paused wins outright: with window management off, every keybinding is dead —
 * including the one that enters a binding mode — so nothing below it can be
 * true at the same time. A mode comes next for the same reason in miniature:
 * while one is on, the keys mean something else entirely, and where the next
 * window would go is not the question being asked.
 *
 * The direction is the resting state, and it is true whatever has focus — a
 * workspace with no windows at all included.
 */
function stateOf(glazewm) {
  if (glazewm.isPaused) {
    return 'paused';
  }

  // Only modes that are actually on are in here — verified against
  // `glazewm query binding-modes`, which answers [] with none enabled.
  if (glazewm.bindingModes?.length) {
    return 'mode';
  }

  // `horizontal` means the windows run left to right, which puts the divider
  // upright. The two words are about the row, not about the line.
  return glazewm.tilingDirection === 'vertical' ? 'tiling-v' : 'tiling-h';
}

/**
 * What the tooltip says. A binding mode names itself, since the mark can only
 * say that some mode is on — GlazeWM's own config leaves `displayName` unset,
 * so `name` is the fallback that actually gets used here.
 */
function labelOf(glazewm, state) {
  if (state === 'mode') {
    const mode = glazewm.bindingModes[0];
    return `${mode.displayName ?? mode.name} mode`;
  }

  return LABELS[state];
}
