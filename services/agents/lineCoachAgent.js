/**
 * Line Coach Agent (compatibility shim)
 *
 * The original monolithic Line Coach agent was split into domain-specific
 * agents (lineupAgent, playtimeAgent, rosterAgent) that are routed through
 * the orchestrator via a tool -> agent map.
 *
 * This file preserves the original `executeToolCall(name, input, gameState,
 * playtimeTracker)` entry point so any caller that still imports it continues
 * to work. New code should call the orchestrator directly.
 */

import { routeToolCall } from './orchestrator.js';

/**
 * @deprecated Use orchestrator.routeToolCall instead.
 */
export async function executeToolCall(toolName, toolInput, gameState, playtimeTracker) {
  return routeToolCall(null, toolName, toolInput, gameState, playtimeTracker);
}

export default { executeToolCall };
