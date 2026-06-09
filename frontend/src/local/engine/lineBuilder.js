const logger = { warn(){}, debug(){}, error(){}, info(){} };

/**
 * lineBuilder — trait-weighted line suggestions.
 *
 * Each "line role" below describes a concrete slot a coach fills during a
 * game (1st midi, ride line, man-up, etc.), declaring:
 *   - size            number of players the role needs
 *   - positions       eligible primary positions (null = any)
 *   - weights         per-skill weights (sums roughly to 1)
 *   - label / hint    human-readable strings for the UI
 *
 * The scorer multiplies an athlete's 1-10 skill rating by the role's weight,
 * then returns the top N along with the 2-3 skills that contributed most. We
 * surface that "why" so a new coach learns from each suggestion — it's the
 * explanation, not just the pick, that builds trust with coaches who've been
 * doing this by feel for years.
 *
 * Weights mirror the emphasis from knowledge-bases/lacrosse/positions.json
 * but are hand-tuned per role (e.g. a man-up line weights shooting and
 * field_awareness far above defense; a clear line weights passing and
 * field_awareness above shooting).
 */

const LINE_ROLES = {
  // ─── Standard (men's/women's field) ──────────────────────────────────────
  starting_attack: {
    label: 'Starting Attack',
    hint: 'Top 3 finishers — shooting, dodging, feeding.',
    size: 3,
    positions: ['Attack'],
    weights: {
      shooting: 0.28, dodging: 0.22, passing: 0.18, field_awareness: 0.15,
      ground_balls: 0.08, transition: 0.06, defense: 0.02, faceoff: 0.01,
    },
  },
  first_midi: {
    label: '1st Midi',
    hint: 'Two-way starters — transition + shooting + GBs.',
    size: 3,
    positions: ['Midfield'],
    weights: {
      transition: 0.20, shooting: 0.18, field_awareness: 0.15, ground_balls: 0.15,
      dodging: 0.12, passing: 0.10, defense: 0.08, faceoff: 0.02,
    },
  },
  second_midi: {
    label: '2nd Midi',
    hint: 'Rotation middies — keep the starters fresh.',
    size: 3,
    positions: ['Midfield'],
    weights: {
      transition: 0.20, field_awareness: 0.17, ground_balls: 0.17,
      passing: 0.12, dodging: 0.12, shooting: 0.10, defense: 0.10, faceoff: 0.02,
    },
  },
  defensive_midi: {
    label: 'Defensive Midi / LSM',
    hint: 'Shutdown midis — defense + GBs + clear.',
    size: 3,
    positions: ['Midfield', 'Defense'],
    weights: {
      defense: 0.28, ground_balls: 0.22, field_awareness: 0.18, transition: 0.14,
      passing: 0.10, dodging: 0.04, shooting: 0.02, faceoff: 0.02,
    },
  },
  starting_defense: {
    label: 'Starting Defense',
    hint: 'Top 3 close D — 1v1 defense, crease, outlets.',
    size: 3,
    positions: ['Defense'],
    weights: {
      defense: 0.30, field_awareness: 0.22, ground_balls: 0.18, transition: 0.12,
      passing: 0.10, dodging: 0.04, shooting: 0.02, faceoff: 0.02,
    },
  },
  man_up: {
    label: 'Man-Up (EMO)',
    hint: 'Power-play — shooters and feeders, high IQ.',
    size: 6,
    positions: ['Attack', 'Midfield'],
    weights: {
      shooting: 0.32, passing: 0.22, field_awareness: 0.22, dodging: 0.12,
      ground_balls: 0.06, transition: 0.04, defense: 0.01, faceoff: 0.01,
    },
  },
  man_down: {
    label: 'Man-Down',
    hint: 'Penalty kill — defense IQ, GBs, quick clears.',
    size: 5,
    positions: ['Defense', 'Midfield', 'Goalie'],
    weights: {
      defense: 0.32, field_awareness: 0.26, ground_balls: 0.18, passing: 0.10,
      transition: 0.10, dodging: 0.02, shooting: 0.01, faceoff: 0.01,
    },
  },
  ride: {
    label: 'Ride Line',
    hint: 'Attackers who chase — stop the clear.',
    size: 3,
    positions: ['Attack', 'Midfield'],
    weights: {
      defense: 0.26, field_awareness: 0.22, ground_balls: 0.22, transition: 0.14,
      dodging: 0.08, passing: 0.04, shooting: 0.02, faceoff: 0.02,
    },
  },
  clear: {
    label: 'Clear Unit',
    hint: 'Best ball-movers to break pressure out of your end.',
    size: 4,
    positions: ['Defense', 'Midfield', 'Goalie'],
    weights: {
      passing: 0.26, field_awareness: 0.22, transition: 0.22, ground_balls: 0.14,
      defense: 0.10, dodging: 0.04, shooting: 0.01, faceoff: 0.01,
    },
  },
  faceoff_wing: {
    label: 'Faceoff Wing',
    hint: 'Wings on the faceoff — GBs and hustle.',
    size: 2,
    positions: ['Midfield', 'Defense'],
    weights: {
      ground_balls: 0.40, transition: 0.22, field_awareness: 0.18, defense: 0.10,
      passing: 0.06, dodging: 0.02, shooting: 0.01, faceoff: 0.01,
    },
  },

  // ─── 6s (sixes) ──────────────────────────────────────────────────────────
  starting_six: {
    label: 'Starting Six',
    hint: 'Best all-around six — shooting, dodging, transition.',
    size: 6,
    positions: ['Attack', 'Midfield', 'Defense'],
    format: '6s',
    weights: {
      shooting: 0.22, dodging: 0.18, transition: 0.18, field_awareness: 0.16,
      defense: 0.10, passing: 0.08, ground_balls: 0.08, faceoff: 0.00,
    },
  },
  six_power_play: {
    label: '6s Power Play',
    hint: 'Sixes man-up — shooters first.',
    size: 6,
    positions: ['Attack', 'Midfield'],
    format: '6s',
    weights: {
      shooting: 0.35, passing: 0.22, field_awareness: 0.20, dodging: 0.15,
      transition: 0.06, ground_balls: 0.02, defense: 0.00, faceoff: 0.00,
    },
  },
  six_ride: {
    label: '6s Ride',
    hint: 'Transition defenders — stop the fast break.',
    size: 6,
    positions: ['Midfield', 'Defense', 'Attack'],
    format: '6s',
    weights: {
      defense: 0.28, transition: 0.22, field_awareness: 0.20, ground_balls: 0.14,
      passing: 0.08, dodging: 0.06, shooting: 0.02, faceoff: 0.00,
    },
  },
};

const SKILL_COLUMN = {
  shooting:        'skill_shooting',
  dodging:         'skill_dodging',
  passing:         'skill_passing',
  field_awareness: 'skill_field_awareness',
  ground_balls:    'skill_ground_balls',
  transition:      'skill_transition',
  defense:         'skill_defense',
  faceoff:         'skill_faceoff',
};

const SKILL_LABEL = {
  shooting:        'Shooting',
  dodging:         'Dodging',
  passing:         'Passing',
  field_awareness: 'Field IQ',
  ground_balls:    'Ground Balls',
  transition:      'Transition',
  defense:         'Defense',
  faceoff:         'Faceoff',
};

/**
 * Read an athlete's rating for a given skill, handling both the DB-shaped
 * athlete (skill_shooting, …) and the normalized shape the older
 * positionEngine produces (shooting, dodging, …). Missing ratings default to
 * 0 so unrated players fall to the bottom rather than being excluded.
 */
function readSkill(athlete, skill) {
  if (!athlete) return 0;
  const col = SKILL_COLUMN[skill];
  const v = athlete[col] ?? athlete[skill] ?? athlete[`rating_${skill}`];
  return typeof v === 'number' ? v : (v == null ? 0 : Number(v) || 0);
}

/**
 * Score one athlete for one role and return the score plus the top skill
 * contributions (for the "why").
 */
function scoreAthlete(athlete, role) {
  let total = 0;
  const contributions = [];
  for (const [skill, weight] of Object.entries(role.weights)) {
    const rating = readSkill(athlete, skill);
    const contribution = rating * weight;
    total += contribution;
    contributions.push({ skill, rating, weight, contribution });
  }
  // Top three skills this athlete brings to this role
  contributions.sort((a, b) => b.contribution - a.contribution);
  const topSkills = contributions.slice(0, 3).map(c => ({
    skill: c.skill,
    label: SKILL_LABEL[c.skill] || c.skill,
    rating: c.rating,
  }));
  return { total, topSkills };
}

/**
 * Generate line suggestions for a given role.
 *
 * @param {Array}  roster   team roster (athletes with skill_* columns)
 * @param {string} roleKey  one of LINE_ROLES
 * @param {Object} opts
 * @param {Array<string>} opts.excludeIds  athlete ids to exclude (injured / sat)
 * @returns {Object} { role, starters, alternates }
 */
export function suggestLine(roster, roleKey, opts = {}) {
  const role = LINE_ROLES[roleKey];
  if (!role) throw new Error(`Unknown line role: ${roleKey}`);

  const excludeIds = new Set((opts.excludeIds || []).map(String));

  const eligible = roster.filter(a => {
    if (excludeIds.has(String(a.id))) return false;
    if (a.status && a.status !== 'active') return false;
    if (!role.positions) return true;
    // Match on primary OR secondary — a Midfielder who also plays Defense
    // should show up on Defense suggestions, just with a note.
    return role.positions.includes(a.primary_position)
        || role.positions.includes(a.secondary_position);
  });

  const scored = eligible.map(a => {
    const { total, topSkills } = scoreAthlete(a, role);
    const offPosition = role.positions
      && !role.positions.includes(a.primary_position)
      && role.positions.includes(a.secondary_position);
    return {
      athleteId: a.id,
      jersey_number: a.jersey_number,
      first_name: a.first_name,
      last_name: a.last_name,
      primary_position: a.primary_position,
      secondary_position: a.secondary_position,
      score: Math.round(total * 10) / 10,
      topSkills,
      offPosition,
      why: buildWhy(topSkills, offPosition, a),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    role: {
      key: roleKey,
      label: role.label,
      hint: role.hint,
      size: role.size,
      positions: role.positions,
      format: role.format || 'standard',
    },
    starters:   scored.slice(0, role.size),
    alternates: scored.slice(role.size, role.size + 3),
    totalEligible: scored.length,
  };
}

/**
 * Short human-readable rationale string, e.g. "Shooting 9, Passing 8 —
 * top of lineup for this role." We stick to two skills + context so the
 * coach can scan a suggestion in under a second.
 */
function buildWhy(topSkills, offPosition, athlete) {
  const withRating = topSkills
    .filter(s => s.rating > 0)
    .slice(0, 2)
    .map(s => `${s.label} ${s.rating}`);

  if (withRating.length === 0) {
    return `No ratings yet — add skills on ${athlete.first_name}'s profile for a ranked suggestion.`;
  }

  const base = withRating.join(', ');
  if (offPosition) {
    return `${base} — listed off-position (secondary: ${athlete.secondary_position}).`;
  }
  return base;
}

/**
 * List available line roles, optionally filtered by format. Lets the UI
 * render a role picker without hard-coding the taxonomy.
 */
export function listLineRoles({ format = 'standard' } = {}) {
  return Object.entries(LINE_ROLES)
    .filter(([, role]) => {
      if (format === '6s')       return role.format === '6s';
      if (format === 'standard') return !role.format || role.format === 'standard';
      return true;
    })
    .map(([key, role]) => ({
      key,
      label: role.label,
      hint: role.hint,
      size: role.size,
      positions: role.positions,
      format: role.format || 'standard',
    }));
}

export const __internals = { LINE_ROLES, readSkill, scoreAthlete };
