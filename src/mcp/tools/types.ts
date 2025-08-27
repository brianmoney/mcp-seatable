// Minimal server interface we rely on
export type McpServerLike = {
    // Accept any registerTool signature to stay compatible with SDK
    registerTool: (...args: any[]) => any
}

import type { Env } from '../../config/env.js'
import type { SeaTableClient } from '../../seatable/client.js'

export type ToolRegistrar = (
    server: McpServerLike,
    deps: { client: SeaTableClient; env: Env }
) => void
