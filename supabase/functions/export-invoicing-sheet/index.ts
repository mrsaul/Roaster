// ── PluralRoaster — Google Sheets Invoicing Export ──────────────────────────
// Exports all invoiceable orders for the current month to a Google Sheet.
// Uses service account credentials (JWT, no OAuth flow needed).
// Stores the spreadsheet ID in sheet_exports so subsequent runs update
// the same sheet rather than creating a new one.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Google JWT helpers ────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function strToBase64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getGoogleAccessToken(
  serviceEmail: string,
  privateKeyPem: string,
): Promise<string> {
  // Strip PEM armor and handle escaped newlines from env vars
  const pem = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\n/g, "")
    .replace(/\s/g, "")
    .trim();

  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = strToBase64url(
    JSON.stringify({
      iss: serviceEmail,
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
      ].join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );

  const sigInput = `${headerB64}.${payloadB64}`;
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(sigInput),
  );

  const jwt = `${sigInput}.${base64url(sigBuf)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Google auth failed: ${await resp.text()}`);
  }

  const { access_token } = (await resp.json()) as { access_token: string };
  return access_token;
}

// ── Google Sheets REST wrappers ───────────────────────────────────────────────

async function sheetsApi(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const base = "https://sheets.googleapis.com/v4/spreadsheets";
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Sheets ${method} ${path} → ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createSpreadsheet(
  token: string,
  title: string,
): Promise<{ id: string; url: string }> {
  const data = (await sheetsApi(token, "POST", "", {
    properties: { title },
    sheets: [
      { properties: { title: "Orders", index: 0 } },
      { properties: { title: "Summary", index: 1 } },
    ],
  })) as { spreadsheetId: string };

  return {
    id: data.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
  };
}

async function clearRange(
  token: string,
  id: string,
  range: string,
): Promise<void> {
  await sheetsApi(token, "POST", `/${id}/values/${encodeURIComponent(range)}:clear`);
}

async function writeValues(
  token: string,
  id: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  await sheetsApi(
    token,
    "PUT",
    `/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { range, majorDimension: "ROWS", values },
  );
}

async function batchFormat(
  token: string,
  id: string,
  requests: unknown[],
): Promise<void> {
  await sheetsApi(token, "POST", `/${id}:batchUpdate`, { requests });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderItem = {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
};

type RawOrder = {
  id: string;
  user_id: string;
  delivery_date: string;
  total_price: number;
  status: string;
  sellsy_id: string | null;
  invoicing_status: string;
  order_items: OrderItem[];
};

type Profile = { id: string; full_name: string | null; email: string | null };

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Env vars ────────────────────────────────────────────────────────────
    const serviceEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!serviceEmail || !privateKey) {
      throw new Error(
        "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY",
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;

    // ── Auth: verify caller is admin ────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized — no auth header");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const db = createClient(supabaseUrl, serviceRoleKey);

    // Use the same RPC the app uses — runs in the user's session context
    const { data: currentRole, error: roleErr } = await userClient.rpc(
      "ensure_current_user_role",
    );
    if (roleErr) throw new Error(`Role check failed: ${roleErr.message}`);
    if (currentRole !== "admin") {
      throw new Error(`Admin only (your role: ${currentRole})`);
    }

    // ── Fetch invoiceable orders for current month ───────────────────────────
    // test:true (in body) widens the status filter so the Google connection
    // can be verified even when no orders are ready_for_delivery/delivered.
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const testMode = body.test === true;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const eligibleStatuses = testMode
      ? ["received", "approved", "packaging", "ready_for_delivery", "delivered"]
      : ["ready_for_delivery", "delivered"];

    const { data: ordersRaw, error: ordersErr } = await db
      .from("orders")
      .select(
        `id, user_id, delivery_date, total_price, status, sellsy_id,
         invoicing_status,
         order_items ( product_name, product_sku, quantity, price_per_kg )`,
      )
      .in("status", eligibleStatuses)
      .gte("delivery_date", monthStart)
      .lte("delivery_date", monthEnd)
      .order("delivery_date");

    if (ordersErr) throw ordersErr;
    const orders = (ordersRaw ?? []) as RawOrder[];

    // Enrich with profiles (two-step join — orders.user_id → profiles.id)
    const userIds = [...new Set(orders.map((o) => o.user_id))];
    const { data: profilesRaw } = userIds.length > 0
      ? await db
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
      : { data: [] };

    const profileMap = new Map<string, Profile>(
      ((profilesRaw ?? []) as Profile[]).map((p) => [p.id, p]),
    );

    // ── Google auth ─────────────────────────────────────────────────────────
    const token = await getGoogleAccessToken(serviceEmail, privateKey);

    // ── Find or create spreadsheet for this month ───────────────────────────
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    const sheetTitle = `Invoicing Report - ${monthLabel}`;

    const { data: existingExport } = await db
      .from("sheet_exports")
      .select("spreadsheet_id, spreadsheet_url")
      .eq("month_key", monthKey)
      .maybeSingle();

    let spreadsheetId: string;
    let spreadsheetUrl: string;

    if (existingExport) {
      spreadsheetId = existingExport.spreadsheet_id;
      spreadsheetUrl = existingExport.spreadsheet_url;
      await clearRange(token, spreadsheetId, "Orders");
      await clearRange(token, spreadsheetId, "Summary");
    } else {
      const created = await createSpreadsheet(token, sheetTitle);
      spreadsheetId = created.id;
      spreadsheetUrl = created.url;
      await db.from("sheet_exports").insert({
        month_key: monthKey,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        orders_count: orders.length,
      });
    }

    // ── Build Orders tab ─────────────────────────────────────────────────────

    const VAT = 20; // 20 %

    const HEADERS = [
      "Order ID",
      "Date",
      "Client Name",
      "Client Email",
      "Product Name",
      "SKU",
      "Quantity (kg)",
      "Unit Price (€/kg)",
      "Total HT (€)",
      "VAT %",
      "Total TTC (€)",
      "Sellsy Invoice Status",
      "Notes",
    ];

    // Group by client label
    const byClient = new Map<string, { profile: Profile | undefined; orders: RawOrder[] }>();
    for (const order of orders) {
      const profile = profileMap.get(order.user_id);
      const key = profile?.full_name ?? profile?.email ?? order.user_id;
      if (!byClient.has(key)) {
        byClient.set(key, { profile, orders: [] });
      }
      byClient.get(key)!.orders.push(order);
    }

    const dataRows: unknown[][] = [HEADERS];
    // Track which rows (1-based) are subtotal rows for bold + shading
    const subtotalRows: number[] = [];

    for (const [clientLabel, { profile, orders: clientOrders }] of byClient) {
      let clientHt = 0;

      for (const order of clientOrders) {
        const items = order.order_items ?? [];

        if (items.length === 0) {
          const ht = Number(order.total_price);
          const ttc = ht * (1 + VAT / 100);
          clientHt += ht;
          dataRows.push([
            order.id.slice(0, 8),
            order.delivery_date,
            profile?.full_name ?? "—",
            profile?.email ?? "—",
            "—", "—", "—", "—",
            ht.toFixed(2),
            VAT,
            ttc.toFixed(2),
            order.invoicing_status,
            "",
          ]);
        } else {
          for (const item of items) {
            const ht = Number(item.quantity) * Number(item.price_per_kg);
            const ttc = ht * (1 + VAT / 100);
            clientHt += ht;
            dataRows.push([
              order.id.slice(0, 8),
              order.delivery_date,
              profile?.full_name ?? "—",
              profile?.email ?? "—",
              item.product_name,
              item.product_sku ?? "—",
              Number(item.quantity).toFixed(2),
              Number(item.price_per_kg).toFixed(2),
              ht.toFixed(2),
              VAT,
              (ht * (1 + VAT / 100)).toFixed(2),
              order.invoicing_status,
              "",
            ]);
          }
        }
      }

      // Subtotal row for this client
      const clientTtc = clientHt * (1 + VAT / 100);
      dataRows.push([
        "",
        "",
        `SUBTOTAL — ${clientLabel}`,
        "",
        "",
        "",
        "",
        "",
        clientHt.toFixed(2),
        VAT,
        clientTtc.toFixed(2),
        "",
        "",
      ]);
      subtotalRows.push(dataRows.length); // 1-based index
    }

    await writeValues(token, spreadsheetId, "Orders!A1", dataRows);

    // ── Build Summary tab ────────────────────────────────────────────────────

    const SUMMARY_HEADERS = [
      "Client Name",
      "Number of Orders",
      "Total HT (€)",
      "Total TTC (€)",
    ];
    const summaryRows: unknown[][] = [SUMMARY_HEADERS];
    let grandHt = 0;
    let grandTtc = 0;
    let grandOrders = 0;

    for (const [clientLabel, { profile: _, orders: clientOrders }] of byClient) {
      let ht = 0;
      for (const order of clientOrders) {
        for (const item of order.order_items ?? []) {
          ht += Number(item.quantity) * Number(item.price_per_kg);
        }
        if ((order.order_items ?? []).length === 0) {
          ht += Number(order.total_price);
        }
      }
      const ttc = ht * (1 + VAT / 100);
      grandHt += ht;
      grandTtc += ttc;
      grandOrders += clientOrders.length;
      summaryRows.push([clientLabel, clientOrders.length, ht.toFixed(2), ttc.toFixed(2)]);
    }

    summaryRows.push([
      "GRAND TOTAL",
      grandOrders,
      grandHt.toFixed(2),
      grandTtc.toFixed(2),
    ]);

    await writeValues(token, spreadsheetId, "Summary!A1", summaryRows);

    // ── Formatting ───────────────────────────────────────────────────────────

    // Get sheet IDs from metadata
    const meta = (await sheetsApi(
      token,
      "GET",
      `/${spreadsheetId}?fields=sheets.properties`,
    )) as { sheets: { properties: { title: string; sheetId: number } }[] };

    const ordersSheetId =
      meta.sheets.find((s) => s.properties.title === "Orders")?.properties
        .sheetId ?? 0;
    const summarySheetId =
      meta.sheets.find((s) => s.properties.title === "Summary")?.properties
        .sheetId ?? 1;

    const darkBg = { red: 0.18, green: 0.18, blue: 0.18 };
    const subtotalBg = { red: 0.88, green: 0.88, blue: 0.88 };
    const grandTotalBg = { red: 0.78, green: 0.88, blue: 0.78 };
    const white = { red: 1, green: 1, blue: 1 };

    const formatRequests: unknown[] = [
      // Orders header row (row 1) — dark bg, white bold text
      {
        repeatCell: {
          range: { sheetId: ordersSheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: darkBg,
              textFormat: { bold: true, foregroundColor: white },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // Freeze header row on Orders tab
      {
        updateSheetProperties: {
          properties: {
            sheetId: ordersSheetId,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: "gridProperties.frozenRowCount",
        },
      },
      // Summary header row — dark bg, white bold text
      {
        repeatCell: {
          range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: darkBg,
              textFormat: { bold: true, foregroundColor: white },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // Grand total row on Summary — green bg, bold
      {
        repeatCell: {
          range: {
            sheetId: summarySheetId,
            startRowIndex: summaryRows.length - 1,
            endRowIndex: summaryRows.length,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: grandTotalBg,
              textFormat: { bold: true },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      },
      // Auto-resize all columns on Orders tab
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: ordersSheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: HEADERS.length,
          },
        },
      },
      // Auto-resize all columns on Summary tab
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: summarySheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: SUMMARY_HEADERS.length,
          },
        },
      },
    ];

    // Subtotal rows — grey bg, bold
    for (const rowIdx of subtotalRows) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: ordersSheetId,
            startRowIndex: rowIdx - 1,
            endRowIndex: rowIdx,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: subtotalBg,
              textFormat: { bold: true },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      });
    }

    await batchFormat(token, spreadsheetId, formatRequests);

    // ── Mark orders as exported ──────────────────────────────────────────────

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await db
        .from("orders")
        .update({ exported_to_sheet_at: now.toISOString() })
        .in("id", orderIds);
    }

    // Update export log
    await db
      .from("sheet_exports")
      .update({
        last_exported_at: now.toISOString(),
        orders_count: orders.length,
      })
      .eq("month_key", monthKey);

    return new Response(
      JSON.stringify({
        url: spreadsheetUrl,
        orders_exported: orderIds.length,
        month: monthLabel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[export-invoicing-sheet]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
