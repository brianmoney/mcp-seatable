import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { getEnv } from '../config/env.js'
import { logger } from '../logger.js'
import { SeaTableClient } from '../seatable/client.js'
import { registerDeleteRows } from './tools/deleteRow.js'
import { registerGetRow } from './tools/getRow.js'
import { registerListRows } from './tools/listRows.js'
import { registerListTables } from './tools/listTables.js'
import { registerUpdateRows } from './tools/updateRow.js'
import { registerPingSeatable } from './tools/pingSeatable.js'
import { registerGetSchema } from './tools/getSchema.js'
import { registerAppendRows } from './tools/appendRows.js'
import { registerUpsertRows } from './tools/upsertRows.js'
import { registerManageColumns } from './tools/manageColumns.js'
import { registerManageTables } from './tools/manageTables.js'
import { registerLinkRows } from './tools/linkRows.js'
import { registerUnlinkRows } from './tools/unlinkRows.js'
import { registerAttachFileToRow } from './tools/attachFileToRow.js'

export function buildServer() {
    const env = getEnv()
    const server = new McpServer({ name: 'mcp-seatable', version: '0.1.0' })
    const client = new SeaTableClient()

    // Register tools (strictly per plan)
    registerListTables(server, { client, env })
    registerListRows(server, { client, env })
    registerGetRow(server, { client, env })
    registerAppendRows(server, { client, env })
    registerUpdateRows(server, { client, env })
    registerDeleteRows(server, { client, env })
    registerUpsertRows(server, { client, env })
    registerManageColumns(server, { client, env })
    registerManageTables(server, { client, env })
    registerLinkRows(server, { client, env })
    registerUnlinkRows(server, { client, env })
    registerAttachFileToRow(server, { client, env })
    registerPingSeatable(server, { client, env })
    registerGetSchema(server, { client, env })

    logger.info('MCP server built')
    return server
}
