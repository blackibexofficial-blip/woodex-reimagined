/**
 * Deployment policy is server-side only. Unset preserves the old behavior;
 * every invalid explicit value fails closed rather than silently downgrading.
 * @param {string | undefined} rawMode
 * @param {string | undefined} secret
 * @returns {{ok:true, mode:'legacy'|'strict'} | {ok:false}}
 */
export function resolveIntakePolicy(rawMode, secret) {
  const mode = rawMode === undefined ? 'legacy' : rawMode;
  if (mode !== 'legacy' && mode !== 'strict') return {ok:false};
  if (mode === 'strict' && (typeof secret !== 'string' || !secret.trim())) return {ok:false};
  return {ok:true,mode};
}

/** @param {unknown} value */
export function isValidLeadHitCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
