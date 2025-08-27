import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { getEnv } from '../config/env.js'
import { logger } from '../logger.js'
import { SeaTableClient } from '../seatable/client.js'
import { registerAddRow } from './tools/addRow.js'
import { registerDeleteRow } from './tools/deleteRow.js'
import { registerGetRow } from './tools/getRow.js'
import { registerListRows } from './tools/listRows.js'
import { registerListTables } from './tools/listTables.js'
import { registerSearchRows } from './tools/searchRows.js'
import { registerUpdateRow } from './tools/updateRow.js'
import { registerPingSeatable } from './tools/pingSeatable.js'
import { registerGetSchema } from './tools/getSchema.js'

export function buildServer() {
    const env = getEnv()
    const server = new McpServer({ name: 'mcp-seatable', version: '0.1.0' })
    const client = new SeaTableClient()

    // Register tools
    registerListTables(server, { client, env })
    registerListRows(server, { client, env })
    registerGetRow(server, { client, env })
    registerAddRow(server, { client, env })
    registerUpdateRow(server, { client, env })
    registerDeleteRow(server, { client, env })
    registerSearchRows(server, { client, env })
    registerPingSeatable(server, { client, env })
    registerGetSchema(server, { client, env })

    logger.info('MCP server built')
    return server
}
