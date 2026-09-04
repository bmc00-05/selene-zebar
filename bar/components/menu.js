/**
 * The menu behind the Selene mark.
 *
 * Opening and closing is the browser's job — the popover attributes in
 * index.html handle the top layer, outside clicks and Escape, and CSS anchor
 * positioning places the panel. The panel would be clipped at the edge of a
 * 40px-tall window, so the window grows while the menu is open; lib/window.js
 * owns that for every panel that needs it.
 *
 * Growing it is safe. The strip GlazeWM keeps clear comes from the preset in
 * zpack.json, not from the live window, so nothing on the desktop shifts —
 * measured before and after: workspace y=55 h=1020 either way.
 */

import { readPx } from '../lib/css.js';
import { growWindowWhileOpen } from '../lib/window.js';

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

  // Held so a click can reach runCommand. The menu's whole update is keeping
  // this current — nothing about the panel itself changes on a provider tick.
  let latest = {};

  growWindowWhileOpen(root, widget, { height: readPx('--menu-window-h') });

  root.addEventListener('beforetoggle', event => {
    trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
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
