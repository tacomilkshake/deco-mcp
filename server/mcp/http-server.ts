import { createServer } from 'http'
import crypto from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { createDecoClient, type DecoClient } from '../../src/deco.js'
import { createMcpServer } from './server.js'

const PORT = parseInt(process.env['MCP_PORT'] ?? '8086', 10)
const DECO_HOST = process.env['DECO_HOST']
const DECO_PASSWORD = process.env['DECO_PASSWORD']
const DECO_USERNAME = process.env['DECO_USERNAME'] ?? 'admin'

async function main(): Promise<void> {
  if (!DECO_HOST || !DECO_PASSWORD) {
    console.error('Missing required environment variables: DECO_HOST, DECO_PASSWORD')
    process.exit(1)
  }

  console.log(`Connecting to Deco at ${DECO_HOST}...`)
  const decoClient: DecoClient = await createDecoClient(DECO_HOST, DECO_PASSWORD, DECO_USERNAME)
  console.log('Deco client ready')

  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createMcpServer> }>()

  const httpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (req.url === '/mcp') {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!
        await session.transport.handleRequest(req, res)
        return
      }

      // New session (initialize request)
      const server = createMcpServer(decoClient)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() })
      await server.connect(transport as unknown as Transport)

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
      }

      await transport.handleRequest(req, res)

      if (transport.sessionId) {
        sessions.set(transport.sessionId, { transport, server })
      }
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  httpServer.listen(PORT, () => {
    console.log(`MCP server listening on port ${PORT}`)
    console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`)
    console.log(`  Health check: http://localhost:${PORT}/health`)
  })

  const shutdown = (): void => {
    console.log('Shutting down...')
    httpServer.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
