import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { logger } from './logger.js'
import { buildServer } from './mcp/server.js'

async function main() {
    const server = buildServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    logger.info('MCP SeaTable server running (stdio)')
}

main().catch((err) => {
    logger.error({ err }, 'Failed to start server')
    console.error(err)
    process.exit(1)
})
