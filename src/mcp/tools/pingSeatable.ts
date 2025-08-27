import { ToolRegistrar } from './types.js'

export const registerPingSeatable: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'ping_seatable',
        {
            title: 'Ping SeaTable',
            description: 'Health check that verifies connectivity and auth to SeaTable',
            inputSchema: {},
        },
        async () => {
            const started = Date.now()
            try {
                // Use a lightweight metadata call as a ping
                await client.listTables()
                const latencyMs = Date.now() - started
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: true, latency_ms: latencyMs })
                        },
                    ],
                }
            } catch (err) {
                const latencyMs = Date.now() - started
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: false, latency_ms: latencyMs, error: (err as Error).message })
                        },
                    ],
                }
            }
        }
    )
}
