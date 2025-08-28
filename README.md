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

## MCP Client Configuration

Point your MCP-compatible client at the server entry `node dist/index.js` (or `tsx src/index.ts` for dev). The server exposes tools:

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

Each tool has zod-validated params and returns JSON. See inline JSDoc for examples.

## Troubleshooting

- Ensure `.env` values are correct and the API token has access to the base.
- Check network connectivity to `SEATABLE_SERVER_URL`.
- Review logs; they include request IDs and error details.

## License

MIT
