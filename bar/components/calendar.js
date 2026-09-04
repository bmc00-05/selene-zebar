/**
 * The month calendar behind the clock.
 *
 * Same shape as the Selene menu: the popover attributes in index.html hand the
 * browser the top layer, Escape and light dismiss, CSS anchor positioning puts
 * the panel under the clock, and the only thing left for JavaScript is growing
 * the widget window — a popover escapes the page, not the window.
 *
 * This month only. There is no navigation and therefore no state to get out of
 * sync: every open shows today. What fills the grid comes from the date
 * provider rather than `new Date()`, so the clock and the highlighted day can
 * never disagree, and the calendar rolls over at midnight on its own.
 */

import { readMs, readPx } from '../lib/css.js';

/** A calendar is always six rows, so the panel is one height. See build(). */
const CELLS = 42;

/**
 * A Sunday, used to name weekdays without hardcoding any of them: adding the
 * ISO weekday number modulo 7 lands on that weekday. 2026-09-06 in UTC.
 */
const REF_SUNDAY = Date.UTC(2026, 8, 6);

/**
 * Wires the calendar behind `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the popover panel
 * @param {object} zebar      the zebar module (for currentWidget)
 * @returns {(output: object) => void}
 */
export function mountCalendar(root, zebar) {
  // The markup already ties panel and trigger together through popovertarget,
  // so the clock is found from here rather than passed in — as in menu.js.
  const trigger = document.querySelector(`[popovertarget="${root.id}"]`);

  const monthTitle = root.querySelector('.calendar__month');
  const head = root.querySelector('.calendar__head');
  const body = root.querySelector('.calendar__body');

  const widget = zebar.currentWidget();
  const openHeight = readPx('--cal-window-h');
  const barHeight = window.innerHeight;

  // Where the week starts and which days are the weekend both come from the
  // locale. `firstDay` is ISO — 1 is Monday, 7 is Sunday — where Date.getDay()
  // counts 0 as Sunday. Mixing the two shifts the whole grid by a day.
  const { firstDay, weekend } = new Intl.Locale(
    navigator.language,
  ).getWeekInfo();

  const monthName = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
  });

  // The day currently drawn, as `YYYY-MM-DD`. The grid is rebuilt only when
  // this changes, which is at most once a day.
  let builtDay = null;
  let today = null;
  let shrink = null;

  buildHead();

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
      if (today && today !== builtDay) {
        build(today);
      }
      resize(openHeight);
      return;
    }

    // The panel is still on screen for the length of its exit. Shrinking the
    // window now leaves `position-area: bottom` no room below the clock, so
    // position-try-fallbacks relocates the panel on top of the bar: measured, it
    // jumped from y=35 to y=6 and painted 34px of the month header over the
    // plate for six frames. So the window waits until the panel is gone.
    // One frame past the discrete `display` transition in calendar.css, which is
    // what actually takes the panel off screen.
    const gone = readMs('--dur-base') + 20;

    clearTimeout(shrink);
    shrink = setTimeout(() => {
      // Opening another popover closes this one, and the open arrives first —
      // so shrinking regardless would pull the window out from under the panel
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
  // application never reaches the page, so the panel would sit there open.
  widget.tauriWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      root.hidePopover();
    }
  });

  return function update({ date }) {
    // The provider ticks every second; only the day part matters here.
    today = date ? date.iso.slice(0, 10) : null;
  };

  /** The weekday header, written once — the locale does not change. */
  function buildHead() {
    const narrow = new Intl.DateTimeFormat(navigator.language, {
      weekday: 'narrow',
    });

    for (let i = 0; i < 7; i++) {
      const dow = ((firstDay - 1 + i) % 7) + 1;
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = narrow.format(
        new Date(REF_SUNDAY + (dow % 7) * 86400000),
      );
      th.classList.toggle('is-weekend', weekend.includes(dow));
      head.append(th);
    }
  }

  /**
   * Draws the month containing `day` (`YYYY-MM-DD`).
   *
   * Always 42 cells. Months need five rows or six depending on where the 1st
   * falls, and a panel that changed height between months would no longer match
   * the fixed window height in --cal-window-h. Filling the spare cells with the
   * neighbouring months costs nothing and looks better than blanks.
   */
  function build(day) {
    const [year, month] = day.split('-').map(Number);
    const first = new Date(year, month - 1, 1);

    // How many cells of the previous month come before the 1st. Cell i is then
    // day `1 - lead + i`, which Date normalises into the neighbouring month on
    // its own — no separate handling for the ends.
    const lead = (isoDay(first) - firstDay + 7) % 7;

    monthTitle.textContent = monthName.format(first);
    body.replaceChildren();

    let row = null;
    for (let i = 0; i < CELLS; i++) {
      if (i % 7 === 0) {
        row = document.createElement('tr');
        body.append(row);
      }

      const cell = new Date(year, month - 1, 1 - lead + i);
      const td = document.createElement('td');
      td.textContent = String(cell.getDate());
      td.classList.toggle('is-outside', cell.getMonth() !== first.getMonth());
      td.classList.toggle('is-weekend', weekend.includes(isoDay(cell)));

      if (iso(cell) === day) {
        td.classList.add('is-today');
        // The one cell a screen reader should announce as the current date.
        td.setAttribute('aria-current', 'date');
      }

      row.append(td);
    }

    builtDay = day;
  }
}

/** Date.getDay() renumbered to ISO, where Monday is 1 and Sunday is 7. */
function isoDay(when) {
  return when.getDay() === 0 ? 7 : when.getDay();
}

/** Local `YYYY-MM-DD`. toISOString() would convert to UTC and shift the day. */
function iso(when) {
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const day = String(when.getDate()).padStart(2, '0');
  return `${when.getFullYear()}-${month}-${day}`;
}
