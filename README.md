# mcp-seatable

An MCP (Model Context Protocol) server that exposes SeaTable operations as MCP tools.

## What is this?

This project implements an MCP server using `@modelcontextprotocol/sdk`. It integrates with SeaTable via its REST API to list tables, query rows, and perform CRUD operations. Each tool validates inputs with zod and returns structured JSON.

## Prerequisites

- Node.js >= 18
- npm
- A SeaTable server URL and API token with access to your base

## Setup

1. Clone/open this repo.
2. Copy `.env.example` to `.env` and set values.
3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration (.env)

See `.env.example` for required variables:

- `SEATABLE_SERVER_URL`
- `SEATABLE_API_TOKEN`
- `SEATABLE_BASE_UUID`
- `SEATABLE_TABLE_NAME` (optional default table)
- `SEATABLE_MOCK` (optional; set to `true` or `1` to use in-memory mock client for local testing)
- `SEATABLE_ACCESS_TOKEN_EXP` (optional; expiry passed to app-access-token endpoint, e.g., `3d` or `1h`; default `1h`)
- `SEATABLE_TOKEN_ENDPOINT_PATH` (optional; override token exchange path. Use either the full app-access-token path like `/api/v2.1/dtable/app-access-token/` or a base like `/api/v2.1` or `/dtable-server/api/v1`)

## Scripts

- `npm run dev` – Start server in watch mode (tsx)
- `npm run build` – Compile TypeScript
- `npm start` – Run compiled server
- `npm run test` – Run tests (vitest)
- `npm run test:watch` – Watch tests
- `npm run lint` – Lint
- `npm run lint:fix` – Lint and fix
- `npm run format` – Prettier check
- `npm run typecheck` – TypeScript type check

## Running in Development

```bash
npm run dev
```

The server will validate your environment variables on startup and log a clear error if something is missing or invalid.

## Running in Production

```bash
npm run build
npm start
```

## CLI

- Dev: `tsx src/index.ts`
- Built: `node dist/index.js`
- NPM bin: `seatable-mcp` (after build)

## Mock Mode

Enable a fast, offline mock:

```bash
SEATABLE_MOCK=true npm run dev
```

The mock implements in-memory tables and rows and returns synthetic metadata. Useful for demos and tests without a live SeaTable.

## MCP Tools (IDs)

- get_schema
- list_rows
- get_row
- append_rows
- update_rows
- delete_rows
- upsert_rows
- manage_columns
- manage_tables
- link_rows
- unlink_rows
- attach_file_to_row

Each tool has zod-validated params and returns JSON.

## Tool Cookbook (examples)

- append_rows
  - Input: `{ "table": "Tasks", "rows": [{ "Title": "A" }] }`
  - Notes: set `allow_create_columns=true` to allow new columns.
- update_rows
  - Input: `{ "table": "Tasks", "updates": [{ "row_id": "row_1", "values": { "Done": true } }] }`
- upsert_rows
  - Input: `{ "table": "Tasks", "key_columns": ["Title"], "rows": [{ "Title": "A", "Done": false }] }`
- manage_tables
  - Create: `{ "operations": [{ "action": "create", "name": "NewTable" }] }`
  - Rename: `{ "operations": [{ "action": "rename", "from": "Old", "to": "New" }] }`
- manage_columns
  - Create: `{ "table": "Tasks", "operations": [{ "action": "create", "create": { "name": "NewCol", "type": "text" } }] }`

## Troubleshooting

- Ensure `.env` values are correct and the API token has access to the base.
- Check network connectivity to `SEATABLE_SERVER_URL`.
- Review logs; they include request IDs and error details. Fields include: `op`, `method`, `url`, `status`, `request_id`, and `duration_ms`.
- If token exchange fails (e.g., 404 on default endpoints), set `SEATABLE_TOKEN_ENDPOINT_PATH` to your deployment's path. For API gateway, try `/api/v2.1/dtable/app-access-token/` and optionally set `SEATABLE_ACCESS_TOKEN_EXP=3d`.

## License

MIT
