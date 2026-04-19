/**
 * Model selector
 *
 * Chooses which Claude model and max_tokens to use for a given Line Coach
 * request. Default is Haiku for speed and cost. Sonnet is reserved for
 * deliberative queries that benefit from multi-factor reasoning (full-roster
 * matchup analysis, strategic adjustments, archetype comparisons, etc.).
 *
 * The decision is purely a function of the intent signal set, so callers can
 * pre-compute it once and pass it into the API call.
 */

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

// Default token budgets. Live-game terse responses get a tighter cap to keep
// both latency and cost down.
const MAX_TOKENS = {
  terse: 512,
  default: 1024,
  deliberative: 2048,
};

/**
 * Keywords in focusArea or query text that imply deliberative reasoning.
 * Kept intentionally small - add only when evidence justifies it.
 */
const DELIBERATIVE_KEYWORDS = [
  'matchup',
  'full roster',
  'strategic',
  'strategy',
  'archetype',
  'film',
  'scouting',
  'end-of-game',
  'end of game',
  'late-game',
  'late game',
];

/**
 * Keywords implying the coach wants a short, push-style response.
 */
const TERSE_KEYWORDS = [
  'quick',
  'who should',
  'next sub',
  'one line',
  'tldr',
  'tl;dr',
  'brief',
];

/**
 * @param {Object} intent
 * @param {string} [intent.focusArea]
 * @param {string} [intent.query]
 * @returns {boolean}
 */
export function _isDeliberativeQuery(intent = {}) {
  const text = _joinSignals(intent);
  return DELIBERATIVE_KEYWORDS.some((k) => text.includes(k));
}

/**
 * @param {Object} intent
 * @param {string} [intent.focusArea]
 * @param {string} [intent.query]
 * @param {boolean} [intent.isLiveGame]
 * @returns {boolean}
 */
export function _isTerseIntent(intent = {}) {
  const text = _joinSignals(intent);
  if (TERSE_KEYWORDS.some((k) => text.includes(k))) return true;
  // Live-game proactive pushes should stay brief by default, even without
  // an explicit keyword signal.
  if (intent.isLiveGame && !intent.focusArea) return true;
  return false;
}

/**
 * Select { model, maxTokens } for a given intent.
 *
 * Precedence:
 *   1. Deliberative -> Sonnet, large budget.
 *   2. Terse        -> Haiku, small budget.
 *   3. Default      -> Haiku, default budget.
 *
 * @param {Object} intent
 */
export function _selectModel(intent = {}) {
  if (_isDeliberativeQuery(intent)) {
    return { model: SONNET, maxTokens: MAX_TOKENS.deliberative, tier: 'deliberative' };
  }
  if (_isTerseIntent(intent)) {
    return { model: HAIKU, maxTokens: MAX_TOKENS.terse, tier: 'terse' };
  }
  return { model: HAIKU, maxTokens: MAX_TOKENS.default, tier: 'default' };
}

/**
 * Public alias for _selectModel. Underscore-prefixed names are kept because
 * architecture v2 specifies them; the non-prefixed alias is friendlier to
 * call sites.
 */
export const selectModel = _selectModel;

/**
 * @private
 */
function _joinSignals(intent) {
  return [intent.focusArea, intent.query]
    .filter((s) => typeof s === 'string')
    .join(' ')
    .toLowerCase();
}

export default {
  _selectModel,
  _isDeliberativeQuery,
  _isTerseIntent,
  selectModel,
};
