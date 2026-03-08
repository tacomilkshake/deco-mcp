import type { DecoClient } from '../../src/deco.js'
import { getTool, decoTools } from './tools.js'

export interface ToolCallResult {
  success: boolean
  toolName: string
  result?: unknown
  error?: string
}

export async function executeToolCall(
  client: DecoClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const tool = getTool(toolName)

  if (!tool) {
    return {
      success: false,
      toolName,
      error: `Unknown tool: ${toolName}. Available tools: ${decoTools.map(t => t.name).join(', ')}`
    }
  }

  try {
    const result = await tool.execute(client, args)
    return {
      success: true,
      toolName,
      result
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      toolName,
      error: message
    }
  }
}
