# Pluralroaster

B2B ordering platform for [Plural Café](https://pluralcafe.co) — a specialty coffee roaster. Clients onboard, browse the catalog, place orders, and track deliveries. The admin side manages orders, packaging, invoicing (via Sellsy), stock, and Google Sheets exports.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 8 + TypeScript |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS |
| State | TanStack Query v5 + Zustand |
| Forms | react-hook-form + Zod |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Deployment | Vercel (SPA, all routes → index.html) |
| Invoicing | Sellsy v2 API |
| Orders | Shopify Admin API + webhooks |
| Exports | Google Sheets API (service account) |

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |

Edge function secrets (set in Supabase dashboard → Edge Functions → Secrets):

| Secret | Used by |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | sheets-export, export-invoicing-sheet, export-packaging-sheet |
| `GOOGLE_SHARE_EMAIL` | sheets-export, export-invoicing-sheet, export-packaging-sheet |
| `SHOPIFY_STORE_DOMAIN` | shopify-product-sync |
| `SHOPIFY_ADMIN_API_TOKEN` | shopify-product-sync |
| `SHOPIFY_WEBHOOK_SECRET` | shopify-webhook |
| `SELLSY_CLIENT_ID` | sellsy-sync |
| `SELLSY_CLIENT_SECRET` | sellsy-sync |
| `SELLSY_API_BASE_URL` | sellsy-sync (optional, defaults to `https://api.sellsy.com`) |
| `RESEND_API_KEY` | notify-new-order |

---

## Architecture

### User roles

| Role | Access |
|---|---|
| `client` | Catalog, cart, checkout, order history, account |
| `admin` | Everything above + admin dashboard (orders, packaging, roaster, invoicing, stock, team, clients, products) |
| `roaster` | Roaster dashboard (production view) |
| `packaging` | Packaging dashboard (packing view) |

Roles are stored in `user_roles` and assigned via `ensure_current_user_role` RPC on login.

### Client onboarding

New clients go through a 5-step onboarding flow before accessing the catalog:
1. Business info (company name, contact, phone)
2. Delivery (address, preferred days, time window)
3. Coffee preferences (type, volume, grinder)
4. Pricing (assigned tier, payment terms)
5. Confirmation

Progress is saved to Supabase after every step via the `user_save_onboarding_progress` SECURITY DEFINER RPC. Draft state is also persisted to localStorage between sessions.

### Data model (key tables)

```
companies          — client companies (replaces old client_onboarding)
contacts           — company contacts, linked to auth.users via user_id
company_addresses  — delivery addresses per company
orders             — all orders (app + Shopify)
order_items        — line items per order
order_status_history — status change audit log
products           — coffee products (synced from Shopify/Sellsy)
product_variants   — SKU variants per product
pricing_tiers      — client pricing tiers
roasted_stock      — roasted inventory per product
shopify_orders     — raw Shopify order payloads
sync_health_logs   — integration health check history
sheet_exports      — Google Sheets export history per month
```

RLS is enabled on all tables. Admins have full access; clients can only read their own company/contact/order data.

---

## Edge functions

| Function | Trigger | Purpose |
|---|---|---|
| `sellsy-sync` | Admin UI / manual | Multi-mode: `create-invoice` (live), `health-check` (live), `sync-products` / `sync-*-clients` (UI-hidden, ready) |
| `shopify-webhook` | Shopify webhook → POST | Receives order webhooks, deduplicates, creates internal orders + line items |
| `shopify-product-sync` | Admin UI | Pulls Shopify products/variants → upserts `products` + `product_variants` |
| `sheets-export` | OrdersView "Export" button | Creates a Google Sheet per month with all order line items |
| `export-invoicing-sheet` | Admin invoicing tab | Exports invoicing data to an admin-provided Google Sheet URL |
| `export-packaging-sheet` | Admin packaging tab | Exports packaging checklist to an admin-provided Google Sheet URL |
| `invite-user` | Admin team tab | Sends Supabase auth invite to a new user |
| `notify-new-order` | DB webhook on orders INSERT | Sends email to admin + confirmation to client via Resend |
| `api-health-check` | Admin System Health tab | Pings all integrations and logs results to `sync_health_logs` |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel and Supabase setup instructions.

```bash
npm run build        # production build → dist/
npm run preview      # serve dist/ locally
```

Branch conventions:
- `main` — stable, always deployable, auto-deployed to Vercel
- `saul/*` — Saul's feature branches
- `collab/*` — collaborator feature branches

PRs should target `main`. Never push directly to `main`.

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Dev-mode build (source maps) |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint |
| `npm run test` | Run Vitest once (CI) |
| `npm run test:watch` | Run Vitest in watch mode |
