/**
 * Battery: a gauge that fills with the charge, and the percentage beside it.
 *
 * It never hides. At 100% on mains power it is still drawn, so the widgets to
 * its left keep a fixed position instead of sliding whenever the battery state
 * changes.
 *
 * The warning for a low battery is brightness, not colour. Everything in this
 * bar sits at one hue, and a red would be the only thing in it that does not.
 * Going from --fg-soft up to --accent makes the gauge the brightest thing on
 * the right-hand side, which reads as loudly as a colour change would.
 */

/** Below this, discharging counts as low: the gauge brightens. */
const LOW_PERCENT = 30;

/** Below this it also pulses. Kept in JS because JS is what picks the class. */
const CRITICAL_PERCENT = 15;

/**
 * Smallest fill the gauge will draw for a non-empty battery, as a fraction of
 * the full bar. The fill is 17 units wide, so this is about 2.5 units — enough
 * to stay visible inside a 1-unit stroke.
 */
const MIN_LEVEL = 0.15;

/**
 * Wires the gauge into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .battery element
 * @returns {(output: object) => void}
 */
export function mountBattery(root) {
  const label = root.querySelector('.battery__label');

  let shownState = null;
  let shownPercent = null;

  return function update({ battery }) {
    if (!battery) {
      root.hidden = true;
      shownState = null;
      shownPercent = null;
      return;
    }

    root.hidden = false;

    const percent = Math.round(battery.chargePercent);
    const state = stateOf(battery, percent);

    if (percent !== shownPercent) {
      shownPercent = percent;
      label.textContent = `${percent}%`;
      // The gauge scales rather than resizes, so this is a ratio, not a width.
      // CSS animates it from here; see battery.css.
      //
      // Floored at MIN_LEVEL: below that the fill is thinner than the shell's
      // own stroke and reads as empty, which is exactly the wrong thing to
      // show at 3%. Zero stays zero — an empty battery should look empty.
      const level = percent === 0 ? 0 : Math.max(percent / 100, MIN_LEVEL);
      root.style.setProperty('--battery-level', String(level));
    }

    if (state !== shownState) {
      shownState = state;
      // One state class at a time keeps the CSS a flat list rather than a
      // matrix of combinations.
      root.dataset.state = state;
    }
  };
}

/**
 * Collapses the provider's five states plus the charge level into the one
 * label the stylesheet switches on.
 *
 * `state` comes straight from the provider and is one of discharging,
 * charging, full, empty or unknown — the low and critical steps are ours,
 * layered on top of discharging only. A charging battery at 8% is not a
 * warning; it is already being dealt with.
 */
function stateOf(battery, percent) {
  if (battery.state !== 'discharging') {
    return battery.state;
  }

  if (percent <= CRITICAL_PERCENT) {
    return 'critical';
  }

  if (percent <= LOW_PERCENT) {
    return 'low';
  }

  return 'discharging';
}
