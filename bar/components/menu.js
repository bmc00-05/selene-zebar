/**
 * The panel behind the Selene mark: the bar's settings, and two ways back to a
 * working bar.
 *
 * Opening and closing is the browser's job — the popover attributes in
 * index.html handle the top layer, outside clicks and Escape, and CSS anchor
 * positioning places the panel. lib/window.js grows the window while it is
 * open, since the panel would otherwise be clipped at the edge of a 40px-tall
 * window, and closes it when the window loses focus.
 *
 * What a setting means is not known here. A control names its key in
 * `data-setting`, lib/settings.js stores it and publishes it onto the root
 * element, and the stylesheets do the rest — so a new setting is a control in
 * the markup and a rule in CSS, with nothing to add to this file.
 */

import { readPx } from '../lib/css.js';
import { growWindowWhileOpen } from '../lib/window.js';
import { readSettings, resetSettings, writeSetting } from '../lib/settings.js';

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

  growWindowWhileOpen(root, widget, { height: readPx('--menu-window-h') });

  root.addEventListener('beforetoggle', event => {
    const isOpening = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(isOpening));

    // Read the store on every open rather than only at mount. This panel is
    // the only thing that writes settings, so the switches cannot really drift
    // — but a panel that states its own idea of the truth is one that can be
    // wrong, and syncing here costs nine attribute writes.
    if (isOpening) {
      showSettings();
    }
  });

  root.addEventListener('click', event => {
    const control = event.target.closest('[data-setting], [data-action]');
    if (!control) {
      return;
    }

    if (control.dataset.setting) {
      toggle(control);
      return;
    }

    // Neither action closes the panel. Reloading takes the whole page with it,
    // and a reset is worth watching land — the chips light back up in place.
    if (control.dataset.action === 'reload-bar') {
      location.reload();
    } else if (control.dataset.action === 'reset') {
      resetSettings();
      showSettings();
    }
  });

  // Nothing here depends on provider output; the contract is the same shape
  // regardless, as with mountPower.
  return function update() {};

  /** Puts every control where the stored settings say it should be. */
  function showSettings() {
    const settings = readSettings();

    for (const control of root.querySelectorAll('[data-setting]')) {
      control.setAttribute(
        'aria-checked',
        String(Boolean(settings[control.dataset.setting])),
      );
    }

    showCounts();
  }

  /**
   * Fills in `n/total` beside a heading that introduces a group of chips. The
   * group is named by the key prefix in `data-count`, so the markup decides
   * what is being counted and this stays one loop however many groups there
   * are.
   */
  function showCounts() {
    for (const label of root.querySelectorAll('[data-count]')) {
      const controls = [
        ...root.querySelectorAll(`[data-setting^="${label.dataset.count}"]`),
      ];
      const on = controls.filter(
        control => control.getAttribute('aria-checked') === 'true',
      );
      label.textContent = `${on.length}/${controls.length}`;
    }
  }

  function toggle(control) {
    const on = control.getAttribute('aria-checked') !== 'true';
    control.setAttribute('aria-checked', String(on));
    writeSetting(control.dataset.setting, on);
    showCounts();
  }
}
