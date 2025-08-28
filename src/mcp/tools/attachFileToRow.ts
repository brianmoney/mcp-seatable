import { z } from 'zod'

import { ToolRegistrar } from './types.js'

const FileInput = z.union([
  z.object({ url: z.string().url(), filename: z.string(), content_type: z.string().optional() }),
  z.object({ bytes_base64: z.string(), filename: z.string(), content_type: z.string().optional() }),
])

const Input = z.object({
  table: z.string(),
  row_id: z.string(),
  column: z.string(),
  file: FileInput,
})

const MAX_BYTES = 5 * 1024 * 1024

export const registerAttachFileToRow: ToolRegistrar = (server) => {
  server.registerTool(
    'attach_file_to_row',
    {
      title: 'Attach File to Row',
      description: 'Attach a file to a row via URL or base64 bytes (<= 5 MB).',
      inputSchema: {
        table: z.string(),
        row_id: z.string(),
        column: z.string(),
        file: z.any(),
      },
    },
    async (args: unknown) => {
      const { table, row_id, column, file } = Input.parse(args)

      if ('bytes_base64' in file) {
        const bytes = Buffer.from(file.bytes_base64, 'base64')
        if (bytes.length > MAX_BYTES) {
          const err = new Error('Attachment too large (> 5 MB)')
            ; (err as any).code = 'ERR_FILE_TOO_LARGE'
          throw err
        }
        // For now, return the file descriptor to be uploaded via a separate flow (to be implemented in Phase 1.1/Phase 2 if needed)
        return { content: [{ type: 'text', text: JSON.stringify({ note: 'upload flow not yet implemented', table, row_id, column, filename: file.filename, size: bytes.length }) }] }
      } else if ('url' in file) {
        // We are not downloading server-side. Provide descriptor for later ingestion by SeaTable server (requires upload link flow).
        return { content: [{ type: 'text', text: JSON.stringify({ note: 'server fetch by URL not implemented; provide URL for SeaTable if supported', table, row_id, column, url: file.url }) }] }
      }

      return { content: [{ type: 'text', text: JSON.stringify({ ok: false }) }] }
    }
  )
}
