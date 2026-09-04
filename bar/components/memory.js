/**
 * RAM: a ring that fills with the usage, and the percentage beside it.
 *
 * A ring rather than a bar. The battery next to it is a bar, and two bars side
 * by side reading "how full is this" would need a second glance to tell apart;
 * a ring reads as a different quantity at once.
 *
 * Warns in colour: amber at 80%, red at 90%, on the ring and the number alike.
 * The rest of the bar sits at hue 278 and signals with brightness; these two
 * colours and the battery's are the exception, and the reasoning is in
 * tokens.css next to the values.
 *
 * Unlike the battery this stops at colour — it does not pulse. Memory at 90%
 * means the machine is being used, which is worth showing but not worth
 * interrupting for.
 */

/** Above this, amber. */
const WARN_PERCENT = 80;

/** Above this, red. */
const ALERT_PERCENT = 90;

/**
 * Wires the ring into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .memory element
 * @returns {(output: object) => void}
 */
export function mountMemory(root) {
  const label = root.querySelector('.memory__label');

  let shownPercent = null;
  let shownState = null;
  let shownTooltip = null;

  return function update({ memory }) {
    if (!memory) {
      root.hidden = true;
      shownPercent = null;
      shownState = null;
      shownTooltip = null;
      return;
    }

    root.hidden = false;

    const percent = Math.round(memory.usage);

    // The provider ticks every five seconds and the number rarely moves, so
    // comparing first keeps most ticks off the DOM — as in clock.js.
    if (percent !== shownPercent) {
      shownPercent = percent;
      label.textContent = `${percent}%`;
      // Just the number. The ring's circumference is normalised to 100 by
      // `pathLength` in the markup, so a percentage is already the arc length
      // and nothing here has to know about 2*pi*r. CSS animates it from here;
      // see memory.css.
      root.style.setProperty('--mem-level', String(percent));
    }

    const state = stateOf(percent);
    if (state !== shownState) {
      shownState = state;
      // One state class at a time, like the battery. CSS hangs a colour on it
      // and both the ring and the label inherit that one colour, so they
      // cannot disagree.
      root.dataset.state = state;
    }

    const tooltip = `${gib(memory.usedMemory)} / ${gib(memory.totalMemory)} GB`;
    if (tooltip !== shownTooltip) {
      shownTooltip = tooltip;
      root.title = tooltip;
    }
  };
}

/** Which of the three colours the ring and the number wear. */
function stateOf(percent) {
  if (percent >= ALERT_PERCENT) {
    return 'alert';
  }

  if (percent >= WARN_PERCENT) {
    return 'warn';
  }

  return 'normal';
}

/**
 * Bytes to a one-decimal figure.
 *
 * Divided by 1024^3, and labelled GB anyway: that is what Windows Task Manager
 * shows for the same machine, and a bar sitting on Windows disagreeing with
 * Windows about how much memory is installed would read as a bug.
 */
function gib(bytes) {
  return (bytes / 1024 ** 3).toFixed(1);
}
