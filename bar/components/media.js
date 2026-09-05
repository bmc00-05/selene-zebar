/**
 * What is playing: an equaliser, the track, and a panel behind it.
 *
 * The bar shows `제목 · 아티스트`, scrolling only when it is too long to fit.
 * Clicking opens a popover with the elapsed time and the transport controls.
 *
 * Two things about the provider shape this file. It emits about every eight
 * seconds and instantly on play/pause, which is fine for the text but too
 * coarse for a progress bar — hence the interpolation below. And its
 * `isCurrentSession` is false even for the only session that is playing, so
 * nothing here filters on it; `currentSession` is taken at face value.
 *
 * There is no album art in the provider output, and no seek.
 */

import { readPx } from '../lib/css.js';
import { growWindowWhileOpen } from '../lib/window.js';

/** How fast the marquee travels. Long titles take longer, not look faster. */
const SCROLL_PX_PER_SEC = 45;

/** Blank run between the two copies, so the loop does not read as a stutter. */
const SCROLL_GAP = 40;

/** How often the panel redraws its own clock between provider emissions. */
const TICK_MS = 500;

/**
 * How long the session has to stay gone before the widget believes it.
 *
 * A track change is a real gap, not a handover: `currentSession` goes null for
 * about half a second between one song ending and the next arriving. Acting on
 * the first null would blink the widget out on every track and close the panel
 * under whoever had just pressed Next. Two seconds clears the gap while
 * stopping playback still feels immediate.
 */
const SESSION_GRACE_MS = 2000;

/**
 * Wires the widget into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .media button
 * @param {object} zebar      the zebar module (for currentWidget)
 * @returns {(output: object) => void}
 */
export function mountMedia(root, zebar) {
  const marquee = root.querySelector('.media__marquee');
  const track = root.querySelector('.media__track');
  const eqBars = [...root.querySelectorAll('.media__eq i')];

  const panel = document.querySelector(
    `#${root.getAttribute('popovertarget')}`,
  );
  const els = {
    title: panel.querySelector('.media-panel__title'),
    artist: panel.querySelector('.media-panel__artist'),
    elapsed: panel.querySelector('.media-panel__elapsed'),
    total: panel.querySelector('.media-panel__total'),
    toggle: panel.querySelector('[data-action="toggle"]'),
  };

  const widget = zebar.currentWidget();
  growWindowWhileOpen(panel, widget, { height: readPx('--media-window-h') });

  /** The live session and the output it came from, held for control clicks. */
  let session = null;
  let latest = null;
  let shownLabel = null;
  let shownPlaying = null;

  /**
   * The interpolation anchor: a position, and the moment it was taken.
   *
   * `reported` is kept apart from it on purpose. It is the last number the
   * provider actually said, and it exists so that a repeat of that number is
   * recognised as a repeat. Skipping a track anchors the clock at zero long
   * before the provider catches up, and without this the very next tick — still
   * carrying the old track's position, unchanged — would look like news and
   * drag the clock back.
   */
  let syncedAt = 0;
  let syncedPosition = 0;
  let reported = null;
  let ticker = null;
  let grace = null;

  panel.addEventListener('beforetoggle', event => {
    root.setAttribute('aria-expanded', String(event.newState === 'open'));
    // Nothing to animate while the panel is closed, so the clock only runs
    // while someone is looking at it.
    if (event.newState === 'open') {
      drawProgress();
      startTicker();
    } else {
      stopTicker();
    }
  });

  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !session) {
      return;
    }

    // The session is named explicitly rather than relying on the provider's
    // idea of which one is current — see the note about isCurrentSession.
    const options = { sessionId: session.sessionId };

    if (action === 'previous') {
      latest.previous(options);
      restartProgress();
    } else if (action === 'toggle') {
      latest.togglePlayPause(options);
    } else if (action === 'next') {
      latest.next(options);
      restartProgress();
    }
  });

  return function update({ media }) {
    latest = media;
    const incoming = media?.currentSession ?? null;

    if (!incoming) {
      // Hold what was on screen until the absence proves itself; see
      // SESSION_GRACE_MS. The old session stays in `session` meanwhile, so the
      // panel keeps its contents and its controls keep a sessionId to name.
      if (session && !grace) {
        grace = setTimeout(forgetSession, SESSION_GRACE_MS);
      }
      return;
    }

    clearTimeout(grace);
    grace = null;
    session = incoming;
    root.hidden = false;

    const label = [session.title, session.artist].filter(Boolean).join(' · ');
    if (label !== shownLabel) {
      shownLabel = label;
      setLabel(label);
      els.title.textContent = session.title ?? '';
      els.artist.textContent = session.artist ?? '';
      // A different track's position is news even if the number happens to
      // match what the last one was reading.
      reported = null;
    }

    const playbackChanged = session.isPlaying !== shownPlaying;
    if (playbackChanged) {
      shownPlaying = session.isPlaying;
      if (!session.isPlaying) {
        // Read where the bars actually are before the attribute below swaps
        // their animation out; after that the heights are gone and the settle
        // would start from the base value instead of from where they stood.
        for (const bar of eqBars) {
          bar.style.setProperty('--settle-from', renderedScaleY(bar));
        }
      }
      root.dataset.playing = String(session.isPlaying);
      // The panel is not a sibling of the button, so the state is mirrored
      // rather than reached for with a selector.
      panel.dataset.playing = String(session.isPlaying);
      els.toggle.setAttribute(
        'aria-label',
        session.isPlaying ? 'Pause' : 'Play',
      );
      // A pause has to stop the clock even with the panel open, and a resume
      // has to start it again.
      if (panel.matches(':popover-open')) {
        if (session.isPlaying) {
          startTicker();
        } else {
          stopTicker();
        }
      }
    }

    // A fresh fix on where playback is — but only when there is one. This runs
    // on every group tick, once a second, while the provider moves `position`
    // about once every eight; re-stamping the clock on every tick would reset
    // the extrapolation to a reading up to eight seconds stale. So: re-sync
    // when the number actually changes, or when playback starts or stops — a
    // resume reports the position it paused at, and the clock has to start
    // from now rather than from whenever that number first arrived.
    if (session.position !== reported || playbackChanged) {
      reported = session.position;
      syncedPosition = session.position;
      syncedAt = performance.now();
    }

    drawProgress();
  };

  /**
   * Skipping starts the track over, and the provider will not say so for up to
   * eight seconds. Anchor at zero now instead of letting the panel keep
   * counting on from where the last track was; whatever this gets wrong, the
   * next emission corrects. `reported` is deliberately left alone so the stale
   * readings that arrive in the meantime are ignored rather than believed.
   */
  function restartProgress() {
    syncedPosition = 0;
    syncedAt = performance.now();
    drawProgress();
  }

  /**
   * Writes the bar label, and decides whether it has to scroll.
   *
   * The text is measured after it is in the DOM rather than guessed: the only
   * honest way to know whether it overflows is to lay it out. When it does, a
   * second copy is appended and the pair slides by exactly one copy plus the
   * gap, which puts the second copy where the first began — the loop has no
   * seam to hide.
   */
  function setLabel(label) {
    track.textContent = label;
    marquee.querySelector('.media__track--copy')?.remove();
    root.classList.remove('is-scrolling');

    const overflow = track.scrollWidth - marquee.clientWidth;
    if (overflow <= 0) {
      return;
    }

    const copy = track.cloneNode(true);
    copy.classList.add('media__track--copy');
    copy.setAttribute('aria-hidden', 'true');
    marquee.append(copy);

    const shift = track.scrollWidth + SCROLL_GAP;
    root.style.setProperty('--media-shift', `${shift}px`);
    root.style.setProperty('--media-gap', `${SCROLL_GAP}px`);
    root.style.setProperty('--media-dur', `${shift / SCROLL_PX_PER_SEC}s`);
    root.classList.add('is-scrolling');
  }

  /** The session really is gone: put the widget away. */
  function forgetSession() {
    clearTimeout(grace);
    grace = null;
    session = null;
    root.hidden = true;
    if (panel.matches(':popover-open')) {
      panel.hidePopover();
    }
    stopTicker();
    shownLabel = null;
    shownPlaying = null;
  }

  function startTicker() {
    stopTicker();
    if (session?.isPlaying) {
      ticker = setInterval(drawProgress, TICK_MS);
    }
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  /** Where playback is now: the last fix plus however long ago that was. */
  function drawProgress() {
    if (!session) {
      return;
    }

    const total = session.endTime;
    const elapsed = session.isPlaying
      ? syncedPosition + (performance.now() - syncedAt) / 1000
      : syncedPosition;
    const shown = total > 0 ? Math.min(elapsed, total) : elapsed;

    els.elapsed.textContent = clock(shown);
    els.total.textContent = total > 0 ? clock(total) : '';
    // A track with no duration cannot have a proportion, so the bar goes away
    // rather than sitting at zero and looking stuck.
    panel.dataset.timed = String(total > 0);
    panel.style.setProperty(
      '--media-progress',
      total > 0 ? String(shown / total) : '0',
    );
  }
}

/**
 * The vertical scale an element is rendering right now, animation included.
 *
 * getComputedStyle resolves a transform to `matrix(a, b, c, d, e, f)`, where d
 * is the vertical scale; `none` means the element is at rest.
 */
function renderedScaleY(el) {
  const matrix = getComputedStyle(el).transform;
  return matrix === 'none' ? '1' : matrix.slice(7, -1).split(',')[3].trim();
}

/** Seconds as `m:ss`. */
function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
