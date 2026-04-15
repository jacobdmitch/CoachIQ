import { executeToolCall as executeLineCoachTool } from './lineCoachAgent.js';
import logger from '../logger.js';

/**
 * AI Agent Orchestrator
 * Routes requests to the appropriate AI agent.
 * Currently supports Line Coach; structured for expansion.
 */

const AGENTS = {
  lineCoach: {
    id: 'lineCoach',
    name: 'Line Coach',
    execute: executeLineCoachTool,
  },
};

/**
 * Get available agents
 * @returns {Array} List of agent metadata
 */
export function getAvailableAgents() {
  return Object.values(AGENTS).map((agent) => ({
    id: agent.id,
    name: agent.name,
  }));
}

/**
 * Route a tool call to the appropriate agent
 *
 * @param {string} agentId - Agent to use (lineCoach, etc.)
 * @param {string} toolName - Tool name
 * @param {Object} toolInput - Tool input
 * @param {Object} gameState - Game state manager
 * @param {Object} playtimeTracker - Playtime tracker
 * @returns {Promise<Object>} Tool execution result
 */
export async function routeToolCall(agentId, toolName, toolInput, gameState, playtimeTracker) {
  const agent = AGENTS[agentId];

  if (!agent) {
    logger.error(`Unknown agent: ${agentId}`);
    return { error: `Unknown agent: ${agentId}` };
  }

  logger.debug(`Routing to agent: ${agent.name}`, { tool: toolName });

  try {
    const result = await agent.execute(toolName, toolInput, gameState, playtimeTracker);
    return result;
  } catch (err) {
    logger.error(`Error in agent ${agentId}:`, err);
    return { error: err.message };
  }
}

/**
 * Process a multi-step agent request
 * Handles conversations that may require multiple tool calls
 *
 * @param {string} agentId - Agent to use
 * @param {Array} toolCalls - Array of {name, input} tool calls from Claude
 * @param {Object} gameState - Game state
 * @param {Object} playtimeTracker - Playtime tracker
 * @returns {Promise<Array>} Array of tool results
 */
export async function processBatch(agentId, toolCalls, gameState, playtimeTracker) {
  const agent = AGENTS[agentId];

  if (!agent) {
    return [{ error: `Unknown agent: ${agentId}` }];
  }

  logger.debug(`Processing batch for agent: ${agent.name}`, {
    toolCount: toolCalls.length,
  });

  const results = [];
  for (const toolCall of toolCalls) {
    const result = await agent.execute(
      toolCall.name,
      toolCall.input,
      gameState,
      playtimeTracker
    );
    results.push(result);
  }

  return results;
}

/**
 * Get agent info
 * @param {string} agentId - Agent ID
 * @returns {Object} Agent metadata
 */
export function getAgentInfo(agentId) {
  return AGENTS[agentId] || null;
}

export default {
  getAvailableAgents,
  routeToolCall,
  processBatch,
  getAgentInfo,
};
