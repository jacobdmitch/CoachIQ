import { query as pool } from './database.js';
import logger from './logger.js';

/**
 * List all plays for coach's team(s) with optional filtering
 * @param {string} coachId - Coach UUID
 * @param {object} filters - { teamId?, situationTag? }
 * @returns {Array} Array of plays
 */
export const listPlays = async (coachId, filters = {}) => {
  try {
    let query = `
      SELECT p.id, p.team_id, p.title, p.situation_tag, p.diagram_data, p.notes, p.created_at, p.updated_at
      FROM plays p
      JOIN teams t ON p.team_id = t.id
      WHERE t.coach_id = $1
    `;
    const params = [coachId];

    if (filters.teamId) {
      query += ` AND p.team_id = $${params.length + 1}`;
      params.push(filters.teamId);
    }

    if (filters.situationTag) {
      query += ` AND p.situation_tag = $${params.length + 1}`;
      params.push(filters.situationTag);
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    logger.error('Error listing plays:', err);
    throw err;
  }
};

/**
 * Get a single play by ID with ownership validation
 * @param {string} playId - Play UUID
 * @param {string} coachId - Coach UUID
 * @returns {object} Play object
 */
export const getPlay = async (playId, coachId) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.team_id, p.title, p.situation_tag, p.diagram_data, p.notes, p.created_at, p.updated_at
       FROM plays p
       JOIN teams t ON p.team_id = t.id
       WHERE p.id = $1 AND t.coach_id = $2`,
      [playId, coachId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error('Error getting play:', err);
    throw err;
  }
};

/**
 * Create a new play
 * @param {string} coachId - Coach UUID
 * @param {object} data - { teamId, title, situationTag?, diagramData?, notes? }
 * @returns {object} Created play object
 */
export const createPlay = async (coachId, data) => {
  try {
    // Verify coach owns the team
    const teamResult = await pool.query(
      `SELECT id FROM teams WHERE id = $1 AND coach_id = $2`,
      [data.teamId, coachId]
    );

    if (teamResult.rows.length === 0) {
      throw new Error('Team not found or unauthorized');
    }

    const result = await pool.query(
      `INSERT INTO plays (team_id, title, situation_tag, diagram_data, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, team_id, title, situation_tag, diagram_data, notes, created_at, updated_at`,
      [
        data.teamId,
        data.title,
        data.situationTag || null,
        data.diagramData || null,
        data.notes || null,
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error('Error creating play:', err);
    throw err;
  }
};

/**
 * Update an existing play
 * @param {string} playId - Play UUID
 * @param {string} coachId - Coach UUID
 * @param {object} data - { title?, situationTag?, diagramData?, notes? }
 * @returns {object} Updated play object
 */
export const updatePlay = async (playId, coachId, data) => {
  try {
    // Verify coach owns the play
    const playResult = await pool.query(
      `SELECT p.id FROM plays p
       JOIN teams t ON p.team_id = t.id
       WHERE p.id = $1 AND t.coach_id = $2`,
      [playId, coachId]
    );

    if (playResult.rows.length === 0) {
      throw new Error('Play not found or unauthorized');
    }

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updateFields.push(`title = $${paramIndex}`);
      params.push(data.title);
      paramIndex++;
    }

    if (data.situationTag !== undefined) {
      updateFields.push(`situation_tag = $${paramIndex}`);
      params.push(data.situationTag);
      paramIndex++;
    }

    if (data.diagramData !== undefined) {
      updateFields.push(`diagram_data = $${paramIndex}`);
      params.push(data.diagramData);
      paramIndex++;
    }

    if (data.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex}`);
      params.push(data.notes);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return await getPlay(playId, coachId);
    }

    params.push(playId);

    const result = await pool.query(
      `UPDATE plays SET ${updateFields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, team_id, title, situation_tag, diagram_data, notes, created_at, updated_at`,
      params
    );

    return result.rows[0];
  } catch (err) {
    logger.error('Error updating play:', err);
    throw err;
  }
};

/**
 * Delete a play
 * @param {string} playId - Play UUID
 * @param {string} coachId - Coach UUID
 * @returns {boolean} Success
 */
export const deletePlay = async (playId, coachId) => {
  try {
    // Verify coach owns the play
    const playResult = await pool.query(
      `SELECT p.id FROM plays p
       JOIN teams t ON p.team_id = t.id
       WHERE p.id = $1 AND t.coach_id = $2`,
      [playId, coachId]
    );

    if (playResult.rows.length === 0) {
      throw new Error('Play not found or unauthorized');
    }

    await pool.query(`DELETE FROM plays WHERE id = $1`, [playId]);
    return true;
  } catch (err) {
    logger.error('Error deleting play:', err);
    throw err;
  }
};

/**
 * Duplicate a play with new title
 * @param {string} playId - Play UUID to duplicate
 * @param {string} coachId - Coach UUID
 * @param {string} newTitle - Title for the duplicate
 * @returns {object} Duplicated play object
 */
export const duplicatePlay = async (playId, coachId, newTitle) => {
  try {
    // Get the original play
    const original = await getPlay(playId, coachId);

    if (!original) {
      throw new Error('Play not found or unauthorized');
    }

    // Create copy with " (Copy)" suffix if no custom title provided
    const title = newTitle || `${original.title} (Copy)`;

    const result = await pool.query(
      `INSERT INTO plays (team_id, title, situation_tag, diagram_data, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, team_id, title, situation_tag, diagram_data, notes, created_at, updated_at`,
      [original.team_id, title, original.situation_tag, original.diagram_data, original.notes]
    );

    return result.rows[0];
  } catch (err) {
    logger.error('Error duplicating play:', err);
    throw err;
  }
};
