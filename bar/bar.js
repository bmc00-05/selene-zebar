/**
 * selene-zebar — bar entry point.
 *
 * Everything visible lives in components/. This file does three things: group
 * the providers, mount each component, and hand every provider tick to all of
 * them. Adding a widget is a provider line and a mount line — nothing here
 * needs to know what any component reads.
 *
 * Buildless on purpose: Zebar serves this directory to WebView2 as-is, so a
 * save is a reload. `zebar` is pulled from esm.sh and held by the cache rule in
 * zpack.json (`caching.defaultDuration`), which is what keeps startup off the
 * network after the first run.
 */
import * as zebar from 'https://esm.sh/zebar@3.3';
import { applySettings } from './lib/settings.js';
import { mountWorkspaces } from './components/workspaces.js';
import { mountLayout } from './components/layout.js';
import { mountActiveWindow } from './components/active-window.js';
import { mountMinimized } from './components/minimized.js';
import { mountMenu } from './components/menu.js';
import { mountBattery } from './components/battery.js';
import { mountPower } from './components/power.js';
import { mountClock, CLOCK_FORMAT } from './components/clock.js';
import { mountCalendar } from './components/calendar.js';
import { mountMemory } from './components/memory.js';
import { mountMedia } from './components/media.js';
import { mountCava } from './components/cava.js';
import { mountVolume } from './components/volume.js';

// Before anything is mounted: the stylesheets hide every widget until the root
// element says which ones are on, so this is what makes the bar appear at all.
// Doing it first is also what keeps a widget that is switched off from being
// painted for a frame before it is taken away.
applySettings();

const providers = zebar.createProviderGroup({
  glazewm: { type: 'glazewm' },
  // A second, not the default, so plugging the charger in registers as
  // something that just happened rather than several seconds later.
  battery: { type: 'battery', refreshInterval: 1000 },
  date: { type: 'date', formatting: CLOCK_FORMAT },
  // Five seconds is also the default; stated so the interval is a decision in
  // the file rather than something inherited silently.
  memory: { type: 'memory', refreshInterval: 5000 },
  // No interval to set: MediaProviderConfig is `{ type: 'media' }` alone. It
  // emits about every eight seconds and immediately on play/pause.
  media: { type: 'media' },
  // Also no interval, and none is wanted: Windows pushes volume and mute
  // changes, and they arrive within two seconds of the system slider moving.
  audio: { type: 'audio' },
});

const offline = document.querySelector('#glazewm-offline');

/**
 * Each mount returns an update that takes the whole provider output and picks
 * out what it needs, including whether to show itself at all.
 */
const updates = [
  mountWorkspaces(document.querySelector('#workspaces'), zebar),
  mountMedia(document.querySelector('#media'), zebar),
  // After mountMedia, and on the same element: it decides whether to drive the
  // equaliser partly from whether the widget is on screen, which the line above
  // has just settled for this tick.
  mountCava(document.querySelector('#media'), zebar),
  mountActiveWindow(document.querySelector('#active-window'), zebar),
  mountMinimized(document.querySelector('#minimized'), zebar),
  mountMenu(document.querySelector('#bar-menu'), zebar),
  mountVolume(document.querySelector('#volume'), zebar),
  mountMemory(document.querySelector('#memory'), zebar),
  mountClock(document.querySelector('#clock'), zebar),
  mountCalendar(document.querySelector('#calendar'), zebar),
  mountBattery(document.querySelector('#battery'), zebar),
  mountLayout(document.querySelector('#layout')),
  mountPower(document.querySelector('#power'), zebar),
];

providers.onOutput(() => render(providers.outputMap));
render(providers.outputMap);

function render(output) {
  // Whether a provider is down is nobody's component to own, so it stays here.
  offline.hidden = Boolean(output.glazewm);

  for (const update of updates) {
    update(output);
  }
}
