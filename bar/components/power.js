/**
 * The power button at the right end of the bar, and the overlay it opens.
 *
 * The overlay covers the whole screen, which a Zebar widget can only do by
 * growing its own window — the same trick the mark's menu uses, plus a move to
 * the screen origin. Growing it is safe: the strip GlazeWM keeps clear comes
 * from the preset in zpack.json, not the live window, so nothing on the desktop
 * shifts while this is open.
 *
 * Shutdown and restart cannot be taken back, so they need holding down rather
 * than a click. Lock and sleep go straight through.
 */

import { readMs } from '../lib/css.js';
import { growWindowWhileOpen } from '../lib/window.js';

/**
 * Windows, at the far end of shellExec. Each is registered in zpack.json under
 * `privileges.shellCommands` with an argsRegex that admits these exact strings
 * and nothing else.
 *
 * Note on sleep: SetSuspendState's first argument asks for standby, but Windows
 * hibernates instead when hibernation is enabled — `powercfg /a` reports it as
 * available on this machine, so this button may hibernate rather than sleep.
 * There is no better documented call; the alternative is disabling hibernation
 * system-wide, which is not this widget's business.
 */
const ACTIONS = {
  lock: ['rundll32', ['user32.dll,LockWorkStation']],
  sleep: ['rundll32', ['powrprof.dll,SetSuspendState 0,1,0']],
  restart: ['shutdown', ['/r', '/t', '0']],
  shutdown: ['shutdown', ['/s', '/t', '0']],
};

/**
 * Wires the button and overlay, and returns the update the bar calls each tick.
 *
 * @param {HTMLElement} root   the .power element (button plus overlay)
 * @param {object} zebar       the zebar module (shellExec, currentWidget)
 * @returns {(output: object) => void}
 */
export function mountPower(root, zebar) {
  const overlay = root.querySelector('.power__overlay');
  const widget = zebar.currentWidget();
  const holdMs = readMs('--power-hold');

  let holdTimer = null;

  // Full screen is the only claim that also moves the window.
  //
  // It used to ask for focus as well, because the widget is configured
  // `focused: false` and Escape needs a focused window. That call could never
  // have worked: Zebar's ACL denies `plugin:window|set_focus` to widgets —
  // "Command plugin:window|set_focus not allowed by ACL" — and WidgetPrivileges
  // has only `shellCommands`, so there is nothing to grant in zpack.json.
  //
  // Nothing was broken by removing it. The overlay opens only from a click on
  // the button, and that click focuses the window on its own; the failing call
  // just threw an unhandled rejection on every open.
  const grown = growWindowWhileOpen(overlay, widget, { fullScreen: true });

  overlay.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') {
      cancelHold();
    }
  });

  // The popover fills the screen, so there is no "outside" for light dismiss to
  // catch. A click that lands on the backdrop itself rather than a button is
  // what counts as outside here.
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      overlay.hidePopover();
    }
  });

  for (const button of overlay.querySelectorAll('.power__action')) {
    const action = button.dataset.action;

    if (button.dataset.hold === undefined) {
      button.addEventListener('click', () => run(action));
      continue;
    }

    button.addEventListener('pointerdown', () => {
      button.classList.add('is-holding');
      holdTimer = setTimeout(() => {
        button.classList.remove('is-holding');
        run(action);
      }, holdMs);
    });

    // Releasing, sliding off, or a cancelled gesture all mean "not that".
    for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
      button.addEventListener(event, () => {
        cancelHold();
        button.classList.remove('is-holding');
      });
    }
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  async function run(action) {
    const command = ACTIONS[action];
    if (!command) {
      return;
    }

    // Put the window back first, and unlike an ordinary close, without waiting
    // for the scrim to fade. Lock and sleep return to a desktop that is still
    // there, and a full-screen widget left covering it would be the first thing
    // seen on waking — worth more than the fade, which nobody is watching once
    // the screen is on its way out.
    overlay.hidePopover();
    grown.restoreNow();

    try {
      await zebar.shellExec(command[0], command[1]);
    } catch (error) {
      console.error(`[power] ${action} failed:`, error);
    }
  }

  // Nothing here depends on provider output; the contract is the same shape
  // regardless, as with mountWorkspaces and its unused zebar argument.
  return function update() {};
}
