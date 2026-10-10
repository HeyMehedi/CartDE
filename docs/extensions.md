# Extensions and themes

Status: implemented in milestone 0.6. Verified by unit tests and by the browser suite, which switches to the warm preset, refuses a low-contrast colour, enables the sample extension (free delivery applied to a real quote) and shows the Bengali storefront. Both presets pass an automated WCAG 2.1 AA scan.

## Themes

The storefront theme is a validated settings object stored in `cartde_settings` (key `theme`) and edited at **Admin > Theme**. It controls:

| Setting | Notes |
| --- | --- |
| Preset | `default` (follows the visitor's light/dark mode) or `warm` (light, serif). Presets are token sets in `src/cartde/domain/theme.ts` |
| Colours | Accent, button text, page background, page text. Six-digit hex only. Empty means "use the preset" |
| Font and corners | Named options only (system, serif, monospace; sharp, soft, round). No web fonts are loaded |
| Homepage sections | Ordered list of `hero`, `latest_products`, `categories`, `text`, `recent_posts`, `extension` |
| Footer | Text and up to 8 links (a path such as `/about`, or an `https://` URL) |
| Search engines | Title suffix and default description |

**Safety.** Only validated values reach CSS: hex colours and named options. A value such as `red; background:url(x)` is rejected, so a theme cannot inject CSS. Colours must pass WCAG AA contrast (4.5:1 for text and buttons, 3:1 for the accent on the page) or the save is refused. Footer links cannot be `javascript:` or protocol-relative.

**Adding a preset.** Add an entry to `PRESETS` and its id to `PRESET_IDS` in `src/cartde/domain/theme.ts`. A test checks that every preset meets contrast and validates. Base styles live in `src/themes/default/theme.css`; the theme overrides its CSS variables.

## Languages

Storefront text lives in `src/cartde/i18n/messages.ts`. English is the source; the Bengali catalogue must have every key (the type enforces it, and a test checks placeholders match). The language follows the store locale: `bn-BD` (or any `bn…`) gives Bengali, anything else English. Prices use `Intl` with the store locale, so Bengali digits appear automatically. Set the locale under **Admin > Settings**.

Limits: validation messages returned by the API, the "store not ready" page and the admin dashboard are English only.

## Search

`/search?q=` searches active products by name, description and SKU. Up to four terms, all of which must match; names that start with the phrase rank first. It uses SQL `LIKE` with escaped wildcards, which is fine for catalogues of hundreds to a few thousand products; it is not a full-text index and does not rank by relevance beyond that.

## Extensions

An extension is a small TypeScript module that ships with the store in `src/extensions/` and is listed in `src/extensions/index.ts`. Listing does not enable it: an administrator turns it on at **Admin > Extensions**. The sample, `src/extensions/free-delivery.ts`, uses all hook kinds.

```ts
import { EXTENSION_API_VERSION, type Extension } from "../cartde/extensions/types";

export default {
  id: "my-extension",            // lowercase kebab-case, unique
  name: "My extension",
  description: "What it does",
  cartdeApi: EXTENSION_API_VERSION, // must match, or the extension is rejected
  hooks: { /* see below */ },
} satisfies Extension;
```

### Hooks (API version 1)

| Hook | Receives | Returns | Core checks |
| --- | --- | --- | --- |
| `adjustDelivery(ctx)` | currency, district, lines, subtotal, current delivery charge | new delivery charge | Integer, 0 to 1,000,000 minor units |
| `discount(ctx)` | same | discount on goods | Integer, 0 to the subtotal; several discounts add up, capped at the subtotal |
| `onOrderEvent(event)` | `order.placed` or `order.status_changed` with order number, status, previous status, total, currency, item count | nothing | Frozen copy; **no customer details** are included |
| `storefrontSection(ctx)` | currency, locale | `{ title, body?, items? }` | Data only, never HTML; the core escapes it; item URLs must be a path or http(s) |

### Rules the core enforces

- **Compatibility.** `cartdeApi` must equal the core's `EXTENSION_API_VERSION` (currently 1); the id must be kebab-case and unique. Others are listed as "Not loaded" with the reason.
- **Isolation.** Every hook runs with a 500 ms budget. A hook that throws, times out or returns an out-of-range value is skipped for that request and logged; checkout carries on.
- **No data access.** Extensions receive plain data and return plain data. They never get the database, and cannot change order fields, prices of items or stock.
- **One quote.** The cart preview and the real order use the same `quoteTotals` function, so extensions affect both identically. The order's invariants (`total = subtotal + delivery − discount`) are enforced by the database as well.
- **Events fire once.** An idempotent checkout retry does not emit a second `order.placed`. Order changes made by AI tools emit the same events as the dashboard.

### Changing the API

Existing hook signatures change only with a new `EXTENSION_API_VERSION`. New optional hooks may be added without one. Extensions are trusted code you deploy yourself: the isolation above stops mistakes, not a malicious extension, which runs in the same Worker.
