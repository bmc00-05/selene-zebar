/**
 * Output volume: a speaker and the percentage.
 *
 * Read-only. The provider can set the volume as well, but nothing here calls
 * that — a status bar that changes what it reports on a stray click is worse
 * than one that only reports.
 *
 * The scale is 0-100, not 0-1. Checked against Windows rather than assumed:
 * 42/75/10 on the system slider came back as 42/75/10 here.
 */

/** Above this the second arc lights, so the icon reads loud at a glance. */
const LOUD_PERCENT = 50;

/**
 * Wires the readout into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .volume element
 * @returns {(output: object) => void}
 */
export function mountVolume(root) {
  const label = root.querySelector('.volume__label');

  let shownPercent = null;
  let shownState = null;

  return function update({ audio }) {
    const device = audio?.defaultPlaybackDevice ?? null;

    if (!device) {
      root.hidden = true;
      shownPercent = null;
      shownState = null;
      return;
    }

    root.hidden = false;

    const percent = Math.round(device.volume);
    if (percent !== shownPercent) {
      shownPercent = percent;
      label.textContent = `${percent}%`;
    }

    const state = stateOf(device, percent);
    if (state !== shownState) {
      shownState = state;
      // One state at a time, as with the battery and the RAM ring; the
      // stylesheet decides which parts of the icon that lights.
      root.dataset.state = state;
    }
  };
}

/**
 * Which of the four pictures the icon wears.
 *
 * Muted wins over everything: it is a separate flag from the volume, and a
 * muted device at 40% is silent no matter what the number says. The number is
 * still shown, because it is where the sound comes back to.
 */
function stateOf(device, percent) {
  if (device.isMuted) {
    return 'muted';
  }

  if (percent === 0) {
    return 'silent';
  }

  return percent > LOUD_PERCENT ? 'high' : 'low';
}
