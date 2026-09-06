/**
 * What the bar remembers between runs.
 *
 * Stored in localStorage. The widget is a page served from a fixed origin —
 * http://127.0.0.1:6124, the port is compiled into zebar.exe — so the store
 * survives a reload and a full Zebar restart alike. Zebar itself offers no
 * settings API; a file would mean registering a writer script in zpack.json
 * and passing JSON through an argsRegex, which buys hand-editing at the cost
 * of a lot of machinery. Swapping this file is the whole migration if that
 * ever becomes worth it.
 *
 * Keys are flat, and a key is exactly what the markup carries in
 * `data-setting`. One name for one switch, so the panel and the store cannot
 * drift apart.
 *
 * Nothing here knows what a setting means. Everything is published onto the
 * root element and CSS decides what that looks like — which is what keeps the
 * components out of it entirely.
 */

const KEY = 'selene:settings';

/** Every setting there is, and what it is when nothing has been chosen. */
const DEFAULTS = {
  /** Stop the animations that never end. See the [data-saver] rules in CSS. */
  saver: false,

  /**
   * Drive the equaliser from the real spectrum instead of the keyframes.
   *
   * The one setting applySettings does not publish. The others are answered by
   * a rule; this one starts an external process that may not be there, so
   * components/cava.js reads it here and writes what actually happened onto
   * the root as `data-cava`. CSS switches on that, not on this.
   */
  cava: false,

  'widget:workspaces': true,
  'widget:media': true,
  'widget:active-window': true,
  'widget:volume': true,
  'widget:memory': true,
  'widget:clock': true,
  'widget:battery': true,
  'widget:layout': true,
  'widget:power': true,
};

const WIDGET_PREFIX = 'widget:';

let current = load();

/** The settings as they stand. Treat the result as read-only. */
export function readSettings() {
  return current;
}

/**
 * Changes one setting, stores it, and puts it on screen.
 *
 * @param {string} key    a key of DEFAULTS, e.g. 'saver' or 'widget:media'
 * @param {boolean} value
 */
export function writeSetting(key, value) {
  if (!(key in DEFAULTS)) {
    console.warn(`[settings] unknown key: ${key}`);
    return;
  }

  current = { ...current, [key]: value };
  applySettings();

  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch (error) {
    // A setting that cannot be stored still applies for this run; the bar
    // being usable now matters more than remembering it later.
    console.warn('[settings] could not store:', error);
  }
}

/**
 * Puts everything back to its defaults and forgets the stored copy.
 *
 * The way out of a bar with most of its widgets switched off, without turning
 * each one back on. Removing the key rather than storing the defaults means
 * the next read goes through load() exactly as it would on a machine that has
 * never been configured.
 */
export function resetSettings() {
  current = { ...DEFAULTS };
  applySettings();

  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    console.warn('[settings] could not clear:', error);
  }
}

/**
 * Publishes the settings onto the root element, where the stylesheets read
 * them. Called once before the widgets mount, and again on every change.
 *
 * The widget list is written as a space-separated set rather than one
 * attribute per widget, so `[data-widgets~='clock']` matches a single name and
 * bar.css needs one selector per widget instead of one attribute per widget.
 */
export function applySettings() {
  const root = document.documentElement;

  root.toggleAttribute('data-saver', current.saver);
  root.dataset.widgets = Object.keys(DEFAULTS)
    .filter(key => key.startsWith(WIDGET_PREFIX) && current[key])
    .map(key => key.slice(WIDGET_PREFIX.length))
    .join(' ');
}

/**
 * Reads the store, over the defaults.
 *
 * Merged rather than taken whole, so a key added to DEFAULTS later still has
 * its default for anyone whose store predates it — and a key that has since
 * been removed is dropped instead of lingering.
 */
function load() {
  let stored = null;

  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch (error) {
    console.warn('[settings] could not read, using defaults:', error);
  }

  const settings = { ...DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof stored[key] === 'boolean') {
        settings[key] = stored[key];
      }
    }
  }

  return settings;
}
