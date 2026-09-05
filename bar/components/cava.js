/**
 * The equaliser, driven by what is actually coming out of the speakers.
 *
 * Nothing Zebar provides carries audio — the `audio` provider reports devices,
 * volume and mute, and the page is inside a WebView2 sandbox with no loopback
 * capture. So the spectrum comes from outside: `cava`, which does the WASAPI
 * loopback and the FFT and writes bar heights to stdout. This module owns that
 * process and turns its frames into the `--level` each bar is drawn at. It is
 * the same thing YASB's Cava widget does; the mechanism is not ours.
 *
 * This does not replace the equaliser. `.media__eq` and its keyframes stay
 * exactly as they are (media.css) and remain the default — they cost nothing,
 * need nothing installed, and are what shows when cava is absent or switched
 * off. All this does is take over the same seven elements while it is running.
 *
 * The division of labour with the rest of the bar:
 *
 *     settings      whether the user wants it       lib/settings.js, `cava`
 *     this file     whether it is actually running  :root[data-cava]
 *     media.css     what either state looks like
 *
 * `data-cava` is written here rather than by applySettings because a setting
 * that starts a process can fail. Wanting it and having it are different
 * facts, and CSS has to switch on the second one.
 */

import { readNumber } from '../lib/css.js';
import { readSettings } from '../lib/settings.js';

/** Config file, next to index.html. Its [output] section is this contract. */
const CONFIG_FILE = 'cava.conf';

/** Bars in the markup, and `bars` in cava.conf. The two have to agree. */
const BAR_COUNT = 7;

/** `ascii_max_range` in cava.conf: frames arrive as integers 0..this. */
const MAX_RANGE = 1000;

/** How often the watchdog looks, and how stale a frame may be before it acts. */
const WATCH_MS = 150;
const IDLE_MS = 300;

/**
 * Unexpected exits tolerated before cava is written off for this session.
 *
 * Without a ceiling, a cava that dies on startup would be spawned again on the
 * very next tick, once a second, forever.
 */
const MAX_RESTARTS = 3;

/**
 * Wires the driver to `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .media button
 * @param {object} zebar      the zebar module (for shellSpawn and currentWidget)
 * @returns {(output: object) => void}
 */
export function mountCava(root, zebar) {
  const bars = [...root.querySelectorAll('.media__eq i')];
  const html = document.documentElement;

  // The config sits next to index.html; htmlPath is the only absolute path the
  // widget API hands out. Same derivation as the icon script in
  // active-window.js.
  const configPath =
    zebar.currentWidget().htmlPath.replace(/[\\/][^\\/]*$/, '') +
    '/' +
    CONFIG_FILE;

  const floor = readNumber('--media-eq-floor');

  /** The running process, or null. */
  let child = null;
  /** A spawn is in flight. Stops the next tick from starting a second one. */
  let starting = false;
  /** Set once cava has proved unavailable; nothing is attempted after this. */
  let unavailable = false;
  let restarts = 0;
  let watchdog = null;
  let lastFrame = 0;

  // A reload does not take the process with it. Zebar kills what a widget
  // spawned only when the whole application drops its shell state — a page
  // going away is not that — so without this, every reload of the bar leaves
  // another cava running with nobody reading it. Best effort: the IPC call may
  // not finish before the page does, but it is the only chance there is.
  window.addEventListener('pagehide', () => {
    if (child) {
      kill(child.processId);
    }
  });

  return function update() {
    const settings = readSettings();
    const wanted =
      settings.cava &&
      !settings.saver &&
      // Both of the ways the equaliser can be off screen. `hidden` is media.js
      // putting the widget away when playback stops; the setting is the widget
      // switched off in the panel, which is display:none rather than hidden.
      settings['widget:media'] &&
      !root.hidden &&
      !unavailable;

    // Reconciled on the provider tick — about once a second — rather than by
    // subscribing to the settings store. Every component here is already a
    // function of the current state called on every tick, and a second's delay
    // on a switch nobody is watching costs nothing.
    if (wanted && !child && !starting) {
      start();
    } else if (!wanted && child) {
      stop();
    }
  };

  async function start() {
    starting = true;

    try {
      const process = await zebar.shellSpawn('cava', ['-p', configPath]);

      process.onStdout(onFrame);
      // Told apart by which process it is rather than by a flag saying whether
      // the death was ours: stop() clears `child` before the event can arrive,
      // so a late exit for one already let go is ignored without bookkeeping.
      process.onExit(() => onExit(process));
      child = process;

      lastFrame = performance.now();
      watchdog = setInterval(checkIdle, WATCH_MS);
      html.dataset.cava = 'live';
    } catch (error) {
      // Either cava is not installed, or zpack.json does not allow it. Neither
      // gets better by trying again, and the decorative keyframes are still
      // running underneath, so the bar loses nothing but the real data.
      unavailable = true;
      html.dataset.cava = 'missing';
      console.warn('[cava] could not start:', error);
    } finally {
      starting = false;
    }
  }

  /** Puts the elements back the way the keyframes expect to find them. */
  function stop() {
    const { processId } = child;
    child = null;
    release();
    kill(processId);
  }

  function onExit(process) {
    if (child !== process) {
      return;
    }

    // cava went away on its own. Let the next tick start it again, up to a
    // point — see MAX_RESTARTS.
    child = null;
    release();

    if (++restarts > MAX_RESTARTS) {
      unavailable = true;
      html.dataset.cava = 'missing';
      console.warn(`[cava] exited ${restarts} times; giving up for this run.`);
    }
  }

  /**
   * Terminates a process this widget spawned.
   *
   * Not `process.kill()`. Zebar's client sends `{ processId }` and the command
   * behind it takes `pid`, so the call comes back "invalid args `pid` for
   * command `shell_kill`: missing required key pid" and the process keeps
   * running — measured here, and it left seven orphaned cavas behind before it
   * was found. The same mismatch is in the client on `main`, so there is no
   * version to upgrade past; `write()` has it too, which is why nothing here
   * talks to cava over stdin.
   *
   * Invoking the command with the name it actually wants does terminate the
   * process. `__TAURI_INTERNALS__` is what the official wrapper calls anyway.
   */
  function kill(processId) {
    const internals = window.__TAURI_INTERNALS__;

    if (!internals?.invoke) {
      // Nothing here works if the internals ever move, but the wrapper at
      // least leaves the reason in the console rather than failing silently.
      child?.kill();
      return;
    }

    internals
      .invoke('shell_kill', { pid: processId })
      .catch(error => console.warn('[cava] could not stop:', error));
  }

  function release() {
    clearInterval(watchdog);
    watchdog = null;
    delete html.dataset.cava;

    // Removing the property rather than writing the floor into it: the
    // keyframes take over the moment the attribute goes, and a leftover
    // --level would sit in the cascade doing nothing but confusing the next
    // person to look.
    for (const bar of bars) {
      bar.style.removeProperty('--level');
    }
  }

  /**
   * One frame: `n;n;n;n;n;n;n;\n`, integers 0..MAX_RANGE. Zebar splits stdout
   * on newlines, so this is called once per frame with the whole line.
   */
  function onFrame(line) {
    const parts = line.split(';');
    // Seven values plus whatever follows the trailing delimiter. Anything
    // shorter is not a frame, and guessing at a partial one would show a lie.
    if (parts.length <= BAR_COUNT) {
      return;
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      const value = Number(parts[i]);
      if (!Number.isFinite(value)) {
        return;
      }

      // Onto the same range the keyframes use, so the two sources sit at the
      // same height at rest and switching between them does not jump.
      const level =
        floor + (1 - floor) * (Math.min(value, MAX_RANGE) / MAX_RANGE);
      bars[i].style.setProperty('--level', level.toFixed(3));
    }

    lastFrame = performance.now();
  }

  /**
   * Walks the bars down when frames stop arriving — cava asleep on silence
   * (`sleep_timer`), or the process gone. Without this they would hold
   * whatever the last frame said, which reads as playing.
   */
  function checkIdle() {
    if (performance.now() - lastFrame < IDLE_MS) {
      return;
    }

    for (const bar of bars) {
      bar.style.setProperty('--level', String(floor));
    }
  }
}
