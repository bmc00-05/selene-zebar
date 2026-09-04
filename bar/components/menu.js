/**
 * The menu behind the Selene mark.
 *
 * Opening and closing is the browser's job — the popover attributes in
 * index.html handle the top layer, outside clicks and Escape, and CSS anchor
 * positioning places the panel. What is left here is the part only Zebar can
 * do: the panel would be clipped at the edge of a 40px-tall window, so the
 * window grows while the menu is open.
 *
 * Growing it is safe. The strip GlazeWM keeps clear comes from the preset in
 * zpack.json, not from the live window, so nothing on the desktop shifts —
 * measured before and after: workspace y=55 h=1020 either way.
 */

import { readMs, readPx } from '../lib/css.js';

/**
 * Wires the menu behind `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the popover panel
 * @param {object} zebar      the zebar module (for currentWidget)
 * @returns {(output: object) => void}
 */
export function mountMenu(root, zebar) {
  // The markup already ties the two together through popovertarget, so the
  // trigger is found from the panel rather than passed in separately.
  const trigger = document.querySelector(`[popovertarget="${root.id}"]`);

  const widget = zebar.currentWidget();
  const openHeight = readPx('--menu-window-h');
  const barHeight = window.innerHeight;

  // Held so a click can reach runCommand. The menu's whole update is keeping
  // this current — nothing about the panel itself changes on a provider tick.
  let latest = {};
  let shrink = null;

  const resize = height =>
    widget.tauriWindow.setSize({
      type: 'Logical',
      width: window.innerWidth,
      height,
    });

  // beforetoggle, not toggle: the window has to be tall enough before the panel
  // is painted, or the first frame shows it cut off.
  root.addEventListener('beforetoggle', event => {
    const isOpening = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(isOpening));

    if (isOpening) {
      clearTimeout(shrink);
      resize(openHeight);
      return;
    }

    // The panel is still on screen for the length of its exit. Shrinking the
    // window now leaves `position-area: bottom` no room below the mark, so
    // position-try-fallbacks relocates the panel on top of the bar: measured, it
    // jumped from y=36 to y=6 and painted 34px of opaque menu over the plate.
    // So the window waits until the panel is gone: one frame past the discrete
    // `display` transition in brand.css.
    const gone = readMs('--dur-base') + 20;

    clearTimeout(shrink);
    shrink = setTimeout(() => {
      // Opening another popover closes this one, and the open arrives first, so
      // shrinking regardless would pull the window out from under the panel
      // that just opened. Only the last popover standing puts the window back.
      const another = [...document.querySelectorAll(':popover-open')].some(
        el => el !== root,
      );
      if (!another && !root.matches(':popover-open')) {
        resize(barHeight);
      }
    }, gone);
  });

  // Light dismiss only covers clicks this window receives. Clicking another
  // application never reaches the page, so the menu would sit there open.
  widget.tauriWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      root.hidePopover();
    }
  });

  root.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;

    if (action === 'reload-bar') {
      location.reload();
    } else if (action === 'reload-glazewm') {
      latest.glazewm?.runCommand('wm-reload-config');
    } else if (action === 'close-bar') {
      widget.close();
    }

    if (action) {
      root.hidePopover();
    }
  });

  return function update(output) {
    latest = output;
  };
}
