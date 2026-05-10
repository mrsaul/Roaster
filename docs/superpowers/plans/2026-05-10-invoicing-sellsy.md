# Invoicing — Sellsy Draft Invoice Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Invoicing section to the Admin dashboard that lists all `delivered` orders and lets admins push each one as a draft invoice to Sellsy API v2.

**Architecture:** Extend the existing `sellsy-sync` edge function with a `mode: "create-invoice"` handler that reuses `getSellsyAccessToken()` and `fetchSellsy()`. Rebuild `InvoicingView.tsx` from scratch as a self-contained component with its own data fetching. Wire it into `AdminDashboard.tsx` by uncommenting the tab.

**Tech Stack:** React + TypeScript (Vite), Supabase (PostgreSQL + edge functions), Deno, Sellsy API v2, shadcn/ui components.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260510000001_invoicing_columns.sql` | Create | Add invoice tracking columns to `orders`; add `sellsy_tax_id` + `sellsy_tax_rate` to `products` |
| `supabase/functions/sellsy-sync/index.ts` | Modify | (1) Add tax fields to `ProductRow` + `normalizeProduct`; (2) Add `handleCreateInvoice()` + router case |
| `src/components/InvoicingView.tsx` | Full rewrite | Self-contained invoicing UI: filter bar, table, preview modal, bulk send |
| `src/pages/AdminDashboard.tsx` | Modify | Uncomment Invoicing tab + badge; import + render `<InvoicingView>`; remove stub types |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260510000001_invoicing_columns.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Add invoice tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sellsy_invoice_id     TEXT,
  ADD COLUMN IF NOT EXISTS sellsy_invoice_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS sellsy_invoice_error  TEXT,
  ADD COLUMN IF NOT EXISTS invoiced_at           TIMESTAMPTZ;

-- Valid values: not_sent | draft | sent | paid | error
COMMENT ON COLUMN public.orders.sellsy_invoice_status IS 'not_sent | draft | sent | paid | error';

-- Add Sellsy tax fields to products (populated during product sync)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sellsy_tax_id   TEXT,
  ADD COLUMN IF NOT EXISTS sellsy_tax_rate NUMERIC(5,2);
```

- [ ] **Step 2: Apply the migration locally**

```bash
supabase db push
```

Expected: migration applies cleanly with "1 migration applied" or similar output. If Supabase CLI isn't configured for push, apply via Supabase dashboard SQL editor instead.

- [ ] **Step 3: Verify columns exist**

Run in Supabase SQL editor or via CLI:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('sellsy_invoice_id','sellsy_invoice_status','sellsy_invoice_error','invoiced_at');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('sellsy_tax_id','sellsy_tax_rate');
```

Expected: 4 rows for orders, 2 rows for products.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260510000001_invoicing_columns.sql
git commit -m "feat: add invoice tracking columns to orders and tax fields to products"
```

---

## Task 2: Product Sync — Capture Tax ID and Rate

**Files:**
- Modify: `supabase/functions/sellsy-sync/index.ts` (ProductRow type ~line 19, normalizeProduct ~line 575)

- [ ] **Step 1: Update `ProductRow` type to include tax fields**

Find this block (lines ~19–29):
```typescript
type ProductRow = {
  sellsy_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  synced_at: string;
};
```

Replace with:
```typescript
type ProductRow = {
  sellsy_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  origin: string | null;
  roast_level: string | null;
  price_per_kg: number;
  is_active: boolean;
  synced_at: string;
  sellsy_tax_id: string | null;
  sellsy_tax_rate: number | null;
};
```

- [ ] **Step 2: Update `normalizeProduct()` to capture tax fields**

Find the `normalizeProduct` function return statement (~line 580). The current `row` object ends with `synced_at: new Date().toISOString()`. Add two fields:

```typescript
function normalizeProduct(product: JsonRecord) {
  const sellsyId = String(product.id ?? product.sellsy_id ?? product.reference ?? crypto.randomUUID());
  const description = typeof product.description === "string" ? product.description : null;
  const { price, parseError } = extractProductPrice(product);

  // Extract tax info from Sellsy product response
  const taxes = Array.isArray(product.taxes) ? product.taxes : [];
  const firstTax = taxes[0] && typeof taxes[0] === "object" ? taxes[0] as JsonRecord : null;
  const sellsyTaxId = firstTax ? (typeof firstTax.id === "string" ? firstTax.id : String(firstTax.id ?? "")) || null : null;
  const sellsyTaxRate = firstTax && firstTax.rate != null ? Number(firstTax.rate) : null;

  return {
    row: {
      sellsy_id: sellsyId,
      sku: product.sku ? String(product.sku) : product.reference ? String(product.reference) : null,
      name: String(product.name ?? product.label ?? product.designation),
      description,
      origin: product.origin ? String(product.origin) : null,
      roast_level: inferRoastLevel(product, description),
      price_per_kg: price,
      is_active: product.is_active === false ? false : product.active === false ? false : true,
      synced_at: new Date().toISOString(),
      sellsy_tax_id: sellsyTaxId,
      sellsy_tax_rate: sellsyTaxRate,
    } satisfies ProductRow,
    parseError,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/saulsuaza/Documents/CLAUDE\ CODE\ PROJECTS/pluralroaster
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sellsy-sync/index.ts
git commit -m "feat: capture sellsy_tax_id and sellsy_tax_rate during product sync"
```

---

## Task 3: Edge Function — `create-invoice` Handler

**Files:**
- Modify: `supabase/functions/sellsy-sync/index.ts` (add handler function + router case)

This task adds `handleCreateInvoice()` — a new async function inside the edge function that: loads order data from Supabase, builds the Sellsy invoice payload, POSTs it to Sellsy API v2, and writes the result back to the `orders` table.

- [ ] **Step 1: Add `handleCreateInvoice` function**

Find the line near the end of the file where other `handle*` functions end, just before the main router/handler function (look for the `serve(` call or the main `handler` export). Insert the following complete function before it:

```typescript
async function handleCreateInvoice(
  supabaseClient: ReturnType<typeof createClient>,
  body: JsonRecord,
): Promise<Response> {
  const orderId = typeof body.order_id === "string" ? body.order_id : null;
  const note = typeof body.note === "string" ? body.note : "";
  const subject = typeof body.subject === "string" ? body.subject : `Order #${String(orderId ?? "").slice(0, 8)}`;
  const dueDate = typeof body.due_date === "string" ? body.due_date : null;

  if (!orderId) {
    return new Response(JSON.stringify({ success: false, error: "order_id is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Load order + order_items + products
  const { data: order, error: orderErr } = await supabaseClient
    .from("orders")
    .select(`
      id, user_id, created_at, total_price,
      order_items (
        id, product_name, quantity, price_per_kg,
        products ( sellsy_id, sellsy_tax_id, sellsy_tax_rate, name )
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ success: false, error: orderErr?.message ?? "Order not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Load company + contact via user_id
  const { data: contactRow, error: contactErr } = await supabaseClient
    .from("contacts")
    .select("sellsy_contact_id, companies ( sellsy_id )")
    .eq("user_id", order.user_id)
    .maybeSingle();

  if (contactErr) {
    return new Response(JSON.stringify({ success: false, error: contactErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const companySellsyId = (contactRow?.companies as JsonRecord | null)?.sellsy_id;
  const contactSellsyId = contactRow?.sellsy_contact_id ?? null;

  if (!companySellsyId) {
    return new Response(JSON.stringify({ success: false, error: "Company has no Sellsy ID — sync the client first" }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Build invoice rows
  const items: JsonRecord[] = ((order as any).order_items ?? []).map((item: any) => {
    const product = item.products ?? {};
    const hasItem = Boolean(product.sellsy_id);

    if (hasItem) {
      const row: JsonRecord = {
        type: "item",
        item_id: String(product.sellsy_id),
        description: String(item.product_name ?? product.name ?? ""),
        unit_amount: Number(item.price_per_kg),
        quantity: Number(item.quantity),
        discount: 0,
        discount_type: "percent",
      };
      if (product.sellsy_tax_id) {
        row.tax_id = String(product.sellsy_tax_id);
      }
      return row;
    }

    return {
      type: "once",
      description: String(item.product_name ?? "Product"),
      unit_amount: Number(item.price_per_kg),
      quantity: Number(item.quantity),
      discount: 0,
      discount_type: "percent",
    };
  });

  // 4. Build invoice date — today
  const today = new Date().toISOString().slice(0, 10);
  const dueDateFinal = dueDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const payload: JsonRecord = {
    company_id: String(companySellsyId),
    date: today,
    due_date: dueDateFinal,
    subject,
    currency: "EUR",
    note,
    rows: items,
  };

  if (contactSellsyId) {
    payload.contact_id = String(contactSellsyId);
  }

  // 5. POST to Sellsy
  let token: string;
  try {
    token = await getSellsyAccessToken();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: `Sellsy auth failed: ${String(e)}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sellsyRes = await fetchSellsy("/v2/invoices", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!sellsyRes.ok) {
    const errText = await sellsyRes.text();
    return new Response(JSON.stringify({ success: false, error: `Sellsy API error ${sellsyRes.status}: ${errText}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sellsyData = await sellsyRes.json() as JsonRecord;
  const invoiceId = String((sellsyData as any)?.data?.id ?? "");
  const invoiceUrl = String((sellsyData as any)?.data?._links?.self?.href ?? "");

  // 6. Update orders row
  await supabaseClient.from("orders").update({
    sellsy_invoice_id: invoiceId,
    sellsy_invoice_status: "draft",
    sellsy_invoice_error: null,
    invoiced_at: new Date().toISOString(),
  }).eq("id", orderId);

  return new Response(JSON.stringify({ success: true, invoice_id: invoiceId, invoice_url: invoiceUrl }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Add router case for `create-invoice` mode**

Find the router section in the main handler (look for `if (body?.mode === "sync-products")` or similar `mode` checks). Add a new case for `create-invoice` before the unknown-mode fallback:

```typescript
if (body?.mode === "create-invoice") {
  return await handleCreateInvoice(supabaseAdminClient, body);
}
```

Place this alongside the other `mode` checks (e.g., after `sync-clients`, before the final fallback that returns a 400 for unknown modes).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sellsy-sync/index.ts
git commit -m "feat: add create-invoice handler to sellsy-sync edge function"
```

---

## Task 4: Rebuild `InvoicingView` Component

**Files:**
- Modify: `src/components/InvoicingView.tsx` (full rewrite — current file is Google Sheets wired, 555 lines)

This is the largest task. The new component is fully self-contained: it fetches its own data, renders a filter bar + table, opens a preview modal, and handles both single and bulk invoice pushes. The Google Sheets export functionality is NOT preserved (it was never shipped and is out of scope per the spec).

- [ ] **Step 1: Write the complete `InvoicingView.tsx` file**

Replace the entire file with:

```typescript
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addDays } from "date-fns";
import { Search, Send, ChevronDown, Loader2, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoicingStatus = "not_sent" | "draft" | "sent" | "paid" | "error";

type ProductInfo = {
  sellsy_id: string | null;
  sellsy_tax_id: string | null;
  sellsy_tax_rate: number | null;
  name: string | null;
};

type OrderItem = {
  id: string;
  product_name: string | null;
  quantity: number;
  price_per_kg: number;
  products: ProductInfo | null;
};

export type InvoicingOrder = {
  id: string;
  user_id: string;
  created_at: string;
  delivery_date: string | null;
  total_price: number;
  status: string;
  sellsy_invoice_id: string | null;
  sellsy_invoice_status: InvoicingStatus;
  sellsy_invoice_error: string | null;
  invoiced_at: string | null;
  order_items: OrderItem[];
  // From contacts → companies join
  company_name: string | null;
  company_sellsy_id: string | null;
  contact_sellsy_id: string | null;
};

interface InvoicingViewProps {
  onBadgeCount?: (n: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string | null): string {
  if (!val) return "—";
  try { return format(parseISO(val), "MMM d, yyyy"); } catch { return "—"; }
}

function defaultDueDate(): string {
  return format(addDays(new Date(), 30), "yyyy-MM-dd");
}

function statusBadge(status: InvoicingStatus, errorMsg?: string | null) {
  const configs: Record<InvoicingStatus, { label: string; className: string }> = {
    not_sent: { label: "Not sent",  className: "bg-gray-100 text-gray-600 border-gray-200" },
    draft:    { label: "Draft",     className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    sent:     { label: "Sent",      className: "bg-blue-100 text-blue-700 border-blue-200" },
    paid:     { label: "Paid",      className: "bg-green-100 text-green-700 border-green-200" },
    error:    { label: "Error",     className: "bg-red-100 text-red-700 border-red-200" },
  };
  const cfg = configs[status] ?? configs.not_sent;
  return (
    <span title={status === "error" && errorMsg ? errorMsg : undefined}>
      <Badge variant="outline" className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>
    </span>
  );
}

// ─── VAT calculation helpers ──────────────────────────────────────────────────

type VatGroup = { rate: number | null; amount: number };

function computeTotals(items: OrderItem[]): {
  subtotalHT: number;
  vatGroups: VatGroup[];
  totalTTC: number;
} {
  const subtotalHT = items.reduce((s, i) => s + i.quantity * i.price_per_kg, 0);
  const vatMap = new Map<number | null, number>();
  for (const item of items) {
    const rate = item.products?.sellsy_tax_rate ?? null;
    const lineHT = item.quantity * item.price_per_kg;
    const vatAmount = rate != null ? lineHT * (rate / 100) : 0;
    vatMap.set(rate, (vatMap.get(rate) ?? 0) + vatAmount);
  }
  const vatGroups: VatGroup[] = Array.from(vatMap.entries()).map(([rate, amount]) => ({ rate, amount }));
  const totalVat = vatGroups.reduce((s, g) => s + g.amount, 0);
  return { subtotalHT, vatGroups, totalTTC: subtotalHT + totalVat };
}

// ─── PreviewModal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  order: InvoicingOrder;
  onClose: () => void;
  onSend: (orderId: string, subject: string, note: string, dueDate: string) => Promise<void>;
  sending: boolean;
}

function PreviewModal({ order, onClose, onSend, sending }: PreviewModalProps) {
  const [subject, setSubject] = useState(`Order #${order.id.slice(0, 8)}`);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());

  const { subtotalHT, vatGroups, totalTTC } = computeTotals(order.order_items);
  const hasNoSellsyCompany = !order.company_sellsy_id;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview — Order #{order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        {hasNoSellsyCompany && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>This company has no Sellsy ID. Sync the client with Sellsy before sending an invoice.</span>
          </div>
        )}

        {/* Client block */}
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
          <p className="font-medium">{order.company_name ?? "Unknown company"}</p>
          {order.company_sellsy_id && (
            <p className="text-xs text-muted-foreground">Sellsy company ID: {order.company_sellsy_id}</p>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note for this invoice..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-48" />
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty (kg)</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit HT</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">VAT</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Line HT</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item) => {
                const lineHT = item.quantity * item.price_per_kg;
                const taxRate = item.products?.sellsy_tax_rate;
                return (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {item.product_name ?? "—"}
                      {!item.products?.sellsy_id && (
                        <span className="ml-1 text-xs text-muted-foreground">(no Sellsy item)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">€{item.price_per_kg.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {taxRate != null ? `${taxRate}%` : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">€{lineHT.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="space-y-1 text-sm border-t border-border pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal HT</span>
            <span className="tabular-nums font-medium">€{subtotalHT.toFixed(2)}</span>
          </div>
          {vatGroups.map((g) => (
            <div key={String(g.rate)} className="flex justify-between text-muted-foreground">
              <span>VAT {g.rate != null ? `${g.rate}%` : "(unknown rate)"}</span>
              <span className="tabular-nums">€{g.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
            <span>Total TTC</span>
            <span className="tabular-nums">€{totalTTC.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            onClick={() => void onSend(order.id, subject, note, dueDate)}
            disabled={hasNoSellsyCompany || sending}
          >
            {sending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="mr-2 h-4 w-4" /> Send Draft to Sellsy</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BulkResultDialog ─────────────────────────────────────────────────────────

interface BulkResult {
  succeeded: number;
  failed: { orderId: string; error: string }[];
}

function BulkResultDialog({ result, onClose }: { result: BulkResult; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk send complete</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span>{result.succeeded} invoice{result.succeeded !== 1 ? "s" : ""} created as draft</span>
          </div>
          {result.failed.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-destructive">{result.failed.length} failed:</p>
              {result.failed.map((f) => (
                <p key={f.orderId} className="text-xs text-muted-foreground pl-2">
                  #{f.orderId.slice(0, 8)}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main InvoicingView ───────────────────────────────────────────────────────

export function InvoicingView({ onBadgeCount }: InvoicingViewProps) {
  const { toast } = useToast();

  // Data
  const [orders, setOrders] = useState<InvoicingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoicingStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // UI state
  const [previewOrder, setPreviewOrder] = useState<InvoicingOrder | null>(null);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orderRows, error: ordersErr } = await supabase
        .from("orders")
        .select(`
          id, user_id, created_at, delivery_date, total_price, status,
          sellsy_invoice_id, sellsy_invoice_status, sellsy_invoice_error, invoiced_at,
          order_items (
            id, product_name, quantity, price_per_kg,
            products ( sellsy_id, sellsy_tax_id, sellsy_tax_rate, name )
          )
        `)
        .eq("status", "delivered")
        .order("delivery_date", { ascending: false });

      if (ordersErr) throw ordersErr;

      const userIds = [...new Set((orderRows ?? []).map((o: any) => o.user_id).filter(Boolean))];

      let contactMap: Map<string, { company_name: string | null; company_sellsy_id: string | null; contact_sellsy_id: string | null }> = new Map();

      if (userIds.length > 0) {
        const { data: contactRows, error: contactsErr } = await supabase
          .from("contacts")
          .select("user_id, sellsy_contact_id, companies ( name, sellsy_id )")
          .in("user_id", userIds);

        if (contactsErr) throw contactsErr;

        for (const row of contactRows ?? []) {
          const co = (row as any).companies as { name: string | null; sellsy_id: string | null } | null;
          contactMap.set(row.user_id, {
            company_name: co?.name ?? null,
            company_sellsy_id: co?.sellsy_id ?? null,
            contact_sellsy_id: (row as any).sellsy_contact_id ?? null,
          });
        }
      }

      const mapped: InvoicingOrder[] = (orderRows ?? []).map((o: any) => {
        const contact = contactMap.get(o.user_id) ?? { company_name: null, company_sellsy_id: null, contact_sellsy_id: null };
        return {
          id: o.id,
          user_id: o.user_id,
          created_at: o.created_at,
          delivery_date: o.delivery_date,
          total_price: Number(o.total_price),
          status: o.status,
          sellsy_invoice_id: o.sellsy_invoice_id ?? null,
          sellsy_invoice_status: (o.sellsy_invoice_status ?? "not_sent") as InvoicingStatus,
          sellsy_invoice_error: o.sellsy_invoice_error ?? null,
          invoiced_at: o.invoiced_at ?? null,
          order_items: (o.order_items ?? []).map((i: any) => ({
            id: i.id,
            product_name: i.product_name ?? null,
            quantity: Number(i.quantity),
            price_per_kg: Number(i.price_per_kg),
            products: i.products ? {
              sellsy_id: i.products.sellsy_id ?? null,
              sellsy_tax_id: i.products.sellsy_tax_id ?? null,
              sellsy_tax_rate: i.products.sellsy_tax_rate != null ? Number(i.products.sellsy_tax_rate) : null,
              name: i.products.name ?? null,
            } : null,
          })),
          company_name: contact.company_name,
          company_sellsy_id: contact.company_sellsy_id,
          contact_sellsy_id: contact.contact_sellsy_id,
        };
      });

      setOrders(mapped);

      // Update badge count
      const notSentCount = mapped.filter((o) => o.sellsy_invoice_status === "not_sent").length;
      onBadgeCount?.(notSentCount);
    } catch (err) {
      toast({ title: "Failed to load orders", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, onBadgeCount]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // ── Send invoice (single) ─────────────────────────────────────────────────

  const sendInvoice = useCallback(async (
    orderId: string,
    subject: string,
    note: string,
    dueDate: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setSendingIds((prev) => new Set([...prev, orderId]));
    try {
      const { data, error } = await supabase.functions.invoke("sellsy-sync", {
        body: { mode: "create-invoice", order_id: orderId, subject, note, due_date: dueDate },
      });

      if (error || !data?.success) {
        const msg = data?.error ?? error?.message ?? "Unknown error";
        await supabase.from("orders").update({
          sellsy_invoice_status: "error",
          sellsy_invoice_error: msg,
        }).eq("id", orderId);
        setOrders((prev) => prev.map((o) => o.id === orderId
          ? { ...o, sellsy_invoice_status: "error", sellsy_invoice_error: msg }
          : o));
        return { success: false, error: msg };
      }

      setOrders((prev) => prev.map((o) => o.id === orderId
        ? { ...o, sellsy_invoice_status: "draft", sellsy_invoice_id: data.invoice_id, invoiced_at: new Date().toISOString() }
        : o));
      onBadgeCount?.(orders.filter((o) => o.id !== orderId && o.sellsy_invoice_status === "not_sent").length);
      return { success: true };
    } finally {
      setSendingIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }, [orders, onBadgeCount]);

  // ── Send + close modal ────────────────────────────────────────────────────

  const handleModalSend = useCallback(async (
    orderId: string, subject: string, note: string, dueDate: string,
  ) => {
    const result = await sendInvoice(orderId, subject, note, dueDate);
    if (result.success) {
      toast({ title: "Invoice created as draft in Sellsy" });
      setPreviewOrder(null);
    } else {
      toast({ title: "Failed to create invoice", description: result.error, variant: "destructive" });
    }
  }, [sendInvoice, toast]);

  // ── Bulk send ─────────────────────────────────────────────────────────────

  const handleBulkSend = useCallback(async () => {
    const toSend = orders.filter(
      (o) => selected.has(o.id) && !["draft", "sent", "paid"].includes(o.sellsy_invoice_status),
    );
    if (toSend.length === 0) return;

    setBulkProgress({ current: 0, total: toSend.length });
    const result: BulkResult = { succeeded: 0, failed: [] };

    for (let i = 0; i < toSend.length; i++) {
      const order = toSend[i];
      setBulkProgress({ current: i + 1, total: toSend.length });
      const subject = `Order #${order.id.slice(0, 8)}`;
      const res = await sendInvoice(order.id, subject, "", defaultDueDate());
      if (res.success) {
        result.succeeded++;
      } else {
        result.failed.push({ orderId: order.id, error: res.error ?? "Unknown error" });
      }
      if (i < toSend.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setBulkProgress(null);
    setBulkResult(result);
    setSelected(new Set());
  }, [orders, selected, sendInvoice]);

  // ── Manual status update ──────────────────────────────────────────────────

  const updateStatus = useCallback(async (orderId: string, newStatus: InvoicingStatus) => {
    const { error } = await supabase.from("orders")
      .update({ sellsy_invoice_status: newStatus })
      .eq("id", orderId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, sellsy_invoice_status: newStatus } : o));
  }, [toast]);

  // ── Filtered orders ───────────────────────────────────────────────────────

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.sellsy_invoice_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchesId = o.id.toLowerCase().includes(q);
      const matchesClient = (o.company_name ?? "").toLowerCase().includes(q);
      if (!matchesId && !matchesClient) return false;
    }
    if (dateFrom && o.delivery_date && o.delivery_date < dateFrom) return false;
    if (dateTo && o.delivery_date && o.delivery_date > dateTo) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((o) => s.delete(o.id)); return s; });
    } else {
      setSelected((prev) => new Set([...prev, ...filtered.map((o) => o.id)]));
    }
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const selectedCount = [...selected].filter((id) => filtered.some((o) => o.id === id)).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Invoicing</h2>
        <div className="flex items-center gap-2">
          {bulkProgress && (
            <span className="text-sm text-muted-foreground">
              Sending {bulkProgress.current}/{bulkProgress.total} invoices…
            </span>
          )}
          {selectedCount > 0 && !bulkProgress && (
            <Button size="sm" onClick={() => void handleBulkSend()} disabled={Boolean(bulkProgress)}>
              <Send className="mr-2 h-4 w-4" />
              Send selected ({selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Search order # or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2.5 top-2.5" onClick={() => setSearch("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoicingStatus | "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_sent">Not sent</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-36"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <Input
          type="date"
          className="w-36"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading orders…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No delivered orders found.</div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Order #</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Delivery date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Products</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total HT</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const isSending = sendingIds.has(order.id);
                const isAlreadySent = ["draft", "sent", "paid"].includes(order.sellsy_invoice_status);
                const productNames = order.order_items
                  .map((i) => i.product_name ?? "—")
                  .join(", ");

                return (
                  <tr key={order.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleOne(order.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{order.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(order.delivery_date)}</td>
                    <td className="px-3 py-2">{order.company_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={productNames}>{productNames}</td>
                    <td className="px-3 py-2 text-right tabular-nums">€{order.total_price.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {statusBadge(order.sellsy_invoice_status, order.sellsy_invoice_error)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {/* Preview / Send button */}
                        <Button
                          size="sm"
                          variant={isAlreadySent ? "outline" : "default"}
                          className="h-7 text-xs"
                          onClick={() => setPreviewOrder(order)}
                          disabled={isSending}
                        >
                          {isSending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            isAlreadySent ? "Preview" : "Preview / Send"
                          )}
                        </Button>

                        {/* Manual status dropdown */}
                        {(order.sellsy_invoice_status === "draft" || order.sellsy_invoice_status === "sent") && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0">
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {order.sellsy_invoice_status === "draft" && (
                                <DropdownMenuItem onClick={() => void updateStatus(order.id, "sent")}>
                                  Mark as Sent
                                </DropdownMenuItem>
                              )}
                              {order.sellsy_invoice_status === "sent" && (
                                <DropdownMenuItem onClick={() => void updateStatus(order.id, "paid")}>
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {previewOrder && (
        <PreviewModal
          order={previewOrder}
          onClose={() => setPreviewOrder(null)}
          onSend={handleModalSend}
          sending={sendingIds.has(previewOrder.id)}
        />
      )}

      {/* Bulk result dialog */}
      {bulkResult && (
        <BulkResultDialog
          result={bulkResult}
          onClose={() => setBulkResult(null)}
        />
      )}
    </div>
  );
}

export default InvoicingView;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/InvoicingView.tsx
git commit -m "feat: rebuild InvoicingView for Sellsy draft invoice push"
```

---

## Task 5: Wire `AdminDashboard.tsx`

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`

Five targeted edits:
1. Replace the commented-out import stub + inline type stubs (lines 2–11) with a real import
2. Add `"invoicing"` to `AdminSection` type and `VALID_ADMIN_SECTIONS`
3. Add `"invoicing"` to `sectionLabels`
4. Add `invoicingBadge` state + uncomment the `menuSubItems` entry
5. Replace the commented-out `{activeSection === "invoicing"}` block with the real render

- [ ] **Step 1: Replace import stubs and inline type stubs**

Find (lines 2–11):
```typescript
// HIDDEN — Sellsy — preserved for future use
// import { InvoicingView, type InvoicingOrder, type InvoicingStatus } from "@/components/InvoicingView";
type InvoicingStatus = "not_sent" | "sent" | "error";
type InvoicingOrder = {
  id: string; user_id: string; client_name: string | null; user_email: string | null;
  delivery_date: string; total_kg: number; total_price: number; status: OrderStatus;
  sellsy_id: string | null; invoicing_status: InvoicingStatus; last_invoice_sync: string | null;
  has_sellsy_client_id: boolean;
  items: { product_name: string; quantity: number; price_per_kg: number }[];
};
```

Replace with:
```typescript
import { InvoicingView } from "@/components/InvoicingView";
```

- [ ] **Step 2: Add `"invoicing"` to `AdminSection` type and `VALID_ADMIN_SECTIONS`**

Find:
```typescript
// HIDDEN — Sellsy — "invoicing" section preserved for future use
type AdminSection = "orders" | "packaging" | "roaster" | "clients" | "products" | "team" | "profile" | "pricing" | "stock" | "health";
const VALID_ADMIN_SECTIONS: AdminSection[] = ["orders", "packaging", "roaster", "clients", "products", "team", "profile", "pricing", "stock", "health"];
```

Replace with:
```typescript
type AdminSection = "orders" | "packaging" | "roaster" | "invoicing" | "clients" | "products" | "team" | "profile" | "pricing" | "stock" | "health";
const VALID_ADMIN_SECTIONS: AdminSection[] = ["orders", "packaging", "roaster", "invoicing", "clients", "products", "team", "profile", "pricing", "stock", "health"];
```

- [ ] **Step 3: Add `invoicing` to `sectionLabels` and add badge state**

Find:
```typescript
  // HIDDEN — Sellsy — preserved for future use
  // const [invoiceSendingIds, setInvoiceSendingIds] = useState<Set<string>>(new Set());
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
```

Replace with:
```typescript
  const [invoicingBadge, setInvoicingBadge] = useState<number | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
```

Then find:
```typescript
  const sectionLabels: Record<string, string> = {
    orders: "Orders",
    packaging: "Packaging",
    roaster: "Roaster",
    // HIDDEN — Sellsy — preserved for future use
    // invoicing: "Invoicing",
    clients: "Clients",
```

Replace with:
```typescript
  const sectionLabels: Record<string, string> = {
    orders: "Orders",
    packaging: "Packaging",
    roaster: "Roaster",
    invoicing: "Invoicing",
    clients: "Clients",
```

- [ ] **Step 4: Uncomment `invoicingBadge` computation and `menuSubItems` entry**

Find:
```typescript
  // HIDDEN — Sellsy — preserved for future use
  // const invoicingBadge = adminOrders.filter((o) => ["ready_for_delivery", "delivered"].includes(o.status) && o.invoicing_status === "not_sent").length;
```

Remove those two lines entirely (the badge is now provided by `InvoicingView` via callback, so we don't compute it here).

Find:
```typescript
  const menuSubItems = [
    // HIDDEN — Sellsy — preserved for future use
    // { key: "invoicing" as const, icon: FileText, label: "Invoicing", badge: invoicingBadge > 0 ? invoicingBadge : null },
    { key: "clients" as const, icon: Users, label: "Clients", badge: null },
```

Replace with:
```typescript
  const menuSubItems = [
    { key: "invoicing" as const, icon: FileText, label: "Invoicing", badge: invoicingBadge != null && invoicingBadge > 0 ? invoicingBadge : null },
    { key: "clients" as const, icon: Users, label: "Clients", badge: null },
```

- [ ] **Step 5: Replace commented-out `activeSection === "invoicing"` block**

Find:
```typescript
            {/* HIDDEN — Sellsy — preserved for future use */}
            {/* {activeSection === "invoicing" && (
              <InvoicingView
                orders={invoicingOrders}
                onSendToSellsy={sendInvoiceToSellsy}
                onBulkSendToSellsy={bulkSendInvoices}
                sendingIds={invoiceSendingIds}
              />
            )} */}
```

Replace with:
```typescript
            {activeSection === "invoicing" && (
              <InvoicingView onBadgeCount={(n) => setInvoicingBadge(n)} />
            )}
```

- [ ] **Step 6: Remove the commented-out `invoicingOrders` useMemo block**

Find (lines ~745–758):
```typescript
  /* HIDDEN — Sellsy — preserved for future use
  const invoicingOrders: InvoicingOrder[] = useMemo(() =>
    adminOrders.map((o) => {
      const client = clients.find((c) => c.user_id === o.user_id);
      return {
        id: o.id, user_id: o.user_id, client_name: o.client_name, user_email: o.user_email,
        delivery_date: o.delivery_date, total_kg: o.total_kg, total_price: o.total_price,
        status: o.status, sellsy_id: o.sellsy_id, invoicing_status: o.invoicing_status,
        last_invoice_sync: o.last_invoice_sync, has_sellsy_client_id: Boolean(client?.sellsy_client_id),
        items: o.items.map((i) => ({ product_name: i.product_name, quantity: i.quantity, price_per_kg: i.price_per_kg })),
      };
    }), [adminOrders, clients],
  );
  */
```

Delete this entire block.

- [ ] **Step 7: Remove the commented-out `sendInvoiceToSellsy` / `bulkSendInvoices` block**

Find (lines ~404–407):
```typescript
  /* HIDDEN — Sellsy — preserved for future use
  const sendInvoiceToSellsy = useCallback(async (orderId: string) => { ... }, []);
  const bulkSendInvoices = useCallback(async (orderIds: string[]) => { ... }, []);
  */
```

Delete this entire block.

- [ ] **Step 8: Remove the commented-out `AdminOrder` field stubs**

Find in the `AdminOrder` type:
```typescript
  // HIDDEN — Sellsy — preserved for future use
  // sellsy_id: string | null;
```
and
```typescript
  // HIDDEN — Sellsy — preserved for future use
  // invoicing_status: InvoicingStatus;
  // last_invoice_sync: string | null;
```

Delete both comment blocks.

Find in `loadOrders()` the mapped object:
```typescript
          // HIDDEN — Sellsy — preserved for future use
          // sellsy_id: o.sellsy_id,
```
and
```typescript
          // HIDDEN — Sellsy — preserved for future use
          // invoicing_status: (o.invoicing_status as InvoicingStatus) ?? "not_sent",
          // last_invoice_sync: o.last_invoice_sync ?? null,
```

Delete both comment blocks.

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 10: Commit**

```bash
git add src/pages/AdminDashboard.tsx
git commit -m "feat: wire InvoicingView into AdminDashboard — Invoicing tab live"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| DB columns: `sellsy_invoice_id`, `sellsy_invoice_status`, `sellsy_invoice_error`, `invoiced_at` on `orders` | Task 1 |
| DB columns: `sellsy_tax_id`, `sellsy_tax_rate` on `products` | Task 1 |
| Product sync captures tax ID + rate from `/v2/items` | Task 2 |
| `create-invoice` mode in `sellsy-sync` edge function | Task 3 |
| Loads order + items + contact + company from Supabase | Task 3 |
| Posts to `POST /v2/invoices` | Task 3 |
| Updates `orders` row on success (`draft` status, `invoiced_at`) | Task 3 |
| Returns `{ success: true, invoice_id, invoice_url }` | Task 3 |
| On error: returns `{ success: false, error }` | Task 3 |
| Row type `"item"` if `sellsy_id` + `sellsy_tax_id` set | Task 3 |
| Row type `"once"` fallback if no `sellsy_id` | Task 3 |
| `InvoicingView` self-contained data fetch (no props from AdminDashboard) | Task 4 |
| Filter bar: search, status dropdown, date range | Task 4 |
| Table: Order # · Date · Client · Products · Total HT · Status · Actions | Task 4 |
| Status badges: not_sent / draft / sent / paid / error | Task 4 |
| Preview modal with editable subject / note / due_date | Task 4 |
| Warning banner if `company_sellsy_id` is null | Task 4 |
| Line items with VAT grouped by rate | Task 4 |
| Manual status promotion: draft → sent → paid | Task 4 |
| Bulk send: checkbox per row, select all, sequential with 500ms gap | Task 4 |
| Progress indicator during bulk send | Task 4 |
| End summary dialog with success/failure counts | Task 4 |
| `onBadgeCount` callback | Task 4 |
| AdminDashboard: Invoicing tab in nav | Task 5 |
| AdminDashboard: badge from callback | Task 5 |
| AdminDashboard: render `<InvoicingView>` | Task 5 |
| AdminDashboard: remove stub types | Task 5 |

All spec requirements are covered. ✅
