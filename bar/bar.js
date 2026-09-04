/**
 * selene-zebar — bar entry point.
 *
 * Buildless on purpose: Zebar serves this directory to WebView2 as-is, so a
 * save is a reload. `zebar` is pulled from esm.sh and held by the cache rule in
 * zpack.json (`caching.defaultDuration`), which is what keeps startup off the
 * network after the first run.
 */
import * as zebar from 'https://esm.sh/zebar@3.3';

const providers = zebar.createProviderGroup({
  glazewm: { type: 'glazewm' },
});

const els = {
  workspaces: document.querySelector('#workspaces'),
  offline: document.querySelector('#glazewm-offline'),
};

/** name -> the pill element currently on screen for that workspace. */
const pills = new Map();

providers.onOutput(() => render(providers.outputMap));
render(providers.outputMap);

function render({ glazewm }) {
  els.offline.hidden = Boolean(glazewm);
  els.workspaces.hidden = !glazewm;

  if (glazewm) {
    renderWorkspaces(glazewm);
  }
}

/**
 * Reconciles the pill list against the provider output by workspace name.
 *
 * A wholesale re-render would restart every animation on each provider tick
 * (GlazeWM emits on focus changes, window moves, tiling changes), so pills are
 * matched by key: survivors are updated in place, newcomers animate in, and
 * departures animate out before they are removed.
 */
function renderWorkspaces(glazewm) {
  const workspaces = glazewm.currentWorkspaces;
  const seen = new Set();

  workspaces.forEach((workspace, index) => {
    seen.add(workspace.name);

    let pill = pills.get(workspace.name);

    if (!pill) {
      pill = createPill(workspace, glazewm);
      pills.set(workspace.name, pill);
      pill.classList.add('is-entering');
      pill.addEventListener(
        'animationend',
        () => pill.classList.remove('is-entering'),
        { once: true },
      );
    }

    updatePill(pill, workspace);

    // Keep DOM order in sync with GlazeWM's ordering. Re-inserting an element
    // at the position it already holds is a no-op, so this does not restart
    // the enter animation.
    const atIndex = els.workspaces.children[index];
    if (atIndex !== pill) {
      els.workspaces.insertBefore(pill, atIndex ?? null);
    }
  });

  for (const [name, pill] of pills) {
    if (seen.has(name)) {
      continue;
    }

    pills.delete(name);
    pill.classList.add('is-leaving');
    pill.addEventListener('animationend', () => pill.remove(), { once: true });
  }
}

function createPill(workspace, glazewm) {
  const pill = document.createElement('button');
  pill.className = 'workspace';
  pill.type = 'button';

  const name = document.createElement('span');
  name.className = 'workspace__name';

  const label = document.createElement('span');
  label.className = 'workspace__label';
  label.append(document.createElement('span'));

  pill.append(name, label);
  pill.addEventListener('click', () =>
    glazewm.runCommand(`focus --workspace ${workspace.name}`),
  );

  return pill;
}

function updatePill(pill, workspace) {
  const name = workspace.name;
  const label = workspace.displayName ?? '';
  // A workspace with no windows reads as empty even while it is displayed.
  const isOccupied = workspace.children.length > 0;

  pill.classList.toggle('is-focused', workspace.hasFocus);
  pill.classList.toggle(
    'is-displayed',
    workspace.isDisplayed && !workspace.hasFocus,
  );
  pill.classList.toggle('is-occupied', isOccupied && !workspace.isDisplayed);
  pill.title = label || `Workspace ${name}`;

  const nameEl = pill.querySelector('.workspace__name');
  if (nameEl.textContent !== name) {
    nameEl.textContent = name;
  }

  // The label element stays in the DOM even when empty so the collapsed pill
  // keeps a stable box to animate from.
  const labelEl = pill.querySelector('.workspace__label > span');
  if (labelEl.textContent !== label) {
    labelEl.textContent = label;
  }
}
