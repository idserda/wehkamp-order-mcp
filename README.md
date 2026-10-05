# Wehkamp order MCP

This project exposes your Wehkamp order history through a local Model Context Protocol (MCP) server. It connects to the Wehkamp GraphQL API and gives MCP clients a clean way to read recent orders and full order details without scraping the website manually.

Common questions this enables:

- “Show me my last 10 orders.”
- “Did I buy any green polo shirts in the last two years?”
- “How much did I spend on footwear this year?”
- “What did I buy in the last month?”
- “Give me the details for order W-308154965.”

## What the server exposes

The server registers two MCP tools:

- `get_orders`
  - Fetches a list of orders in a date range.
  - Inputs:
    - `startDate`: ISO date (`YYYY-MM-DD`)
    - `endDate`: ISO date (`YYYY-MM-DD`)
    - `limit`: optional integer from 1 to 50, default `25`
  - Output includes:
    - `currency`: `EUR`
    - `priceUnit`: `cents`
    - `count`
    - `orders`

- `get_order_details`
  - Fetches the full details for one order number.
  - Inputs:
    - `orderNumber`: string
  - Output includes:
    - `currency`: `EUR`
    - `priceUnit`: `cents`
    - `orderNumber`
    - `orderDetails`
    - `fullShopperData`

## Auth requirements

This server does not log in for you. It expects the raw value of the `token` cookie from an active Wehkamp session.

Steps:

1. Open the Wehkamp website while logged in.
2. Copy the value of the `token` cookie (typically something like `ey...`).
3. Export it as `WEHKAMP_TOKEN` in your shell or MCP environment.
4. Keep the Wehkamp session active; expired or invalid tokens will cause GraphQL requests to fail.

## Requirements

- Node.js 18+
- A valid Wehkamp session with a working `token` cookie
- `WEHKAMP_TOKEN` exported in the environment
- An MCP-compatible client such as OpenCode or another MCP host

## Setup

1. Install dependencies:

```bash
npm install
```

2. Export the token:

```bash
export WEHKAMP_TOKEN="your-token-here"
```

3. Build the server:

```bash
npm run build
```

4. Start the server:

```bash
npm run start
```

This starts the server over stdio, which is what MCP clients expect.

## Example tool calls

### Get recent orders

```json
{
  "tool": "get_orders",
  "arguments": {
    "startDate": "2026-09-05",
    "endDate": "2026-10-05",
    "limit": 25
  }
}
```

### Get one order's details

```json
{
  "tool": "get_order_details",
  "arguments": {
    "orderNumber": "308154965"
  }
}
```

## OpenCode config

Add this to your project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "wehkamp": {
      "type": "local",
      "command": ["node", "/absolute/path/to/wehkamp-mcp/dist/index.js"],
      "enabled": true,
      "environment": {
        "WEHKAMP_TOKEN": "{env:WEHKAMP_TOKEN}"
      }
    }
  }
}
```

Or run it directly from the repo:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "wehkamp": {
      "type": "local",
      "command": ["bash", "-lc", "cd /absolute/path/to/wehkamp-mcp && npm run start"],
      "enabled": true,
      "environment": {
        "WEHKAMP_TOKEN": "{env:WEHKAMP_TOKEN}"
      }
    }
  }
}
```

## How it works

The server posts GraphQL requests to:

`https://www.wehkamp.nl/mijn/graphql`

It sets the cookie header to:

```text
token=<WEHKAMP_TOKEN>
```

and returns the GraphQL response as MCP tool output.

## Project structure

```text
.
├── src/
│   └── index.ts
├── dist/
├── package.json
├── tsconfig.json
├── README.md
├── package-lock.json
└── node_modules/
```

## Useful commands

```bash
npm install
npm run build
npm run start
```

## Troubleshooting

- If the server fails on startup, verify that `WEHKAMP_TOKEN` is exported and contains the raw token value.
- If requests fail with authentication errors, the token may be expired or the Wehkamp session may no longer be valid.
- If a `get_orders` search returns fewer results than expected, reduce the date range or increase the `limit`.

## Notes

- The server does not store or persist any user data.
- Monetary values are returned in cents and labeled as `EUR`.
- The implementation is intentionally small and focused on the two order-related MCP operations.
