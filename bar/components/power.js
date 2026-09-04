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

  /**
   * The window's own geometry, read at mount — before this overlay or either of
   * the other panels has grown it.
   *
   * Read once, not on every open. A close now waits for the scrim to fade, so
   * reopening inside that wait cancels the pending restore and leaves the
   * window full screen; re-reading at that moment would record full screen as
   * the geometry to go back to, and the widget would stay there for good.
   * Measured exactly that way: 1920x50 -> 1920x1080 and no way back.
   */
  let restoreTo = null;
  let holdTimer = null;
  let restoreTimer = null;

  captureGeometry();

  overlay.addEventListener('beforetoggle', async event => {
    const isOpening = event.newState === 'open';

    if (isOpening) {
      clearTimeout(restoreTimer);
      // Only if the read at mount has not landed yet; the window is still the
      // bar strip at that point, so this is the same value.
      if (!restoreTo) {
        await captureGeometry();
      }
      await widget.tauriWindow.setPosition({ type: 'Logical', x: 0, y: 0 });
      await widget.tauriWindow.setSize({
        type: 'Logical',
        width: window.screen.width,
        height: window.screen.height,
      });
      // The widget is configured `focused: false`, so without asking the window
      // never takes focus and Escape has nothing to close.
      await widget.tauriWindow.setFocus();
      return;
    }

    cancelHold();

    // The scrim is still on screen for the length of its fade. Putting the
    // window back now shrinks it to the bar strip underneath a scrim that is
    // still at `height: 100%`, so the whole plate is covered by flat scrim until
    // the fade ends — measured at 40px of it for 167ms. So the window waits,
    // one frame past the discrete `display` transition in power.css.
    const gone = readMs('--dur-base') + 20;

    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      if (!overlay.matches(':popover-open')) {
        restoreWindow();
      }
    }, gone);
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

  /**
   * Physical units both ways: what the window reports is what it is given back,
   * with no logical/physical rounding in between.
   */
  async function captureGeometry() {
    restoreTo = {
      pos: await widget.tauriWindow.outerPosition(),
      size: await widget.tauriWindow.innerSize(),
    };
  }

  /** Back to the bar strip, at the geometry read at mount. */
  function restoreWindow() {
    if (!restoreTo) {
      return;
    }

    widget.tauriWindow.setPosition({
      type: 'Physical',
      x: restoreTo.pos.x,
      y: restoreTo.pos.y,
    });
    widget.tauriWindow.setSize({
      type: 'Physical',
      width: restoreTo.size.width,
      height: restoreTo.size.height,
    });
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
    clearTimeout(restoreTimer);
    restoreWindow();

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
