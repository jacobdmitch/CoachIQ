import { query } from './database.js';
import logger from './logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// DRILL LIBRARY CACHE
// ============================================================================

let drillLibraryCache = null;

/**
 * Read and cache the drill library from the JSON file
 * Called on first use and subsequent requests return cached data
 */
async function loadDrillLibrary() {
  if (drillLibraryCache) {
    return drillLibraryCache;
  }

  try {
    const drillsPath = join(__dirname, '../knowledge-bases/lacrosse/drills.json');
    const drillsContent = readFileSync(drillsPath, 'utf8');
    const drillsData = JSON.parse(drillsContent);
    drillLibraryCache = drillsData.drills || [];
    logger.info(`Loaded ${drillLibraryCache.length} drills from knowledge base`);
    return drillLibraryCache;
  } catch (err) {
    logger.error('Error loading drill library:', err);
    return [];
  }
}

/**
 * Get all drills from the cached library
 */
export async function getDrillLibrary() {
  const drills = await loadDrillLibrary();
  return drills;
}

/**
 * Get a single drill by ID from the cached library
 */
export async function getDrillById(drillId) {
  const drills = await loadDrillLibrary();
  return drills.find((d) => d.id === drillId) || null;
}

// ============================================================================
// PRACTICE SESSION QUERIES
// ============================================================================

/**
 * List practice sessions for a team with pagination
 * Validates that the coach owns the team
 */
export async function listSessions(coachId, teamId, options = {}) {
  const { limit = 20, offset = 0 } = options;

  try {
    // Verify coach owns the team
    const teamCheck = await query(
      'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
      [teamId, coachId]
    );

    if (teamCheck.rows.length === 0) {
      throw new Error('Team not found or unauthorized');
    }

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM practice_sessions WHERE team_id = $1',
      [teamId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated sessions (most recent first)
    const result = await query(
      `SELECT id, team_id, practice_date, drill_blocks, focus_tags, notes, created_at, updated_at
       FROM practice_sessions
       WHERE team_id = $1
       ORDER BY practice_date DESC
       LIMIT $2 OFFSET $3`,
      [teamId, limit, offset]
    );

    const sessions = result.rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      practiceDate: row.practice_date,
      drillBlocks: row.drill_blocks || [],
      focusTags: row.focus_tags || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      sessions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  } catch (err) {
    logger.error('Error listing practice sessions:', err);
    throw err;
  }
}

/**
 * Get a single practice session
 * Validates ownership before returning
 */
export async function getSession(sessionId, coachId) {
  try {
    const result = await query(
      `SELECT ps.id, ps.team_id, ps.practice_date, ps.drill_blocks, ps.focus_tags, ps.notes, ps.created_at, ps.updated_at
       FROM practice_sessions ps
       JOIN teams t ON ps.team_id = t.id
       WHERE ps.id = $1 AND t.coach_id = $2`,
      [sessionId, coachId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      teamId: row.team_id,
      practiceDate: row.practice_date,
      drillBlocks: row.drill_blocks || [],
      focusTags: row.focus_tags || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    logger.error('Error retrieving practice session:', err);
    throw err;
  }
}

/**
 * Create a new practice session
 * Validates drill_blocks structure
 */
export async function createSession(coachId, data) {
  const { team_id, practice_date, drill_blocks, focus_tags, notes } = data;

  try {
    // Verify coach owns the team
    const teamCheck = await query(
      'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
      [team_id, coachId]
    );

    if (teamCheck.rows.length === 0) {
      throw new Error('Team not found or unauthorized');
    }

    // Validate drill_blocks is an array
    if (!Array.isArray(drill_blocks)) {
      throw new Error('drill_blocks must be an array');
    }

    const result = await query(
      `INSERT INTO practice_sessions (team_id, practice_date, drill_blocks, focus_tags, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, team_id, practice_date, drill_blocks, focus_tags, notes, created_at, updated_at`,
      [team_id, practice_date, JSON.stringify(drill_blocks), focus_tags || [], notes || '']
    );

    const row = result.rows[0];
    return {
      id: row.id,
      teamId: row.team_id,
      practiceDate: row.practice_date,
      drillBlocks: row.drill_blocks || [],
      focusTags: row.focus_tags || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    logger.error('Error creating practice session:', err);
    throw err;
  }
}

/**
 * Update a practice session
 * Validates ownership
 */
export async function updateSession(sessionId, coachId, data) {
  const { practice_date, drill_blocks, focus_tags, notes } = data;

  try {
    // Verify coach owns the session
    const sessionCheck = await query(
      `SELECT ps.id FROM practice_sessions ps
       JOIN teams t ON ps.team_id = t.id
       WHERE ps.id = $1 AND t.coach_id = $2`,
      [sessionId, coachId]
    );

    if (sessionCheck.rows.length === 0) {
      return null;
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (practice_date !== undefined) {
      updates.push(`practice_date = $${paramCount}`);
      values.push(practice_date);
      paramCount++;
    }

    if (drill_blocks !== undefined) {
      if (!Array.isArray(drill_blocks)) {
        throw new Error('drill_blocks must be an array');
      }
      updates.push(`drill_blocks = $${paramCount}`);
      values.push(JSON.stringify(drill_blocks));
      paramCount++;
    }

    if (focus_tags !== undefined) {
      updates.push(`focus_tags = $${paramCount}`);
      values.push(focus_tags);
      paramCount++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
      paramCount++;
    }

    if (updates.length === 0) {
      // No updates provided, return current session
      return getSession(sessionId, coachId);
    }

    values.push(sessionId);

    const result = await query(
      `UPDATE practice_sessions
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, team_id, practice_date, drill_blocks, focus_tags, notes, created_at, updated_at`,
      values
    );

    const row = result.rows[0];
    return {
      id: row.id,
      teamId: row.team_id,
      practiceDate: row.practice_date,
      drillBlocks: row.drill_blocks || [],
      focusTags: row.focus_tags || [],
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    logger.error('Error updating practice session:', err);
    throw err;
  }
}

/**
 * Delete a practice session
 * Validates ownership
 */
export async function deleteSession(sessionId, coachId) {
  try {
    // Verify coach owns the session
    const sessionCheck = await query(
      `SELECT ps.id FROM practice_sessions ps
       JOIN teams t ON ps.team_id = t.id
       WHERE ps.id = $1 AND t.coach_id = $2`,
      [sessionId, coachId]
    );

    if (sessionCheck.rows.length === 0) {
      return false;
    }

    await query('DELETE FROM practice_sessions WHERE id = $1', [sessionId]);
    return true;
  } catch (err) {
    logger.error('Error deleting practice session:', err);
    throw err;
  }
}

// ============================================================================
// PRACTICE GAP ANALYSIS
// ============================================================================

/**
 * Get practice gap analysis for a team
 * Identifies skills not drilled in the last 14 days
 * Returns recommended drills to address the gaps
 * Purely algorithmic - no Claude call
 */
export async function getPracticeGapAnalysis(teamId, coachId) {
  try {
    // Verify coach owns the team
    const teamCheck = await query(
      'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
      [teamId, coachId]
    );

    if (teamCheck.rows.length === 0) {
      throw new Error('Team not found or unauthorized');
    }

    // 8 core skills to track
    const coreSkills = [
      'ground_balls',
      'dodging',
      'shooting',
      'passing',
      'defense',
      'faceoff',
      'transition',
      'field_awareness',
    ];

    // Get all practice sessions from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const formattedDate = thirtyDaysAgo.toISOString().split('T')[0];

    const sessionsResult = await query(
      `SELECT drill_blocks FROM practice_sessions
       WHERE team_id = $1 AND practice_date >= $2
       ORDER BY practice_date DESC`,
      [teamId, formattedDate]
    );

    // Extract all skill_tags from drill_blocks in the last 30 days
    const drilledSkillsLast30Days = new Set();
    sessionsResult.rows.forEach((row) => {
      const blocks = row.drill_blocks || [];
      blocks.forEach((block) => {
        const tags = block.skill_tags || [];
        tags.forEach((tag) => {
          drilledSkillsLast30Days.add(tag);
        });
      });
    });

    // Get sessions from the last 14 days to check for staleness
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const formattedDate14 = fourteenDaysAgo.toISOString().split('T')[0];

    const recentSessionsResult = await query(
      `SELECT practice_date, drill_blocks FROM practice_sessions
       WHERE team_id = $1 AND practice_date >= $2
       ORDER BY practice_date DESC`,
      [teamId, formattedDate14]
    );

    const drilledSkillsLast14Days = new Set();
    const lastDrilledDate = {};

    // Track when each skill was last drilled
    sessionsResult.rows.forEach((row) => {
      const blocks = row.drill_blocks || [];
      blocks.forEach((block) => {
        const tags = block.skill_tags || [];
        tags.forEach((tag) => {
          if (!lastDrilledDate[tag]) {
            lastDrilledDate[tag] = row.practice_date;
          }
        });
      });
    });

    // Check which were drilled in last 14 days
    recentSessionsResult.rows.forEach((row) => {
      const blocks = row.drill_blocks || [];
      blocks.forEach((block) => {
        const tags = block.skill_tags || [];
        tags.forEach((tag) => {
          drilledSkillsLast14Days.add(tag);
        });
      });
    });

    // Identify stalled skills (not drilled in last 14 days but were in last 30)
    const stalledSkills = coreSkills.filter(
      (skill) =>
        drilledSkillsLast30Days.has(skill) &&
        !drilledSkillsLast14Days.has(skill)
    );

    // Identify never-drilled skills (never seen in last 30 days)
    const neverDrilledSkills = coreSkills.filter(
      (skill) => !drilledSkillsLast30Days.has(skill)
    );

    // Get drill library
    const drillLibrary = await getDrillLibrary();

    // Build recommendations
    const recommendations = [];

    // Recommend drills for stalled skills
    stalledSkills.forEach((skill) => {
      const matchingDrills = drillLibrary.filter((drill) =>
        (drill.skill_tags || []).includes(skill)
      );

      const topDrills = matchingDrills.slice(0, 3);
      topDrills.forEach((drill) => {
        recommendations.push({
          drillId: drill.id,
          drillName: drill.name,
          category: drill.category,
          skill: skill,
          reason: `${skill} not practiced in 14+ days`,
          durationMinutes: drill.duration_minutes,
          difficulty: drill.difficulty,
        });
      });
    });

    // Recommend drills for never-drilled skills (if any)
    neverDrilledSkills.forEach((skill) => {
      const matchingDrills = drillLibrary.filter((drill) =>
        (drill.skill_tags || []).includes(skill)
      );

      const topDrills = matchingDrills.slice(0, 2);
      topDrills.forEach((drill) => {
        recommendations.push({
          drillId: drill.id,
          drillName: drill.name,
          category: drill.category,
          skill: skill,
          reason: `${skill} never drilled in the last 30 days`,
          durationMinutes: drill.duration_minutes,
          difficulty: drill.difficulty,
        });
      });
    });

    // Get recently practiced skills
    const recentlyPracticedSkills = Array.from(drilledSkillsLast14Days).filter(
      (skill) => coreSkills.includes(skill)
    );

    return {
      stalledSkills: stalledSkills,
      neverDrilledSkills: neverDrilledSkills,
      recentlyPracticedSkills: recentlyPracticedSkills,
      recommendations: recommendations,
      lastAnalyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('Error analyzing practice gap:', err);
    throw err;
  }
}

export default {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getDrillLibrary,
  getDrillById,
  getPracticeGapAnalysis,
};
