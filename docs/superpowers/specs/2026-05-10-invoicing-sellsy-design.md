# Invoicing Section — Sellsy Draft Invoice Push

**Date:** 2026-05-10  
**Status:** Approved  
**Scope:** Admin dashboard Invoicing tab + Sellsy API v2 draft invoice creation

---

## Goal

Add an Invoicing section to the Admin dashboard that lists all `delivered` orders and lets admins push each one as a **draft invoice** to Sellsy API v2. The admin reviews and finalises invoices from within Sellsy.

---

## Architecture

### Approach chosen: Extend `sellsy-sync` edge function + Rebuild `InvoicingView`

- A new `mode: "create-invoice"` handler is added to the existing `supabase/functions/sellsy-sync/index.ts`. This reuses the established `getSellsyAccessToken()` and `fetchSellsy()` helpers — no duplicated auth code.
- `src/components/InvoicingView.tsx` is rebuilt from scratch. The current file is wired for Google Sheets export (a different purpose); the new version is fully self-contained for Sellsy invoicing.
- `AdminDashboard.tsx` changes are minimal: uncomment the Invoicing tab + render `<InvoicingView />`.

---

## Database Schema Changes

### Migration: `orders` table

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sellsy_invoice_id     TEXT,
  ADD COLUMN IF NOT EXISTS sellsy_invoice_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS sellsy_invoice_error  TEXT,
  ADD COLUMN IF NOT EXISTS invoiced_at           TIMESTAMPTZ;

-- Valid values: not_sent | draft | sent | paid | error
```

### Migration: `products` table

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sellsy_tax_id TEXT;
```

`sellsy_tax_id` is populated automatically during Sellsy product sync (`/v2/items` → `taxes[0].id`). If a product has no tax entry in Sellsy, `sellsy_tax_id` stays `null` and the invoice row uses `type: "once"` instead of `type: "item"`.

**Not added:**
- `sellsy_taxes` cache table — unnecessary; tax IDs live per-product
- `companies.default_payment_terms_days` — payment terms managed in Sellsy, not here

---

## Product Sync Update

In `normalizeProduct()` inside `sellsy-sync`, add one field to the upsert:

```
Sellsy /v2/items response → item.taxes[0]?.id → products.sellsy_tax_id
```

No admin action required. The tax ID arrives on the next product sync run.

---

## Edge Function: `create-invoice` Handler

**Trigger:** `supabase.functions.invoke("sellsy-sync", { body: { mode: "create-invoice", order_id, note, subject, due_date } })`

**Server-side flow:**

1. Load from Supabase:
   - `orders` row (for `user_id`, `created_at`, `total_price`)
   - `order_items` + joined `products` (for `sellsy_id`, `sellsy_tax_id`, `price_per_kg`)
   - `contacts` (primary, for `user_id`) → joined `companies` (for `sellsy_id`) + `sellsy_contact_id`
2. Acquire Sellsy OAuth token via `getSellsyAccessToken()` (reused from existing code)
3. Build invoice payload (see below)
4. `POST https://api.sellsy.com/v2/invoices`
5. On success → update `orders` row:
   - `sellsy_invoice_id = response.data.id`
   - `sellsy_invoice_status = "draft"`
   - `invoiced_at = now()`
6. Return `{ success: true, invoice_id, invoice_url }`

**On error:**
- Return `{ success: false, error: message }`
- Frontend writes `sellsy_invoice_status = "error"`, `sellsy_invoice_error = message`

**Invoice payload:**

```json
{
  "company_id": "<companies.sellsy_id>",
  "contact_id": "<contacts.sellsy_contact_id>",
  "date": "2026-05-10",
  "due_date": "2026-06-09",
  "subject": "Order #XXXX",
  "currency": "EUR",
  "note": "<admin-editable note>",
  "rows": [
    {
      "type": "item",
      "item_id": "<product.sellsy_id>",
      "description": "<product name>",
      "unit_amount": 24.00,
      "quantity": 4,
      "tax_id": "<product.sellsy_tax_id>",
      "discount": 0,
      "discount_type": "percent"
    },
    {
      "type": "once",
      "description": "<product name> (no Sellsy item)",
      "unit_amount": 8.50,
      "quantity": 2,
      "discount": 0,
      "discount_type": "percent"
    }
  ]
}
```

**Row type rules:**
- `product.sellsy_id` is set AND `product.sellsy_tax_id` is set → `type: "item"` with `item_id` + `tax_id`
- `product.sellsy_id` is set but `sellsy_tax_id` is null → `type: "item"` with `item_id`, no `tax_id`
- `product.sellsy_id` is null → `type: "once"` with description only

**Bulk:** Frontend calls `create-invoice` sequentially per order with a 500ms gap between calls. The edge function handles one invoice per invocation — no batch endpoint.

---

## `InvoicingView` Component

**File:** `src/components/InvoicingView.tsx` (full rewrite)

### Data loading

`InvoicingView` fetches its own data independently (does not depend on AdminDashboard passing orders down):

```
supabase
  .from("orders")
  .select("id, user_id, created_at, delivery_date, total_price, status,
           sellsy_invoice_id, sellsy_invoice_status, sellsy_invoice_error, invoiced_at,
           order_items(product_id, product_name, product_sku, quantity, price_per_kg,
             products(sellsy_id, sellsy_tax_id)),
           contacts!inner(company_id, sellsy_contact_id,
             companies(name, sellsy_id))")
  .eq("status", "delivered")
  .order("delivery_date", { ascending: false })
```

### Invoice status values

| Value | Badge | Who sets it |
|---|---|---|
| `not_sent` | Gray "Not sent" | Default |
| `draft` | Yellow "Draft" | Auto after successful push |
| `sent` | Blue "Sent" | Admin manually |
| `paid` | Green "Paid" | Admin manually |
| `error` | Red "Error" + tooltip | Auto on push failure |

Manual status updates (`draft → sent → paid`) are a single Supabase `UPDATE` — no Sellsy API call.

### Table columns

Order # · Date · Client · Products (comma-joined names) · Total HT · Total TTC · Sellsy Status · Actions

**Actions per row:** `[Preview / Send]` button (opens preview modal) + status dropdown (for manual `sent`/`paid` promotion)

### Filter bar

- Text search: order #, client name
- Sellsy status dropdown: All / Not sent / Draft / Sent / Paid / Error
- Date range: two date inputs (delivery_date)

### Preview modal

Opens when admin clicks `[Preview / Send]`. Contains:

- **Editable `subject`** — pre-filled `"Order #<id-slice>"`
- **Editable `note`** — empty by default
- **Editable `due_date`** — pre-filled today + 30 days
- Client block: company name, Sellsy company ID, contact name
- Warning banner if `companies.sellsy_id` is null (cannot push without it)
- Line-item table: product name · qty · unit HT · line HT
- Totals: Subtotal HT / VAT (grouped by rate) / Total TTC — computed client-side
- `[Cancel]` and `[Send Draft to Sellsy ▶]` buttons

### Bulk send

- Checkbox per row + Select All in header
- `[Send selected (N)]` button — disabled if N = 0
- Progress indicator: "Sending 3/8 invoices…"
- Skips orders already in `draft` / `sent` / `paid` status (shows warning)
- End summary dialog: `✅ N created as drafts  ❌ M failed: <reason>`

---

## AdminDashboard Changes

Minimal — `AdminDashboard.tsx` already has the Invoicing tab commented out:

1. Uncomment tab definition + badge (count of `delivered` orders with `sellsy_invoice_status = "not_sent"`)
2. Import `InvoicingView` from `@/components/InvoicingView`
3. Render `<InvoicingView />` when `activeSection === "invoicing"`
4. Remove the inline `InvoicingOrder` / `InvoicingStatus` type stubs at top of file (they move into `InvoicingView.tsx`)
5. Add badge count prop via callback from `InvoicingView` → `onBadgeCount(n)`

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `companies.sellsy_id` is null | Preview shows warning banner; Send button disabled |
| `contacts.sellsy_contact_id` is null | Invoice sent without `contact_id` field (Sellsy accepts it) |
| Sellsy API returns non-2xx | Edge function returns `{ success: false, error }` → status = `error` |
| Product has no `sellsy_id` | Row uses `type: "once"` — invoice still created |
| Network timeout | Caught as error; status = `error`; retry available |

---

## Out of Scope

- Payment terms configuration UI (managed in Sellsy)
- Sellsy → app status sync (draft/sent/paid status updated manually by admin)
- `sellsy_taxes` cache table
- `companies.default_payment_terms_days` column
