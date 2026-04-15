import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let positionsKnowledge = null;

/**
 * Load position archetypes from knowledge base
 * @private
 */
function _loadPositionsKnowledge() {
  if (positionsKnowledge) return positionsKnowledge;

  try {
    const positionsPath = path.join(
      __dirname,
      '../knowledge-bases/lacrosse/positions.json'
    );
    const content = fs.readFileSync(positionsPath, 'utf-8');
    positionsKnowledge = JSON.parse(content);
    logger.info('Loaded lacrosse positions knowledge base');
    return positionsKnowledge;
  } catch (err) {
    logger.error('Error loading positions knowledge:', err);
    return null;
  }
}

/**
 * Calculate skill fit score for athlete in a position
 * Uses weighted skill importance from position archetype
 *
 * @param {Object} athlete - Athlete with skill ratings (1-10)
 * @param {string} position - Position name (Attack, Midfield, Defense, Goalie, FOGO)
 * @param {string} format - Game format (standard or 6s)
 * @returns {number} Fit score 0-100
 */
export function calculatePositionFit(athlete, position, format = 'standard') {
  const knowledge = _loadPositionsKnowledge();
  if (!knowledge || !knowledge.positions[position]) {
    logger.warn(`Unknown position: ${position}`);
    return 0;
  }

  let positionArchetype = knowledge.positions[position];

  // For 6s, apply weight modifiers if position has them
  if (format === '6s' && knowledge['6s_adjustments']?.weight_modifiers?.[position]) {
    // Create modified archetype with 6s weights
    const baseArchetype = { ...positionArchetype };
    const sixsWeights = knowledge['6s_adjustments'].weight_modifiers[position];

    // Recalculate ideal profile based on 6s weights
    const modifiedIdeal = {};
    for (const [skill, weight] of Object.entries(sixsWeights)) {
      // Scale ideal rating based on weight importance
      const baseIdeal = baseArchetype.ideal_profile?.[skill] || 5;
      modifiedIdeal[skill] = Math.round(baseIdeal * (weight + 0.3)); // Boost based on weight
    }
    positionArchetype = {
      ...baseArchetype,
      ideal_profile: modifiedIdeal,
      key_skills: sixsWeights,
    };
  }

  // Calculate weighted fit
  let totalScore = 0;
  let totalWeight = 0;

  const skills = positionArchetype.key_skills || {};
  for (const [skill, weight] of Object.entries(skills)) {
    const athleteRating = athlete[skill] || athlete[`rating_${skill}`] || 0;
    const idealRating = positionArchetype.ideal_profile?.[skill] || 5;

    // Score: perfect match = 10 points * weight
    const skillScore = 10 * (1 - Math.abs(athleteRating - idealRating) / 10);
    totalScore += skillScore * weight;
    totalWeight += weight;
  }

  // Normalize to 0-100
  const fitScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  return Math.round(fitScore);
}

/**
 * Get position recommendations for an athlete
 * Returns ranked list of positions with fit analysis
 *
 * @param {Object} athlete - Athlete object
 * @param {string} format - Game format (standard or 6s)
 * @returns {Object} Position recommendations with analysis
 */
export function getPositionRecommendations(athlete, format = 'standard') {
  const knowledge = _loadPositionsKnowledge();
  if (!knowledge) {
    return { error: 'Position knowledge base not loaded' };
  }

  const positions =
    format === '6s'
      ? Object.keys(knowledge.positions).filter(
          (p) => p !== knowledge['6s_adjustments']?.position_elimination
        )
      : Object.keys(knowledge.positions);

  // Score each position
  const scores = positions.map((position) => ({
    position,
    fitScore: calculatePositionFit(athlete, position, format),
    archetype: knowledge.positions[position],
  }));

  // Sort by fit score
  scores.sort((a, b) => b.fitScore - a.fitScore);

  // Analyze top recommendations
  const primary = scores[0];
  const secondary = scores[1];

  return {
    athleteId: athlete.id,
    athleteName: athlete.name,
    format,
    recommendations: {
      primary: {
        position: primary.position,
        fitScore: primary.fitScore,
        rationale: _generateFitRationale(athlete, primary.position, knowledge),
      },
      secondary: secondary
        ? {
            position: secondary.position,
            fitScore: secondary.fitScore,
            rationale: _generateFitRationale(athlete, secondary.position, knowledge),
          }
        : null,
      allScores: scores.map((s) => ({ position: s.position, fitScore: s.fitScore })),
    },
    athleteStrengths: _getAthleteStrengths(athlete),
    developmentAreas: _getDevelopmentAreas(athlete),
  };
}

/**
 * Compare athlete's skill profile to position ideal
 * @private
 */
function _generateFitRationale(athlete, position, knowledge) {
  const archetype = knowledge.positions[position];
  const athleteSkills = [];
  const idealSkills = [];

  for (const skill of Object.keys(archetype.ideal_profile)) {
    const athleteRating = athlete[skill] || 0;
    const idealRating = archetype.ideal_profile[skill];

    if (athleteRating >= idealRating - 1) {
      athleteSkills.push(`${skill} (${athleteRating}/${idealRating})`);
    } else {
      idealSkills.push(`${skill} (${athleteRating}/${idealRating})`);
    }
  }

  let rationale = `${position} position emphasizes ${archetype.position_focus}. `;
  if (athleteSkills.length > 0) {
    rationale += `Strengths: ${athleteSkills.join(', ')}. `;
  }
  if (idealSkills.length > 0) {
    rationale += `Development areas: ${idealSkills.join(', ')}.`;
  }

  return rationale;
}

/**
 * Identify athlete's strongest skills
 * @private
 */
function _getAthleteStrengths(athlete) {
  const skills = [
    'shooting',
    'dodging',
    'passing',
    'field_awareness',
    'ground_balls',
    'transition',
    'defense',
    'faceoff',
  ];

  const skillScores = skills
    .map((skill) => ({
      skill,
      rating: athlete[skill] || athlete[`rating_${skill}`] || 0,
    }))
    .filter((s) => s.rating >= 7)
    .sort((a, b) => b.rating - a.rating);

  return skillScores.map((s) => `${s.skill} (${s.rating})`);
}

/**
 * Identify athlete's development areas
 * @private
 */
function _getDevelopmentAreas(athlete) {
  const skills = [
    'shooting',
    'dodging',
    'passing',
    'field_awareness',
    'ground_balls',
    'transition',
    'defense',
    'faceoff',
  ];

  const skillScores = skills
    .map((skill) => ({
      skill,
      rating: athlete[skill] || athlete[`rating_${skill}`] || 0,
    }))
    .filter((s) => s.rating <= 5)
    .sort((a, b) => a.rating - b.rating);

  return skillScores.map((s) => `${s.skill} (${s.rating})`);
}

/**
 * Get benchmark stats for a position
 * Returns NCAA D3 benchmarks for reference
 *
 * @param {string} position - Position name
 * @returns {Object} Benchmark statistics
 */
export function getPositionBenchmarks(position) {
  const knowledge = _loadPositionsKnowledge();
  if (!knowledge || !knowledge.positions[position]) {
    return null;
  }

  return knowledge.positions[position].ncaa_d3_benchmark;
}

export default {
  calculatePositionFit,
  getPositionRecommendations,
  getPositionBenchmarks,
};
