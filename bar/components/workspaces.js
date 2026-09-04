/**
 * The workspace row: one indicator per GlazeWM workspace, in GlazeWM's order.
 *
 * The indicators carry no numbers. An inner dot says whether the workspace
 * holds windows and how close it is to the front; an outer ring and a halo say
 * which one is focused. workspaces.css has the full mapping.
 */

/**
 * Wires the row into `root` and returns the function that updates it.
 *
 * @param {HTMLElement} root  the .workspaces element
 * @returns {(output: object) => void}
 */
export function mountWorkspaces(root) {
  /** name -> the indicator element currently on screen for that workspace. */
  const indicators = new Map();

  return function update({ glazewm }) {
    root.hidden = !glazewm;

    if (!glazewm) {
      return;
    }

    render(glazewm);
  };

  /**
   * Reconciles the indicator list against the provider output by workspace
   * name.
   *
   * A wholesale re-render would restart every animation on each provider tick
   * (GlazeWM emits on focus changes, window moves, tiling changes), so
   * indicators are matched by key: survivors are updated in place, newcomers
   * animate in, and departures animate out before they are removed.
   */
  function render(glazewm) {
    const seen = new Set();

    glazewm.currentWorkspaces.forEach((workspace, index) => {
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
      const atIndex = root.children[index];
      if (atIndex !== indicator) {
        root.insertBefore(indicator, atIndex ?? null);
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
}

function createIndicator(workspace, glazewm) {
  const indicator = document.createElement('button');
  indicator.className = 'workspace';
  indicator.type = 'button';

  // The button itself is the outer ring; this is the dot inside it.
  const dot = document.createElement('span');
  dot.className = 'workspace__dot';

  // One halo layer per ring, so focus can fade it while its own inner layer
  // breathes. The two effects need separate elements: an animation and a
  // transition on the same opacity fight, and removing the animation on
  // unfocus takes the halo out in a single frame instead of fading it.
  indicator.append(halo(), dot);
  dot.append(halo());
  indicator.addEventListener('click', () =>
    glazewm.runCommand(`focus --workspace ${workspace.name}`),
  );

  return indicator;
}

/** An empty layer; workspaces.css gives it the shadow its parent calls for. */
function halo() {
  const el = document.createElement('span');
  el.className = 'workspace__halo';
  el.ariaHidden = 'true';
  return el;
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
