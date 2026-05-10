// ── PluralRoaster — Google Sheets Packaging Checklist Export ─────────────────
// The admin creates a Google Sheet, shares it with the service account as
// Editor, and pastes the URL on first use. The function creates:
//   • "Overview"       — summary of all approved/packaging orders
//   • One tab per delivery date  — print-optimized per-order checklist

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Google JWT auth ───────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function strToBase64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getGoogleAccessToken(serviceEmail: string, privateKeyPem: string): Promise<string> {
  const pem = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n").replace(/\n/g, "").replace(/\s/g, "").trim();

  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = strToBase64url(JSON.stringify({
    iss: serviceEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const sigInput = `${headerB64}.${payloadB64}`;
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput));

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${sigInput}.${base64url(sigBuf)}` }),
  });
  if (!resp.ok) throw new Error(`Google auth failed: ${await resp.text()}`);
  const { access_token } = (await resp.json()) as { access_token: string };
  return access_token;
}

// ── Sheets REST helpers ───────────────────────────────────────────────────────

async function sheetsApi(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Sheets ${method} ${path} → ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

type SheetMeta = { properties: { title: string; sheetId: number; index: number } };

async function getSheetsMeta(token: string, id: string): Promise<SheetMeta[]> {
  const data = (await sheetsApi(token, "GET", `/${id}?fields=sheets.properties`)) as { sheets: SheetMeta[] };
  return data.sheets ?? [];
}

async function clearRange(token: string, id: string, range: string): Promise<void> {
  await sheetsApi(token, "POST", `/${id}/values/${encodeURIComponent(range)}:clear`);
}
async function writeValues(token: string, id: string, range: string, values: unknown[][]): Promise<void> {
  await sheetsApi(token, "PUT", `/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { range, majorDimension: "ROWS", values });
}
async function batchFormat(token: string, id: string, requests: unknown[]): Promise<void> {
  await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests });
}

// ── Date tab helpers ──────────────────────────────────────────────────────────

/** Format an ISO date (YYYY-MM-DD) as a short tab label, e.g. "23 Apr 2026". */
function dateTabLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

/** Format an ISO date as a long display string, e.g. "Wednesday, 23 April 2026". */
function dateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Set up tabs: ensure "Overview" exists, then delete all old date tabs and
 * create fresh ones in delivery-date order. Returns a map of tabName → sheetId.
 */
async function setupTabs(token: string, id: string, dateKeys: string[]): Promise<Map<string, number>> {
  // Step 1 — ensure "Overview" at index 0
  let sheets = await getSheetsMeta(token, id);

  const hasOverview = sheets.some((s) => s.properties.title === "Overview");
  if (!hasOverview) {
    const first = sheets[0];
    const ensureReqs: unknown[] = first
      ? [{ updateSheetProperties: { properties: { sheetId: first.properties.sheetId, title: "Overview" }, fields: "title" } }]
      : [{ addSheet: { properties: { title: "Overview", index: 0 } } }];
    await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests: ensureReqs });
    sheets = await getSheetsMeta(token, id);
  }

  // Step 2 — delete all non-Overview tabs, then add fresh date tabs
  const batchReqs: unknown[] = [];

  for (const sheet of sheets) {
    if (sheet.properties.title !== "Overview") {
      batchReqs.push({ deleteSheet: { sheetId: sheet.properties.sheetId } });
    }
  }
  dateKeys.forEach((dateKey, i) => {
    batchReqs.push({ addSheet: { properties: { title: dateTabLabel(dateKey), index: i + 1 } } });
  });

  if (batchReqs.length > 0) {
    await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests: batchReqs });
  }

  // Step 3 — fetch final metadata and return map
  sheets = await getSheetsMeta(token, id);
  const tabMap = new Map<string, number>();
  for (const s of sheets) tabMap.set(s.properties.title, s.properties.sheetId);
  return tabMap;
}

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR = {
  darkBrown:   { red: 0.22, green: 0.14, blue: 0.09 },
  midBrown:    { red: 0.45, green: 0.28, blue: 0.15 },
  dateHeader:  { red: 0.16, green: 0.32, blue: 0.52 },  // deep blue for date dividers
  lightCream:  { red: 0.98, green: 0.96, blue: 0.91 },
  lightBlue:   { red: 0.91, green: 0.95, blue: 0.99 },
  tableHeader: { red: 0.24, green: 0.24, blue: 0.24 },
  rowAlt:      { red: 0.96, green: 0.96, blue: 0.96 },
  white:       { red: 1,    green: 1,    blue: 1    },
  signatureBg: { red: 0.94, green: 0.94, blue: 0.94 },
  notesBg:     { red: 0.99, green: 0.99, blue: 0.95 },
};

// ── Border helpers ────────────────────────────────────────────────────────────
const THICK  = { style: "SOLID_THICK",  color: COLOR.darkBrown };
const THIN   = { style: "SOLID",        color: { red: 0.7, green: 0.7, blue: 0.7 } };
const MEDIUM = { style: "SOLID_MEDIUM", color: COLOR.midBrown };

function outerBorder(sheetId: number, r0: number, r1: number, c0: number, c1: number) {
  return {
    updateBorders: {
      range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
      top: THICK, bottom: THICK, left: THICK, right: THICK,
    },
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderItem = {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  size_label: string | null;
};

type RawOrder = {
  id: string;
  user_id: string;
  delivery_date: string;
  status: string;
  total_kg: number;
  notes: string | null;
  is_roasted: boolean;
  is_packed: boolean;
  is_labeled: boolean;
  order_items: OrderItem[];
};

type ContactWithCompany = {
  user_id: string;
  company_name: string | null;
  address_line1: string | null;
};

// ── Build one packing-list tab (rows + format requests) ───────────────────────

function buildPackingTab(
  sheetId: number,
  orders: RawOrder[],
  getClientName: (uid: string) => string,
  getDeliveryAddress: (uid: string) => string,
): { rows: unknown[][]; formatReqs: unknown[] } {
  const NUM_COLS = 6;
  const rows: unknown[][] = [];
  const formatReqs: unknown[] = [];

  // Column widths: A=☐  B=Product  C=SKU  D=Qty  E=Unit  F=✓ Done
  const colWidths = [40, 280, 130, 80, 80, 120];
  colWidths.forEach((px, i) => {
    formatReqs.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    });
  });

  for (const order of orders) {
    const clientName    = getClientName(order.user_id);
    const deliveryAddr  = getDeliveryAddress(order.user_id);
    const statusLabel   = order.status === "approved" ? "Approved" : "Packaging";
    const items         = order.order_items ?? [];

    const sectionStart = rows.length;

    // Row 0 — order title
    rows.push([`ORDER  ${order.id.slice(0, 8).toUpperCase()}`, "", "", "", "", ""]);
    // Row 1 — client + status
    rows.push([`Client: ${clientName}`, "", "", "", `Status: ${statusLabel}`, ""]);
    // Row 2 — delivery address
    rows.push([`Address: ${deliveryAddr}`, "", "", "", "", ""]);
    // Row 3 — table header
    rows.push(["☐", "Product / Description", "SKU", "Qty (kg)", "Unit", "✓ Done"]);

    const itemsStartRow = rows.length;
    if (items.length === 0) {
      rows.push(["☐", "(no items)", "—", "—", "—", ""]);
    } else {
      for (const item of items) {
        const qty = Number(item.quantity);
        const unit = item.size_label ?? "kg";
        rows.push(["☐", item.product_name, item.product_sku ?? "—", qty % 1 === 0 ? String(qty) : qty.toFixed(2), unit, ""]);
      }
    }
    const itemsEndRow = rows.length;
    const itemCount   = itemsEndRow - itemsStartRow;

    // Notes row
    const notesText = order.notes ? `Notes: ${order.notes}` : "Notes / Remarques:";
    rows.push([notesText, "", "", "", "", ""]);
    // Signature row
    rows.push(["Packed by: _________________________________", "", "", "Checked by: _________________________________", "", ""]);
    // Separator
    rows.push(["", "", "", "", "", ""]);

    const sectionEnd   = rows.length;
    const headerRow0   = sectionStart;
    const headerRow1   = sectionStart + 1;
    const headerRow2   = sectionStart + 2;
    const tableHdrRow  = sectionStart + 3;
    const notesRow     = itemsEndRow;
    const sigRow       = itemsEndRow + 1;
    const sepRow       = itemsEndRow + 2;

    // ── Order title row ──
    formatReqs.push({
      mergeCells: { range: { sheetId, startRowIndex: headerRow0, endRowIndex: headerRow0 + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" },
    });
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow0, endRowIndex: headerRow0 + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.darkBrown, textFormat: { bold: true, fontSize: 14, foregroundColor: COLOR.white }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", padding: { left: 12, top: 8, bottom: 8 } } },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
      },
    });
    formatReqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: headerRow0, endIndex: headerRow0 + 1 }, properties: { pixelSize: 40 }, fields: "pixelSize" } });

    // ── Client row (A:D + E:F merged) ──
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } });
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1, startColumnIndex: 4, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow1, endRowIndex: headerRow1 + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.lightCream, textFormat: { bold: true, fontSize: 11 }, verticalAlignment: "MIDDLE", padding: { left: 10, top: 6, bottom: 6 } } },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
      },
    });

    // ── Address row (merged) ──
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: headerRow2, endRowIndex: headerRow2 + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow2, endRowIndex: headerRow2 + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.lightCream, textFormat: { fontSize: 10, italic: true }, verticalAlignment: "MIDDLE", padding: { left: 10, top: 4, bottom: 4 } } },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
      },
    });

    // ── Table header row ──
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: tableHdrRow, endRowIndex: tableHdrRow + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.tableHeader, textFormat: { bold: true, fontSize: 10, foregroundColor: COLOR.white }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      },
    });
    formatReqs.push({ updateBorders: { range: { sheetId, startRowIndex: tableHdrRow, endRowIndex: tableHdrRow + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, bottom: MEDIUM, top: THIN } });

    // ── Item rows ──
    for (let r = itemsStartRow; r < itemsEndRow; r++) {
      const isAlt = (r - itemsStartRow) % 2 === 1;
      formatReqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
          cell: { userEnteredFormat: { backgroundColor: isAlt ? COLOR.rowAlt : COLOR.white, textFormat: { fontSize: 11 }, verticalAlignment: "MIDDLE" } },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
        },
      });
      // Checkbox col — large + centered
      formatReqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { fontSize: 14 } } }, fields: "userEnteredFormat(horizontalAlignment,textFormat)" } });
      // Done col — centered
      formatReqs.push({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(horizontalAlignment)" } });
      // Row height
      formatReqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: r, endIndex: r + 1 }, properties: { pixelSize: 32 }, fields: "pixelSize" } });
      // Thin divider between items (except last)
      if (r < itemsEndRow - 1) {
        formatReqs.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, bottom: THIN } });
      }
    }

    // Thin vertical column dividers on table area
    for (let col = 1; col < NUM_COLS; col++) {
      formatReqs.push({ updateBorders: { range: { sheetId, startRowIndex: tableHdrRow, endRowIndex: itemsEndRow, startColumnIndex: col, endColumnIndex: col + 1 }, left: THIN } });
    }

    // ── Notes row ──
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: notesRow, endRowIndex: notesRow + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: notesRow, endRowIndex: notesRow + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.notesBg, textFormat: { italic: true, fontSize: 10 }, verticalAlignment: "MIDDLE", padding: { left: 10, top: 6, bottom: 6 }, wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding,wrapStrategy)",
      },
    });
    formatReqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: notesRow, endIndex: notesRow + 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } });

    // ── Signature row (A:C + D:F merged) ──
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: sigRow, endRowIndex: sigRow + 1, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: "MERGE_ALL" } });
    formatReqs.push({ mergeCells: { range: { sheetId, startRowIndex: sigRow, endRowIndex: sigRow + 1, startColumnIndex: 3, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
    formatReqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: sigRow, endRowIndex: sigRow + 1 },
        cell: { userEnteredFormat: { backgroundColor: COLOR.signatureBg, textFormat: { fontSize: 10, italic: true }, verticalAlignment: "MIDDLE", padding: { left: 10, top: 8, bottom: 8 } } },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)",
      },
    });
    formatReqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: sigRow, endIndex: sigRow + 1 }, properties: { pixelSize: 40 }, fields: "pixelSize" } });

    // ── Separator row height ──
    formatReqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: sepRow, endIndex: sepRow + 1 }, properties: { pixelSize: 20 }, fields: "pixelSize" } });

    // ── Thick outer border around section (header + table + notes + sig) ──
    formatReqs.push(outerBorder(sheetId, sectionStart, sigRow + 1, 0, NUM_COLS));
    // Extra thick bottom on sig row to visually close the section
    formatReqs.push({ updateBorders: { range: { sheetId, startRowIndex: sigRow, endRowIndex: sigRow + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, bottom: THICK } });
  }

  return { rows, formatReqs };
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey   = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!serviceEmail || !privateKey) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey        = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized — no auth header");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const db = createClient(supabaseUrl, serviceRoleKey);
    const { data: currentRole, error: roleErr } = await userClient.rpc("ensure_current_user_role");
    if (roleErr) throw new Error(`Role check failed: ${roleErr.message}`);
    if (currentRole !== "admin") throw new Error(`Admin only (your role: ${currentRole})`);

    // ── Request body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const bodySpreadsheetId = typeof body.spreadsheet_id === "string" ? body.spreadsheet_id.trim() : null;

    // ── Fetch orders ──────────────────────────────────────────────────────────
    const { data: ordersRaw, error: ordersErr } = await db
      .from("orders")
      .select(`
        id, user_id, delivery_date, status, total_kg, notes,
        is_roasted, is_packed, is_labeled,
        order_items ( product_name, product_sku, quantity, size_label )
      `)
      .in("status", ["approved", "packaging"])
      .order("delivery_date")
      .order("created_at");
    if (ordersErr) throw ordersErr;
    const orders = (ordersRaw ?? []) as RawOrder[];

    // ── Fetch client info via contacts → companies + company_addresses ────────
    const userIds = [...new Set(orders.map((o) => o.user_id))];
    const contactsRes = userIds.length > 0
      ? await db
          .from("contacts")
          .select("user_id, companies(name, company_addresses(label, address_line1))")
          .in("user_id", userIds)
      : { data: [] };

    const contactMap = new Map<string, ContactWithCompany>(
      ((contactsRes.data ?? []) as any[]).map((c) => {
        const company = c.companies as any;
        const deliveryAddr = (company?.company_addresses ?? []).find((a: any) => a.label === "Delivery");
        return [c.user_id, {
          user_id: c.user_id,
          company_name: company?.name ?? null,
          address_line1: deliveryAddr?.address_line1 ?? null,
        }];
      })
    );

    const getClientName = (uid: string): string => {
      const ct = contactMap.get(uid);
      return ct?.company_name ?? uid.slice(0, 8);
    };
    const getDeliveryAddress = (uid: string): string => {
      const ct = contactMap.get(uid);
      return ct?.address_line1 ?? "—";
    };

    // ── Group orders by delivery date ─────────────────────────────────────────
    const ordersByDate = new Map<string, RawOrder[]>();
    for (const order of orders) {
      if (!ordersByDate.has(order.delivery_date)) ordersByDate.set(order.delivery_date, []);
      ordersByDate.get(order.delivery_date)!.push(order);
    }
    const sortedDateKeys = [...ordersByDate.keys()].sort();

    // ── Google auth ───────────────────────────────────────────────────────────
    const token = await getGoogleAccessToken(serviceEmail, privateKey);

    // ── Resolve spreadsheet ───────────────────────────────────────────────────
    const SHEET_KEY = "packaging-current";
    const { data: existingExport } = await db.from("sheet_exports").select("spreadsheet_id, spreadsheet_url").eq("month_key", SHEET_KEY).maybeSingle();

    let spreadsheetId: string;
    let spreadsheetUrl: string;

    if (existingExport) {
      spreadsheetId  = existingExport.spreadsheet_id;
      spreadsheetUrl = existingExport.spreadsheet_url;
    } else if (bodySpreadsheetId) {
      spreadsheetId  = bodySpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      await db.from("sheet_exports").insert({ month_key: SHEET_KEY, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl, orders_count: orders.length });
    } else {
      throw new Error(
        `No packaging Google Sheet connected. Create a Google Sheet, share it with the service account (${serviceEmail}) as Editor, then paste the URL in the "Connect Packaging Sheet" field.`
      );
    }

    // ── Set up tabs: Overview + one per date ──────────────────────────────────
    const tabMap = await setupTabs(token, spreadsheetId, sortedDateKeys);

    const overviewSheetId = tabMap.get("Overview") ?? 0;

    // ── Build Overview tab ────────────────────────────────────────────────────
    await clearRange(token, spreadsheetId, "Overview!A1:ZZ10000");

    const exportedAt = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const overviewRows: unknown[][] = [
      [`PACKAGING OVERVIEW — Exported ${exportedAt}`, "", "", "", "", ""],
      [""],
      ["Client", "Order #", "Delivery Date", "# Products", "Total (kg)", "Status"],
    ];

    let totalKgAll = 0;
    for (const dateKey of sortedDateKeys) {
      const dayOrders = ordersByDate.get(dateKey)!;
      // Date subheader row
      overviewRows.push([dateLong(dateKey), "", "", "", "", ""]);
      for (const order of dayOrders) {
        overviewRows.push([
          getClientName(order.user_id),
          order.id.slice(0, 8).toUpperCase(),
          dateTabLabel(dateKey),
          order.order_items?.length ?? 0,
          `${Number(order.total_kg).toFixed(2)} kg`,
          order.status === "approved" ? "✓ Approved" : "📦 Packaging",
        ]);
        totalKgAll += Number(order.total_kg);
      }
    }
    overviewRows.push(["", "", "", ""]);
    overviewRows.push([`TOTAL: ${orders.length} order${orders.length !== 1 ? "s" : ""}`, "", "", "", `${totalKgAll.toFixed(2)} kg`, ""]);

    await writeValues(token, spreadsheetId, "Overview!A1", overviewRows);

    // ── Format Overview ───────────────────────────────────────────────────────
    const ovFmt: unknown[] = [];
    const NUM_COLS = 6;

    // Title row
    ovFmt.push({ mergeCells: { range: { sheetId: overviewSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
    ovFmt.push({ repeatCell: { range: { sheetId: overviewSheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR.darkBrown, textFormat: { bold: true, fontSize: 13, foregroundColor: COLOR.white }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } });
    ovFmt.push({ updateDimensionProperties: { range: { sheetId: overviewSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 40 }, fields: "pixelSize" } });

    // Column header row (row 2)
    ovFmt.push({ repeatCell: { range: { sheetId: overviewSheetId, startRowIndex: 2, endRowIndex: 3 }, cell: { userEnteredFormat: { backgroundColor: COLOR.tableHeader, textFormat: { bold: true, foregroundColor: COLOR.white }, verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)" } });

    // Freeze header rows
    ovFmt.push({ updateSheetProperties: { properties: { sheetId: overviewSheetId, gridProperties: { frozenRowCount: 3 } }, fields: "gridProperties.frozenRowCount" } });

    // Date subheader rows and data rows — build row index map
    let ovRowIdx = 3;
    for (const dateKey of sortedDateKeys) {
      const dayOrders = ordersByDate.get(dateKey)!;
      // Date subheader
      ovFmt.push({ mergeCells: { range: { sheetId: overviewSheetId, startRowIndex: ovRowIdx, endRowIndex: ovRowIdx + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: "MERGE_ALL" } });
      ovFmt.push({ repeatCell: { range: { sheetId: overviewSheetId, startRowIndex: ovRowIdx, endRowIndex: ovRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR.lightBlue, textFormat: { bold: true, fontSize: 11, italic: true }, verticalAlignment: "MIDDLE", padding: { left: 8, top: 5, bottom: 5 } } }, fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,padding)" } });
      ovRowIdx++;
      // Order rows
      for (let i = 0; i < dayOrders.length; i++) {
        const isAlt = i % 2 === 1;
        if (isAlt) {
          ovFmt.push({ repeatCell: { range: { sheetId: overviewSheetId, startRowIndex: ovRowIdx, endRowIndex: ovRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR.rowAlt } }, fields: "userEnteredFormat(backgroundColor)" } });
        }
        ovRowIdx++;
      }
    }

    // Total rows (blank + total)
    ovRowIdx++;
    ovFmt.push({ mergeCells: { range: { sheetId: overviewSheetId, startRowIndex: ovRowIdx, endRowIndex: ovRowIdx + 1, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } });
    ovFmt.push({ repeatCell: { range: { sheetId: overviewSheetId, startRowIndex: ovRowIdx, endRowIndex: ovRowIdx + 1 }, cell: { userEnteredFormat: { backgroundColor: COLOR.lightCream, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });

    // Auto-resize overview
    ovFmt.push({ autoResizeDimensions: { dimensions: { sheetId: overviewSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: NUM_COLS } } });

    await batchFormat(token, spreadsheetId, ovFmt);

    // ── Build & format each date tab ──────────────────────────────────────────
    const BATCH_SIZE = 40;

    for (const dateKey of sortedDateKeys) {
      const tabLabel  = dateTabLabel(dateKey);
      const tabSheetId = tabMap.get(tabLabel);
      if (tabSheetId === undefined) continue;

      const dayOrders = ordersByDate.get(dateKey)!;
      const { rows, formatReqs } = buildPackingTab(tabSheetId, dayOrders, getClientName, getDeliveryAddress);

      await writeValues(token, spreadsheetId, `${tabLabel}!A1`, rows);

      // Send format requests in batches
      for (let i = 0; i < formatReqs.length; i += BATCH_SIZE) {
        await batchFormat(token, spreadsheetId, formatReqs.slice(i, i + BATCH_SIZE));
      }
    }

    // ── Update DB ─────────────────────────────────────────────────────────────
    const now = new Date();
    await db.from("sheet_exports").update({ last_exported_at: now.toISOString(), orders_count: orders.length }).eq("month_key", SHEET_KEY);

    return new Response(
      JSON.stringify({ url: spreadsheetUrl, orders_exported: orders.length, dates_exported: sortedDateKeys.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[export-packaging-sheet]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
