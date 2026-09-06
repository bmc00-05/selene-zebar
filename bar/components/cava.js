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
 * How long an unchanging, non-silent frame means the capture has died.
 *
 * cava can end up writing without reading: the process stays alive, the frames
 * keep coming, and every one of them repeats whatever the filters last held.
 * Caught in the wild with the third bar sitting at 0.93 in a silent room while
 * a cava started alongside it read zeros the whole time. Only the process is
 * broken, so only a restart fixes it.
 *
 * Silence is exempt — a still row of zeros is what a quiet machine looks like,
 * and is the one repeated frame that means nothing is wrong. Five seconds is
 * well past anything real audio holds: cava's own smoothing keeps the low
 * digits moving even under a held tone.
 */
const STUCK_MS = 5000;

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

  /** The last frame's values, and when they last differed from the one before. */
  let shownFrame = null;
  let frameChanged = 0;

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
      // The equaliser is the play indicator — media.css has it running while
      // playing and lying flat when nothing is. Left to cava it would follow
      // whatever else the machine happens to make a noise about, and stand up
      // over a track that is paused, which is the opposite of what it is for.
      // Stopping here also means a track left paused for an hour costs nothing.
      root.dataset.playing === 'true' &&
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

      // Both clocks start now. Without resetting the staleness one, a fresh
      // process would inherit the previous one's last change and be judged
      // stuck before it had sent anything.
      lastFrame = performance.now();
      frameChanged = lastFrame;
      shownFrame = null;
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

    let silent = true;

    for (let i = 0; i < BAR_COUNT; i++) {
      const value = Number(parts[i]);
      if (!Number.isFinite(value)) {
        return;
      }
      if (value !== 0) {
        silent = false;
      }

      // Onto the same range the keyframes use, so the two sources sit at the
      // same height at rest and switching between them does not jump.
      const level =
        floor + (1 - floor) * (Math.min(value, MAX_RANGE) / MAX_RANGE);
      bars[i].style.setProperty('--level', level.toFixed(3));
    }

    lastFrame = performance.now();

    // Silence counts as movement here. Repeating zeros is a working cava in a
    // quiet room; repeating anything else is the failure STUCK_MS describes.
    const text = parts.slice(0, BAR_COUNT).join(';');
    if (silent || text !== shownFrame) {
      shownFrame = text;
      frameChanged = lastFrame;
      // Whatever went wrong before, it is reading audio now — so earlier
      // failures were not the start of a pattern worth giving up over.
      restarts = 0;
    }
  }

  /**
   * The two ways cava stops telling the truth, and what to do about each.
   *
   * Frames stop arriving: the process is gone, or wedged before it writes.
   * Walk the bars down, or they hold whatever the last frame said and go on
   * reading as playing. (Not `sleep_timer` — measured, cava keeps emitting
   * through silence, it just emits zeros.)
   *
   * Frames arrive but never change: the process is writing without reading.
   * Nothing recovers from that but a restart — see STUCK_MS.
   */
  function checkIdle() {
    const now = performance.now();

    if (now - lastFrame >= IDLE_MS) {
      for (const bar of bars) {
        bar.style.setProperty('--level', String(floor));
      }
      return;
    }

    // Frames are still arriving and still saying the same thing, and it is not
    // silence — see STUCK_MS. Dropping the process here rather than waiting for
    // an exit that will never come; the next tick starts a fresh one, and
    // releasing puts the keyframes back in the meantime.
    if (child && now - frameChanged >= STUCK_MS) {
      console.warn('[cava] frames stopped changing; restarting.');
      const { processId } = child;
      child = null;
      release();
      kill(processId);
    }
  }
}
