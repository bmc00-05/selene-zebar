/**
 * Output volume: a speaker, the percentage, and a click that mutes.
 *
 * Mute is the only thing written back. The provider can set the level too and
 * this deliberately does not touch it: a stray click on a mute toggle costs one
 * more click, where a stray change to the level loses the number that was
 * there and there is nothing to put back. For the same reason there is no
 * scroll-to-change. The provider's scale is 0-100.
 */

/** Above this the second arc lights, so the icon reads loud at a glance. */
const LOUD_PERCENT = 50;

/**
 * Wires the readout into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .volume button
 * @returns {(output: object) => void}
 */
export function mountVolume(root) {
  const label = root.querySelector('.volume__label');

  /** The last provider output, and the device it described, held for clicks. */
  let latest = null;
  let device = null;

  let shownPercent = null;
  let shownState = null;

  root.addEventListener('click', () => {
    if (!device) {
      return;
    }

    // The device is named rather than left to the provider's default: this
    // widget reports one specific device and must not mute a different one.
    //
    // Nothing is drawn here. Windows pushes the change back fast enough that
    // the widget answers a click on its own — measured at about 150ms — and
    // update() below does the drawing. Painting first would risk showing a
    // state that never happened.
    latest.setMute(!device.isMuted, { deviceId: device.deviceId });
  });

  return function update({ audio }) {
    latest = audio;
    device = audio?.defaultPlaybackDevice ?? null;

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
      // Safe to sit inside this guard: `muted` is the state exactly when the
      // device is muted, so the two can never need updating separately. The
      // label stays `Mute` and this is what says whether it is on — a label
      // that flipped to `Unmute` would contradict it.
      root.setAttribute('aria-pressed', String(device.isMuted));
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
