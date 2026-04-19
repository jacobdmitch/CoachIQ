import * as lineupAgent from './lineupAgent.js';
import * as playtimeAgent from './playtimeAgent.js';
import * as rosterAgent from './rosterAgent.js';
import logger from '../logger.js';

/**
 * AI Agent Orchestrator
 *
 * Routes tool calls to the owning agent via a tool -> agent map that is built
 * from each agent's declared TOOLS array. Each agent module must export:
 *   - TOOLS: string[]  (tool names it owns)
 *   - execute(toolName, toolInput, gameState, playtimeTracker)
 *
 * Adding a new agent = add it to the AGENTS registry below.
 */

const AGENTS = {
  lineup:   { id: 'lineup',   name: 'Lineup Agent',   module: lineupAgent },
  playtime: { id: 'playtime', name: 'Playtime Agent', module: playtimeAgent },
  roster:   { id: 'roster',   name: 'Roster Agent',   module: rosterAgent },
};

// Build tool -> agentId map from each agent's declared TOOLS.
// Collisions are a programmer error: each tool belongs to exactly one agent.
const TOOL_TO_AGENT = _buildToolMap();

function _buildToolMap() {
  const map = {};
  for (const [agentId, agent] of Object.entries(AGENTS)) {
    const tools = agent.module.TOOLS || [];
    for (const t of tools) {
      if (map[t]) {
        logger.error(
          `Tool "${t}" claimed by both ${map[t]} and ${agentId} - check agent TOOLS arrays`
        );
      }
      map[t] = agentId;
    }
  }
  return map;
}

/**
 * Return { id, name, tools } for every registered agent.
 */
export function getAvailableAgents() {
  return Object.values(AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    tools: a.module.TOOLS || [],
  }));
}

/**
 * Look up which agent owns a given tool name, or null if unknown.
 */
export function getAgentForTool(toolName) {
  return TOOL_TO_AGENT[toolName] || null;
}

/**
 * Execute a single tool call by routing to the owning agent.
 * If agentId is passed, it is used directly (caller-enforced). Otherwise the
 * orchestrator looks up the owning agent from TOOL_TO_AGENT.
 *
 * @param {string|null} agentId - Agent ID, or null to auto-route by tool name
 * @param {string} toolName
 * @param {Object} toolInput
 * @param {Object} gameState
 * @param {Object} playtimeTracker
 */
export async function routeToolCall(agentId, toolName, toolInput, gameState, playtimeTracker) {
  const resolvedAgentId = agentId || TOOL_TO_AGENT[toolName];
  const agent = AGENTS[resolvedAgentId];

  if (!agent) {
    logger.error(`No agent can handle tool: ${toolName}`, { agentId });
    return { error: `No agent registered for tool: ${toolName}` };
  }

  logger.debug(`Routing tool "${toolName}" to agent: ${agent.name}`);

  try {
    return await agent.module.execute(toolName, toolInput, gameState, playtimeTracker);
  } catch (err) {
    logger.error(`Error in agent ${resolvedAgentId} executing ${toolName}:`, err);
    return { error: err.message };
  }
}

/**
 * Execute a batch of tool calls. Each call is routed independently by tool name
 * so a single batch can fan out across multiple agents. Order is preserved.
 *
 * @param {Array<{name:string,input:object}>} toolCalls
 */
export async function processBatch(toolCalls, gameState, playtimeTracker) {
  logger.debug(`Processing batch of ${toolCalls.length} tool calls`);

  const results = [];
  for (const call of toolCalls) {
    const result = await routeToolCall(
      null,
      call.name,
      call.input,
      gameState,
      playtimeTracker
    );
    results.push(result);
  }
  return results;
}

/**
 * Return { id, name, tools } for a specific agent, or null.
 */
export function getAgentInfo(agentId) {
  const a = AGENTS[agentId];
  return a ? { id: a.id, name: a.name, tools: a.module.TOOLS || [] } : null;
}

export default {
  getAvailableAgents,
  getAgentForTool,
  routeToolCall,
  processBatch,
  getAgentInfo,
};
