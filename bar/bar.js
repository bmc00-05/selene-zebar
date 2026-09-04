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
import { mountWorkspaces } from './components/workspaces.js';
import { mountActiveWindow } from './components/active-window.js';
import { mountMenu } from './components/menu.js';
import { mountBattery } from './components/battery.js';
import { mountPower } from './components/power.js';
import { mountClock, CLOCK_FORMAT } from './components/clock.js';

const providers = zebar.createProviderGroup({
  glazewm: { type: 'glazewm' },
  battery: { type: 'battery' },
  date: { type: 'date', formatting: CLOCK_FORMAT },
});

const offline = document.querySelector('#glazewm-offline');

/**
 * Each mount returns an update that takes the whole provider output and picks
 * out what it needs, including whether to show itself at all.
 */
const updates = [
  mountWorkspaces(document.querySelector('#workspaces'), zebar),
  mountActiveWindow(document.querySelector('#active-window'), zebar),
  mountMenu(document.querySelector('#bar-menu'), zebar),
  mountClock(document.querySelector('#clock'), zebar),
  mountBattery(document.querySelector('#battery'), zebar),
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
