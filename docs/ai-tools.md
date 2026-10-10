# AI tools (MCP)

Status: implemented in milestone 0.5 and verified end to end on 2026-10-10: the browser test suite enables the plugin's MCP tools, creates a personal access token, lists the tools and calls them through `/_emdash/api/mcp`. Refusals come back with `isError: true`, unknown arguments such as `store_id` are rejected, and a token without the `mcp:tools` scope gets `INSUFFICIENT_SCOPE`. Not run: the OAuth consent flow of a third-party client such as Claude or ChatGPT (EmDash's code, same scopes).

CartDE adds nine tools to EmDash's built-in MCP server through a native plugin (`src/cartde/plugin/`, registered in `astro.config.mjs`). EmDash provides the transport, OAuth 2.1 with PKCE, personal access tokens, scopes and the consent screen. CartDE provides the tools and the business rules behind them. No external model API key is needed or used.

## Connect a client

1. Deploy (or run `pnpm dev`) and sign in to `/_emdash/admin` as an administrator.
2. Enable the CartDE plugin's MCP tools. EmDash does not list plugin tools until an administrator reviews and enables them (see the EmDash plugin settings).
3. Add `https://your-domain/_emdash/api/mcp` as a connector in your AI client and approve the OAuth consent. Tool calls need the `mcp:tools` or `mcp:tools:cartde` scope plus the Admin role. See https://docs.emdashcms.com/guides/ai-tools/.

Tools appear as `cartde__<tool>`.

## Tools

| Tool | Reads or writes | What it does |
| --- | --- | --- |
| `search_products` | read | Find products by name or slug, filter by status |
| `list_orders` | read | Orders newest first, search and filter; phone numbers omitted |
| `get_order_details` | read | One order by number: items, totals, address, contact, history |
| `get_sales_summary` | read | Orders, revenue (excludes cancelled and returned), top products for the last N days |
| `create_product_draft` | write | New **draft** product with one variant |
| `update_product` | write | Edit name, description or SEO text; set draft or archived. **Cannot publish** |
| `update_inventory` | write | Add or remove stock for a variant; never below zero |
| `update_order_status` | write, **destructive** | Move an order through its workflow; cancel and return restore stock |
| `create_discount_draft` | write | Store a discount code as a draft. Discounts are **not applied at checkout yet** |

## Safety design

- **Same rules as the dashboard.** Tools call the same repository functions as the HTTP routes: the order state machine, conditional stock updates and validation all apply. A tool cannot oversell, skip a status, or set a negative price.
- **Admin only.** EmDash's permission list has no commerce entries, so every route requires `settings:manage` (Admin). Orders contain customer contact details, so nothing is available below Admin.
- **No identity arguments.** Input schemas are strict: a `store_id`, `user_id` or similar argument is rejected. The store is implicit and the actor comes from the authenticated request.
- **Humans publish.** AI can create drafts and archive, never publish. This follows EmDash's own guidance to review before publishing.
- **Destructive flag.** `update_order_status` is marked destructive so clients ask the user before calling it.
- **Audit.** Every successful write, from the dashboard or an AI tool, is recorded in `cartde_audit_log` with actor, action, item and a summary that never contains personal details or free text. Browse it at `/admin/audit`. Dashboard writes are logged by the shared route wrapper, so a new endpoint cannot skip it (a test enforces this). EmDash separately records plugin tool calls in its own audit log.
- **Privacy.** `list_orders` omits phone numbers. `get_order_details` includes contact details because fulfilment needs them; treat any AI client with Admin access accordingly.

## Known limits

- The audit entry is written after the change succeeds, as a separate statement. If that write fails, the change stands and an error is logged.
- Discounts are drafts only; applying them at checkout is not built.
