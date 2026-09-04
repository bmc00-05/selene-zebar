/**
 * The focused window, for the centre of the bar: its own icon and its title.
 * Mirrors the YASB active_window widget this bar replaces — icon + title,
 * ellipsis when long, nothing at all when no window has focus.
 *
 * The title is free: it arrives on every glazewm tick. The icon is not — the
 * page is sandboxed away from Win32, so it is fetched by running
 * scripts/window-icon.ps1 through Zebar's shellExec. That costs ~0.9s, almost
 * all of it PowerShell starting, so results are cached and the cost lands once
 * per application per session. The title shows immediately; the icon fades in
 * when it lands.
 */

/** Processes that host PWAs. Their windows share a process but not an icon. */
const PWA_HOSTS = new Set(['chrome', 'msedge']);

const ICON_SCRIPT = 'scripts/window-icon.ps1';

/**
 * Wires the readout into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .active-window element
 * @param {object} zebar      the zebar module (for shellExec and currentWidget)
 * @returns {(container: object | null) => void}
 */
export function mountActiveWindow(root, zebar) {
  const els = {
    icon: root.querySelector('.active-window__icon'),
    titles: [...root.querySelectorAll('.active-window__title > span')],
  };

  /** cache key -> data URL, or null when the window turned out to have none. */
  const iconCache = new Map();

  // The script lives next to index.html; htmlPath is the only absolute path
  // the widget API hands out.
  const scriptPath =
    zebar.currentWidget().htmlPath.replace(/[\\/][^\\/]*$/, '') +
    '/' +
    ICON_SCRIPT;

  let shownTitle = null;
  let shownKey = null;
  let activeSlot = 0;

  return function update(container) {
    if (!container || container.type !== 'window') {
      root.hidden = true;
      shownTitle = null;
      shownKey = null;
      return;
    }

    root.hidden = false;
    setTitle(container.title);

    const key = cacheKey(container);
    if (key === shownKey) {
      return;
    }
    shownKey = key;
    showIcon(key, container.handle);
  };

  /**
   * Swaps the title in by cross-fading two stacked spans. Writing the new text
   * into the visible span would just flash it; fading a second span in over
   * the first reads as one window handing over to the next.
   */
  function setTitle(title) {
    if (title === shownTitle) {
      return;
    }
    shownTitle = title;

    const next = 1 - activeSlot;
    els.titles[next].textContent = title;
    els.titles[next].classList.add('is-current');
    els.titles[activeSlot].classList.remove('is-current');
    activeSlot = next;
  }

  async function showIcon(key, handle) {
    let icon = iconCache.get(key);

    if (icon === undefined) {
      // Not seen before. Fall back to the glyph rather than leaving a gap or
      // keeping the previous application's icon under the new title — this is
      // the state the slot holds for the second or so the extraction takes.
      root.classList.remove('has-icon');

      icon = await fetchIcon(handle);
      iconCache.set(key, icon);

      // Focus may have moved on during the round trip. Only the window that
      // is still current gets to paint.
      if (key !== shownKey) {
        return;
      }
    }

    if (icon) {
      els.icon.style.backgroundImage = `url(${icon})`;
    }
    // No icon means the glyph is the answer, not a placeholder: leave it.
    root.classList.toggle('has-icon', Boolean(icon));
  }

  async function fetchIcon(handle) {
    try {
      const result = await zebar.shellExec('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        String(handle),
      ]);
      // shellExec resolves to { code, success, signal, stdout, stderr }. The
      // script prints nothing and exits 0 for a window without an icon, so an
      // empty stdout is a normal answer, not a failure.
      if (!result.success) {
        console.warn('[active-window] icon script failed:', result.stderr);
        return null;
      }
      const base64 = result.stdout.trim();
      return base64 ? `data:image/png;base64,${base64}` : null;
    } catch (error) {
      console.warn('[active-window] icon extraction failed:', error);
      return null;
    }
  }
}

/**
 * One icon per application is the rule — except for PWA hosts, where every
 * window is chrome.exe and each carries a different icon, so those are keyed
 * by window instead.
 */
function cacheKey(container) {
  return PWA_HOSTS.has(container.processName)
    ? `${container.processName}:${container.handle}`
    : container.processName;
}
