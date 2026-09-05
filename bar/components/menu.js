/**
 * The menu behind the Selene mark.
 *
 * Opening and closing is the browser's job — the popover attributes in
 * index.html handle the top layer, outside clicks and Escape, and CSS anchor
 * positioning places the panel. lib/window.js grows the window while the menu
 * is open, since the panel would otherwise be clipped at the edge of a
 * 40px-tall window, and closes it when the window loses focus.
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
