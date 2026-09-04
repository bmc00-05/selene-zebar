/**
 * selene-zebar — bar entry point.
 *
 * Buildless on purpose: Zebar serves this directory to WebView2 as-is, so a
 * save is a reload. `zebar` is pulled from esm.sh and held by the cache rule in
 * zpack.json (`caching.defaultDuration`), which is what keeps startup off the
 * network after the first run.
 */
import * as zebar from 'https://esm.sh/zebar@3.3';
import { mountActiveWindow } from './components/active-window.js';

const providers = zebar.createProviderGroup({
  glazewm: { type: 'glazewm' },
});

const els = {
  workspaces: document.querySelector('#workspaces'),
  offline: document.querySelector('#glazewm-offline'),
  brand: document.querySelector('.brand'),
  menu: document.querySelector('#bar-menu'),
};

const updateActiveWindow = mountActiveWindow(
  document.querySelector('#active-window'),
  zebar,
);

/** name -> the indicator element currently on screen for that workspace. */
const indicators = new Map();

/** Latest provider output, so menu actions can reach glazewm. */
let latest = providers.outputMap;

providers.onOutput(() => {
  latest = providers.outputMap;
  render(latest);
});
render(latest);

setUpMenu();

function render({ glazewm }) {
  els.offline.hidden = Boolean(glazewm);
  els.workspaces.hidden = !glazewm;

  if (glazewm) {
    renderWorkspaces(glazewm);
  }

  updateActiveWindow(glazewm?.focusedContainer ?? null);
}

/**
 * Reconciles the indicator list against the provider output by workspace name.
 *
 * A wholesale re-render would restart every animation on each provider tick
 * (GlazeWM emits on focus changes, window moves, tiling changes), so indicators
 * are matched by key: survivors are updated in place, newcomers animate in, and
 * departures animate out before they are removed.
 */
function renderWorkspaces(glazewm) {
  const workspaces = glazewm.currentWorkspaces;
  const seen = new Set();

  workspaces.forEach((workspace, index) => {
    seen.add(workspace.name);

    let indicator = indicators.get(workspace.name);

    if (!indicator) {
      indicator = createIndicator(workspace, glazewm);
      indicators.set(workspace.name, indicator);
      indicator.classList.add('is-entering');
      indicator.addEventListener(
        'animationend',
        () => indicator.classList.remove('is-entering'),
        { once: true },
      );
    }

    updateIndicator(indicator, workspace);

    // Keep DOM order in sync with GlazeWM's ordering. Re-inserting an element
    // at the position it already holds is a no-op, so this does not restart
    // the enter animation.
    const atIndex = els.workspaces.children[index];
    if (atIndex !== indicator) {
      els.workspaces.insertBefore(indicator, atIndex ?? null);
    }
  });

  for (const [name, indicator] of indicators) {
    if (seen.has(name)) {
      continue;
    }

    indicators.delete(name);
    indicator.classList.add('is-leaving');
    indicator.addEventListener('animationend', () => indicator.remove(), {
      once: true,
    });
  }
}

function createIndicator(workspace, glazewm) {
  const indicator = document.createElement('button');
  indicator.className = 'workspace';
  indicator.type = 'button';

  // The button itself is the outer ring; this is the dot inside it.
  const dot = document.createElement('span');
  dot.className = 'workspace__dot';

  indicator.append(dot);
  indicator.addEventListener('click', () =>
    glazewm.runCommand(`focus --workspace ${workspace.name}`),
  );

  return indicator;
}

function updateIndicator(indicator, workspace) {
  // A workspace with no windows reads as empty even while it is displayed.
  const isOccupied = workspace.children.length > 0;

  indicator.classList.toggle('is-focused', workspace.hasFocus);
  indicator.classList.toggle(
    'is-displayed',
    workspace.isDisplayed && !workspace.hasFocus,
  );
  indicator.classList.toggle(
    'is-occupied',
    isOccupied && !workspace.isDisplayed,
  );

  // Nothing on screen names the workspace any more, so the tooltip is the only
  // way to tell which is which beyond position.
  indicator.title = workspace.displayName || `Workspace ${workspace.name}`;
}

/* --- The menu behind the mark -------------------------------------------- */

/**
 * Opening and closing is the browser's job — the popover attributes in
 * index.html handle the top layer, outside clicks and Escape. What is left here
 * is the part only Zebar can do: the panel would be clipped at the edge of a
 * 40px-tall window, so the window grows while the menu is open.
 *
 * Growing it is safe. The strip GlazeWM keeps clear comes from the preset in
 * zpack.json, not from the live window, so nothing on the desktop shifts —
 * measured before and after: workspace y=55 h=1020 either way.
 */
function setUpMenu() {
  const widget = zebar.currentWidget();
  const openHeight = readPx('--menu-window-h');
  const barHeight = window.innerHeight;

  const resize = height =>
    widget.tauriWindow.setSize({
      type: 'Logical',
      width: window.innerWidth,
      height,
    });

  // beforetoggle, not toggle: the window has to be tall enough before the panel
  // is painted, or the first frame shows it cut off.
  els.menu.addEventListener('beforetoggle', event => {
    const isOpening = event.newState === 'open';
    els.brand.setAttribute('aria-expanded', String(isOpening));
    resize(isOpening ? openHeight : barHeight);
  });

  // Light dismiss only covers clicks this window receives. Clicking another
  // application never reaches the page, so the menu would sit there open.
  widget.tauriWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      els.menu.hidePopover();
    }
  });

  els.menu.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;

    if (action === 'reload-bar') {
      location.reload();
    } else if (action === 'reload-glazewm') {
      latest.glazewm?.runCommand('wm-reload-config');
    } else if (action === 'close-bar') {
      widget.close();
    }

    if (action) {
      els.menu.hidePopover();
    }
  });
}

/** Reads a length token off :root so the number stays in tokens.css. */
function readPx(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    name,
  );
  return parseFloat(value);
}
