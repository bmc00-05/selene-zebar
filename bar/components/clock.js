/**
 * The clock, and the button that opens the calendar behind it.
 *
 * Two formats from one provider tick: the bar shows the short one, the tooltip
 * carries the year and the full weekday for when the short one is not enough.
 */

/**
 * What the bar shows: `Fri, 04 Sep 17:04`. HH is what makes it 24-hour.
 *
 * `dd`, not `d`: the day keeps two digits so the clock does not widen on the
 * 10th of every month — this sits in the right-hand group, which is anchored
 * to the right edge, so a wider clock pushes the volume and RAM readouts left.
 * Weekday and month names still vary by a few px because the letters are
 * proportional; that happens once a day and is not worth a fixed-width font.
 * The comma marks where the weekday ends between two three-letter tokens.
 */
export const CLOCK_FORMAT = 'EEE, dd MMM HH:mm';

/**
 * Wires the clock into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .clock element
 * @returns {(output: object) => void}
 */
export function mountClock(root) {
  const label = root.querySelector('.clock__label');

  let shownText = null;
  let shownTooltipDay = null;

  return function update({ date }) {
    if (!date) {
      root.hidden = true;
      shownText = null;
      shownTooltipDay = null;
      return;
    }

    root.hidden = false;

    // The provider ticks every second but the display is only accurate to the
    // minute, so most ticks have nothing to say. Comparing first keeps 59 out
    // of 60 of them from touching the DOM.
    if (date.formatted !== shownText) {
      shownText = date.formatted;
      label.textContent = date.formatted;
    }

    // The tooltip only changes at midnight; rebuilding it every second would
    // be the same waste one level down.
    const day = date.iso.slice(0, 10);
    if (day !== shownTooltipDay) {
      shownTooltipDay = day;
      root.title = fullDate(new Date(date.iso));
    }
  };
}

/**
 * The long form, in whatever the system locale is — this is the line that says
 * what the short one leaves out, so it is worth reading in the reader's own
 * language rather than the bar's abbreviated English.
 */
function fullDate(when) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
  }).format(when);
}
