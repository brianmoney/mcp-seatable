import { mapMetadataToGeneric } from '../../schema/map.js'
import { ToolRegistrar } from './types.js'

export const registerGetSchema: ToolRegistrar = (server, { client }) => {
    server.registerTool(
        'get_schema',
        {
            title: 'Get Schema',
            description: 'Returns the normalized schema for the base',
            inputSchema: {},
        },
        async () => {
            const metadata = await client.getMetadata()
            const generic = mapMetadataToGeneric(metadata)
            return { content: [{ type: 'text', text: JSON.stringify(generic) }] }
        }
    )
}
