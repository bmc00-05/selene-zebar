/**
 * Reading design tokens back out of CSS.
 *
 * Numbers that both stylesheets and scripts care about live in tokens.css and
 * are read from there, rather than being written twice and drifting apart.
 */

/**
 * Reads a duration token off :root in milliseconds.
 *
 * CSS reports whatever unit the token was written in, so `600ms` and `0.6s`
 * both have to come back as 600.
 *
 * @param {string} name  custom property name, e.g. '--dur-base'
 * @returns {number} milliseconds
 */
export function readMs(name) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
}

/**
 * Reads a length token off :root in pixels.
 *
 * @param {string} name  custom property name, e.g. '--menu-window-h'
 * @returns {number} pixels
 */
export function readPx(name) {
  return parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
}

/**
 * Reads a unitless token off :root.
 *
 * Separate from readPx only in what it claims: these are ratios and counts, so
 * a caller reading one is not asking for pixels.
 *
 * @param {string} name  custom property name, e.g. '--media-eq-floor'
 * @returns {number}
 */
export function readNumber(name) {
  return parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
}
