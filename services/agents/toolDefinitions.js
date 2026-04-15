/**
 * Tool definitions for Claude tool_use API.
 * These define what Line Coach can recommend to the game.
 */

export const COACHING_TOOLS = [
  {
    name: 'suggest_substitution',
    description:
      'Suggest a specific substitution based on current game state, playtime equity, and player skills. Always emphasizes that the coach makes the final decision.',
    input_schema: {
      type: 'object',
      properties: {
        player_in: {
          type: 'string',
          description: 'Name or jersey number of player to substitute in',
        },
        player_out: {
          type: 'string',
          description: 'Name or jersey number of player to substitute out',
        },
        position: {
          type: 'string',
          description:
            'Position or field slot (e.g., "midfield", "defense", "attack", "field_0")',
        },
        reason: {
          type: 'string',
          description:
            'Brief rationale for the suggestion (playtime equity, performance, matchup advantage, etc.)',
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How soon this substitution should happen',
        },
      },
      required: ['player_in', 'player_out', 'reason'],
    },
  },
  {
    name: 'analyze_playtime',
    description:
      'Analyze current playtime equity across the roster and flag players under/over target minutes.',
    input_schema: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['under_target', 'over_target', 'all'],
          description: 'Which athletes to focus on',
        },
        tolerance_minutes: {
          type: 'number',
          description: 'Tolerance threshold for flagging (default 2 minutes)',
        },
      },
      required: [],
    },
  },
  {
    name: 'evaluate_lineup',
    description:
      'Evaluate current lineup effectiveness and suggest adjustments based on matchups, player strengths, and game flow.',
    input_schema: {
      type: 'object',
      properties: {
        aspect: {
          type: 'string',
          enum: ['offensive', 'defensive', 'transition', 'overall'],
          description: 'Aspect of play to evaluate',
        },
        concern: {
          type: 'string',
          description: 'Specific concern or area to analyze',
        },
      },
      required: ['aspect'],
    },
  },
  {
    name: 'position_recommendation',
    description:
      'Recommend best position fit for a specific athlete based on skill profile and team needs.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_id: {
          type: 'string',
          description: 'Jersey number or name of athlete to evaluate',
        },
        context: {
          type: 'string',
          description: 'Additional context (e.g., "evaluating for next season")',
        },
      },
      required: ['athlete_id'],
    },
  },
  {
    name: 'flag_alert',
    description:
      'Flag an urgent coaching decision or situation that needs immediate attention.',
    input_schema: {
      type: 'object',
      properties: {
        alert_type: {
          type: 'string',
          enum: [
            'playtime_critical',
            'foul_trouble',
            'matchup_concern',
            'fatigue',
            'tactical_adjustment',
          ],
          description: 'Type of alert',
        },
        severity: {
          type: 'string',
          enum: ['warning', 'urgent'],
          description: 'Alert severity level',
        },
        message: {
          type: 'string',
          description: 'Alert message for the coach',
        },
        recommended_action: {
          type: 'string',
          description: 'Suggested action the coach could take',
        },
      },
      required: ['alert_type', 'severity', 'message'],
    },
  },
];

export default COACHING_TOOLS;
