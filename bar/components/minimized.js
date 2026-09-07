/**
 * The windows that are minimised in the focused workspace.
 *
 * With the taskbar on auto-hide, minimising a window leaves no trace anywhere:
 * the workspace dots only say a workspace holds windows, and the centre readout
 * only says which one has focus. Minimised is the one window state this bar did
 * not show.
 *
 * The focused workspace only, and that is the whole scope. GlazeWM tiles, so
 * every window in the focused workspace that is not minimised is already on
 * screen — which makes "minimised" exactly "hidden" here, with nothing to
 * qualify. Windows in other workspaces are not hidden but elsewhere, and the
 * dots already say so.
 *
 * The count goes stale in one case, and it cannot be helped from here. GlazeWM
 * publishes no window-state event — `glazewm sub --help` lists none, and
 * minimising a window that does not hold focus was measured at zero events on
 * the IPC socket, in the focused workspace as much as anywhere else. What the
 * provider does see is `focus_changed`, which covers the ordinary path: you
 * minimise the window you are looking at, focus has to leave it, and the count
 * rises in the same tick. An application that minimises itself in the
 * background goes unnoticed until focus next moves, which is the next time you
 * switch windows. Polling for the rest is not worth a query every second.
 */

import { readPx } from '../lib/css.js';
import { growWindowWhileOpen } from '../lib/window.js';
import { cachedIcon, windowIcon } from '../lib/window-icon.js';

/**
 * Wires the badge and its panel, and returns the function that updates them.
 *
 * @param {HTMLElement} root  the .minimized button
 * @param {object} zebar      the zebar module (for shellExec and currentWidget)
 * @returns {(output: object) => void}
 */
export function mountMinimized(root, zebar) {
  // popovertarget already ties the two together in the markup, so the panel is
  // found from here rather than passed in — as in menu.js and calendar.js.
  const panel = document.getElementById(root.getAttribute('popovertarget'));
  const count = root.querySelector('.minimized__count');
  const list = panel.querySelector('.minimized-panel__list');
  const template = document.getElementById('minimized-row');

  const widget = zebar.currentWidget();

  /** The minimised windows of the focused workspace, as of the last tick. */
  let hidden = [];

  /** The last glazewm output, which is what carries runCommand. */
  let latest = null;

  /** What the list was built from, so an unchanged set is not redrawn. */
  let builtFrom = null;

  growWindowWhileOpen(panel, widget, { height: readPx('--min-window-h') });

  panel.addEventListener('beforetoggle', event => {
    const opening = event.newState === 'open';
    root.setAttribute('aria-expanded', String(opening));

    // beforetoggle rather than toggle: the rows have to be there before the
    // panel is painted, or the first frame is an empty box that then fills.
    if (opening) {
      build();
    }
  });

  // After the panel is actually on screen. At `beforetoggle` it is still
  // display:none, where the list has no height to measure its content against
  // and every end looks like the only end.
  panel.addEventListener('toggle', event => {
    if (event.newState === 'open') {
      markEnds();
    }
  });

  // There is no scrollbar (minimized.css says why), so the fade at either end
  // is the only thing that says the list carries on past what is shown.
  list.addEventListener('scroll', markEnds, { passive: true });

  return function update({ glazewm }) {
    latest = glazewm ?? null;
    hidden = glazewm ? minimizedIn(glazewm.focusedWorkspace) : [];

    root.hidden = hidden.length === 0;
    count.textContent = label(hidden.length);
    root.title = describe(hidden.length);
    root.setAttribute('aria-label', describe(hidden.length));

    if (!panel.matches(':popover-open')) {
      return;
    }

    // Open, and the world moved. An empty list means the badge is about to be
    // taken away, and a popover anchored to a hidden element has nothing left
    // to sit under.
    if (hidden.length) {
      build();
    } else {
      panel.hidePopover();
    }
  };

  /**
   * Draws the list, if it is not already what it should be.
   *
   * Keyed on the windows and their titles rather than redrawn every tick: the
   * provider emits on every focus change, and rebuilding would restart each
   * icon's fade under a pointer that is on its way to a row.
   */
  function build() {
    const key = hidden.map(one => `${one.id}:${one.title}`).join('\n');
    if (key === builtFrom) {
      return;
    }
    builtFrom = key;
    list.replaceChildren(...hidden.map(row));
    markEnds();
  }

  /**
   * Fades whichever end the list runs past, and neither when it all fits.
   *
   * The pixel of slack is not decoration: a trackpad leaves fractional scroll
   * positions, and without it the bottom fade stays on while the list is
   * already at its end.
   */
  function markEnds() {
    const overflows = list.scrollHeight - list.clientHeight > 1;
    const bottom = list.scrollTop + list.clientHeight;

    list.classList.toggle('has-more-above', overflows && list.scrollTop > 1);
    list.classList.toggle(
      'has-more-below',
      overflows && bottom < list.scrollHeight - 1,
    );
  }

  /** One window, as a row that restores it. */
  function row(container) {
    const item = template.content.firstElementChild.cloneNode(true);

    item.querySelector('.minimized-panel__title').textContent = container.title;
    item.title = container.title;

    item.addEventListener('click', () => {
      // The panel goes first. Restoring changes the count, which may take the
      // badge away entirely, and a popover outliving its anchor is the one
      // ordering this component can get wrong.
      panel.hidePopover();

      // `toggle-minimized` is the only way back: `set-minimized` takes no
      // argument, so there is no "restore" to ask for. It brings focus with it
      // — GlazeWM gives the restored window focus and offers no way not to,
      // measured on the IPC socket. That is the taskbar's behaviour anyway, and
      // the focus_changed it emits is what refreshes the count.
      latest?.runCommand('toggle-minimized', container.id);
    });

    paintIcon(item, container);
    return item;
  }

  /**
   * Puts the application's icon on a row, once it is known.
   *
   * Cached icons are already there by the time the panel is painted, which is
   * the common case — the panel lists applications the centre readout has
   * usually shown before. The rest arrive about half a second later and fade
   * in over the glyph, exactly as they do in the centre.
   */
  async function paintIcon(item, container) {
    let icon = cachedIcon(container);

    if (icon === undefined) {
      icon = await windowIcon(zebar, container);

      // The list may have been rebuilt, or the panel closed, while PowerShell
      // was starting. A row that is no longer in the document is not painted.
      if (!item.isConnected) {
        return;
      }
    }

    if (!icon) {
      // No icon at all: the glyph is the answer rather than a placeholder.
      return;
    }

    item.querySelector('.minimized-panel__icon').style.backgroundImage =
      `url(${icon})`;
    item.classList.add('has-icon');
  }
}

/**
 * Every minimised window under `container`, however deeply it is nested.
 *
 * Recursive because a workspace's `children` are not all windows: GlazeWM nests
 * split containers, so a flat filter misses anything one level down. It only
 * looks flat until the first window is split.
 *
 * @param {object} [container]  a workspace, or undefined when nothing has focus
 * @returns {object[]}
 */
function minimizedIn(container, found = []) {
  for (const child of container?.children ?? []) {
    if (child.type !== 'window') {
      minimizedIn(child, found);
    } else if (child.state?.type === 'minimized') {
      found.push(child);
    }
  }

  return found;
}

/**
 * What goes inside the square.
 *
 * A plus, because this is what the workspace holds *besides* what is on screen.
 * Two characters at most, and that is a measurement rather than a preference:
 * the square has 16.6px of clear space inside it, and `+12` needs 19.6 at the
 * size the figures are legible at. Shrinking type until it fits leaves 0.4px
 * of air on each side — touching, to the eye. So ten and above become `9+`,
 * which is two characters like every other reading and the ordinary way to
 * write "more than this". The exact number is in the tooltip below.
 */
function label(total) {
  return total > 9 ? '9+' : `+${total}`;
}

/** What the badge says to a pointer resting on it, and to a screen reader. */
function describe(total) {
  return total === 1 ? '1 minimised window' : `${total} minimised windows`;
}
