/**
 * Window icons, extracted once per application and shared by every component
 * that draws one.
 *
 * The page is sandboxed away from Win32, so an icon is fetched by running
 * scripts/window-icon.ps1 through Zebar's shellExec. That costs most of a
 * second, almost all of it PowerShell starting — measured at 445-710ms across
 * five applications — so the answer is cached and the cost lands once per
 * application per session.
 *
 * This started inside active-window.js and moved out when the minimised-windows
 * panel needed the same icons. Kept there it would have meant a second cache:
 * the panel lists whatever is hidden right now, which is mostly applications the
 * centre readout has already paid for, and a private cache would have paid for
 * every one of them again.
 *
 * Minimising does not affect any of this. The extraction asks the window
 * through WM_GETICON, which answers from the window's own handle whether or not
 * it is on screen — measured against five minimised windows, all five returned
 * an icon.
 */

/** Processes that host PWAs. Their windows share a process but not an icon. */
const PWA_HOSTS = new Set(['chrome', 'msedge']);

const ICON_SCRIPT = 'scripts/window-icon.ps1';

/** key -> data URL, or null when the window turned out to have none. */
const icons = new Map();

/** key -> the extraction already running for it. See windowIcon(). */
const inFlight = new Map();

/** Resolved once, from the only absolute path the widget API hands out. */
let scriptPath = null;

/**
 * One icon per application is the rule — except for PWA hosts, where every
 * window is chrome.exe and each carries a different icon, so those are keyed
 * by window instead.
 *
 * @param {object} container  a GlazeWM window
 * @returns {string}
 */
export function iconKey(container) {
  return PWA_HOSTS.has(container.processName)
    ? `${container.processName}:${container.handle}`
    : container.processName;
}

/**
 * The icon already known for `container`, without going near PowerShell.
 *
 * Three answers, and they are all different: a data URL, `null` for a window
 * that has been asked and has none, and `undefined` for one that has never been
 * asked. Callers use the last to decide whether to show a placeholder.
 *
 * @param {object} container  a GlazeWM window
 * @returns {string | null | undefined}
 */
export function cachedIcon(container) {
  return icons.get(iconKey(container));
}

/**
 * The icon for `container`, extracting it if this is the first time.
 *
 * Extractions in flight are shared rather than duplicated: the centre readout
 * and the minimised panel can want the same application within the same second,
 * and starting PowerShell twice for one answer is the cost this file exists to
 * avoid.
 *
 * @param {object} zebar      the zebar module (for shellExec and currentWidget)
 * @param {object} container  a GlazeWM window
 * @returns {Promise<string | null>}
 */
export function windowIcon(zebar, container) {
  const key = iconKey(container);

  if (icons.has(key)) {
    return Promise.resolve(icons.get(key));
  }

  const running = inFlight.get(key);
  if (running) {
    return running;
  }

  const attempt = extract(zebar, container.handle).then(icon => {
    icons.set(key, icon);
    inFlight.delete(key);
    return icon;
  });

  inFlight.set(key, attempt);
  return attempt;
}

async function extract(zebar, handle) {
  try {
    const result = await zebar.shellExec('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      pathTo(zebar),
      String(handle),
    ]);
    // shellExec resolves to { code, success, signal, stdout, stderr }. The
    // script prints nothing and exits 0 for a window without an icon, so an
    // empty stdout is a normal answer, not a failure.
    if (!result.success) {
      console.warn('[window-icon] script failed:', result.stderr);
      return null;
    }
    const base64 = result.stdout.trim();
    return base64 ? `data:image/png;base64,${base64}` : null;
  } catch (error) {
    console.warn('[window-icon] extraction failed:', error);
    return null;
  }
}

/** The script sits next to index.html, whose path is the one on offer. */
function pathTo(zebar) {
  scriptPath ??=
    zebar.currentWidget().htmlPath.replace(/[\\/][^\\/]*$/, '') +
    '/' +
    ICON_SCRIPT;
  return scriptPath;
}
