import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js'
import type { DecoClient } from '../../src/deco.js'
import { toMcpTools } from '../lib/tools.js'
import { executeToolCall } from '../lib/executor.js'

export function createMcpServer(client: DecoClient): Server {
  const server = new Server(
    {
      name: 'deco',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mcpTools = toMcpTools()
    return {
      tools: mcpTools.map((t): Tool => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: 'object' as const,
          properties: t.inputSchema.properties as Record<string, object>,
          required: t.inputSchema.required
        }
      }))
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params

    const result = await executeToolCall(client, name, (args ?? {}) as Record<string, unknown>)

    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result, null, 2)
          }
        ]
      }
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}`
          }
        ],
        isError: true
      }
    }
  })

  return server
}
