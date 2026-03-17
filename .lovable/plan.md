
Goal: add a client list to the admin dashboard, including unique buyers, contact details, order summary, and Sellsy-backed client data.

What I found
- The current admin dashboard only shows stats, recent orders, and catalog.
- Orders in the app are not persisted in the backend and currently do not contain client/contact fields, so a meaningful client list cannot be derived from local orders alone.
- The existing backend sync function already talks to Sellsy and has a clean helper structure, so it is the right place to add a “fetch clients” mode.
- No backend table currently stores clients, and the dashboard currently reads only `products`.

Recommended approach
1. Extend the existing backend function with a new client-fetch path
   - Add Sellsy helper(s) for listing/searching clients/companies/contacts.
   - Normalize the Sellsy response into a simple dashboard shape:
     - id
     - name
     - email
     - phone
     - address / city / country
     - source/type if available
   - Return the list directly to the admin dashboard instead of storing it first.

2. Add a client list section to the admin dashboard
   - Add state for:
     - loading clients
     - client fetch error
     - client rows
   - Load clients on dashboard mount, alongside products.
   - Add a “Clients” card/table section below or beside the existing tables.
   - Use the existing table UI pattern for consistency.

3. Include order-summary columns where possible
   - Since local orders do not include buyer identity, order metrics should be computed only when Sellsy returns them, or shown as placeholders until order/customer persistence exists.
   - If Sellsy client data includes turnover/order counts, surface:
     - total orders
     - total spend
     - last order date
   - Otherwise render em dashes and keep the UI ready for future enrichment.

4. Keep admin-only access
   - Reuse the current admin-protected backend function.
   - No schema change is strictly required for the first version if the client list is read live from Sellsy.

Technical details
- Frontend files likely affected:
  - `src/pages/AdminDashboard.tsx`
  - optionally reuse `src/components/ui/table.tsx`
- Backend file likely affected:
  - `supabase/functions/sellsy-sync/index.ts`
- Suggested implementation shape:
  - Add types like `SellsyClientRow` and `AdminClientRow`
  - Add helpers such as:
    - `fetchSellsyClients(accessToken)`
    - `extractClientEmail(...)`
    - `extractClientPhone(...)`
    - `extractClientAddress(...)`
    - `normalizeClient(...)`
  - Add a new request mode:
    - `{ mode: "list-clients" }`
  - In `AdminDashboard`, call the function via `supabase.functions.invoke("sellsy-sync", { body: { mode: "list-clients" } })`

Why this approach
- Matches the user’s requested scope, especially “Sellsy clients”.
- Avoids inventing fake client data from orders that currently lack customer fields.
- Reuses the existing backend integration and admin authorization.
- Keeps the first version fast to ship without requiring database schema changes.

Likely limitations / follow-up
- If Sellsy’s exact client endpoint shape differs, the helper will need a small compatibility layer similar to the products logic.
- If you want sortable/searchable clients or historical metrics independent of Sellsy availability, the next step would be adding a `clients` table and syncing it into the backend.
- If you want client summaries based on your own orders, checkout/order creation must first capture and persist customer identity fields.

Implementation plan
1. Update the backend sync function to support fetching Sellsy clients with normalized contact fields.
2. Add dashboard client state and load the client list on mount.
3. Render a new “Clients” table with name, email, phone, address, and summary columns.
4. Gracefully handle empty/error/loading states.
5. Leave hooks/placeholders for richer order metrics if Sellsy provides them.

<lov-actions>
<lov-suggestion message="Test the admin dashboard end-to-end and verify the new client list loads correctly for an admin account">Verify that it works</lov-suggestion>
<lov-suggestion message="Add search and filters to the dashboard client list so admins can quickly find customers by name, email, or city">Add Client Search</lov-suggestion>
<lov-suggestion message="Persist synced Sellsy clients in the backend database so the admin dashboard can load faster and keep a history">Store Clients in Backend</lov-suggestion>
<lov-suggestion message="Capture customer details during checkout and link orders to clients so the dashboard can show accurate order counts and spend per client">Link Orders to Clients</lov-suggestion>
<lov-suggestion message="Add a client detail drawer in the admin dashboard showing contact info, recent orders, and total spend">Add Client Detail View</lov-suggestion>
</lov-actions>
