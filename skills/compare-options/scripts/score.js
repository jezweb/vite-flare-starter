/**
 * Weighted option scoring — deterministic maths for the compare-options
 * skill, so ranking arithmetic never happens "in the model's head".
 *
 * Function-style skill script: runs in an isolated dynamic worker via the
 * agents-SDK runner (`run_skill_script` with this path). No network, no
 * bindings — pure computation on the input.
 *
 * Input (pass as JSON via stdin):
 * {
 *   "weights":  { "price": 3, "quality": 2, "support": 1 },
 *   "options": [
 *     { "name": "Option A", "scores": { "price": 7, "quality": 9, "support": 6 } },
 *     { "name": "Option B", "scores": { "price": 9, "quality": 6, "support": 8 } }
 *   ]
 * }
 *
 * Scores are 0-10 per criterion. Missing criteria score 0 and are listed
 * in `gaps` so the comparison can call them out rather than hide them.
 */
export default async function run(input) {
  const weights = input?.weights ?? {}
  const options = Array.isArray(input?.options) ? input.options : []
  const criteria = Object.keys(weights)
  if (criteria.length === 0 || options.length < 2) {
    return { error: 'Need `weights` (criterion → weight) and at least two `options`.' }
  }
  const totalWeight = criteria.reduce((sum, c) => sum + (Number(weights[c]) || 0), 0)

  const ranked = options
    .map((option) => {
      const scores = option?.scores ?? {}
      const gaps = criteria.filter((c) => typeof scores[c] !== 'number')
      const weighted = criteria.reduce(
        (sum, c) => sum + (Number(weights[c]) || 0) * (typeof scores[c] === 'number' ? scores[c] : 0),
        0
      )
      return {
        name: String(option?.name ?? 'unnamed'),
        weightedScore: Math.round((weighted / (totalWeight || 1)) * 100) / 100,
        gaps,
      }
    })
    .sort((a, b) => b.weightedScore - a.weightedScore)

  return {
    ranked,
    winner: ranked[0].name,
    margin: Math.round((ranked[0].weightedScore - ranked[1].weightedScore) * 100) / 100,
    note: 'weightedScore is the 0-10 weighted average; margin is winner minus runner-up.',
  }
}
