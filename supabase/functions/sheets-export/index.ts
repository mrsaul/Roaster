// supabase/functions/sheets-export/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
const GOOGLE_SHARE_EMAIL = Deno.env.get("GOOGLE_SHARE_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function requireEnv(value: string | undefined | null, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createServiceSupabaseClient() {
  return createClient(
    requireEnv(SUPABASE_URL, "SUPABASE_URL"),
    requireEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function createUserScopedSupabaseClient(authHeader: string) {
  return createClient(
    requireEnv(SUPABASE_URL, "SUPABASE_URL"),
    requireEnv(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ─── Auth guard — admin only ──────────────────────────────────────────────────

async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createUserScopedSupabaseClient(authHeader);
  // Use standard getUser() — getClaims() is non-standard and may not exist
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.id) throw jsonResponse({ error: "Unauthorized" }, 401);

  const userId = user.id;
  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);

  if (roleError) throw new Error(`Role lookup failed: ${roleError.message}`);
  if (!roleRows?.length) throw jsonResponse({ error: "Forbidden" }, 403);

  return userId;
}

// ─── Google Sheets auth via service account JWT ───────────────────────────────

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function textToBase64url(text: string): string {
  return base64urlEncode(new TextEncoder().encode(text));
}

async function getGoogleAccessToken(): Promise<string> {
  const raw = requireEnv(GOOGLE_SERVICE_ACCOUNT_JSON, "GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw) as ServiceAccount;

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";

  const header = textToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claim}`;

  // Import the RSA private key (PKCS8 PEM → CryptoKey)
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const pkcs8Der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64urlEncode(new Uint8Array(sigBytes))}`;

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google token exchange failed [${tokenRes.status}]: ${text}`);
  }

  const json = await tokenRes.json() as { access_token: string };
  return json.access_token;
}

// ─── Google Drive sharing ─────────────────────────────────────────────────────

async function shareSpreadsheet(accessToken: string, spreadsheetId: string, email: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "user",
        role: "writer",
        emailAddress: email,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Share failed [${res.status}]: ${text}`);
  }
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function createSpreadsheet(accessToken: string, title: string): Promise<string> {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Orders" } }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spreadsheet creation failed [${res.status}]: ${text}`);
  }

  const json = await res.json() as { spreadsheetId: string };
  return json.spreadsheetId;
}

async function writeRows(
  accessToken: string,
  spreadsheetId: string,
  rows: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Orders!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets write failed [${res.status}]: ${text}`);
  }
}

// ─── Month helpers ────────────────────────────────────────────────────────────

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({})) as { month_key?: string };
    const monthKey = body.month_key ?? currentMonthKey();

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return jsonResponse({ error: "month_key must be in YYYY-MM format" }, 400);
    }

    console.log(`[sheets-export] Starting export for month_key=${monthKey}`);

    const supabase = createServiceSupabaseClient();

    // 2. CHECK existing export
    const { data: existing, error: exportCheckError } = await supabase
      .from("sheet_exports")
      .select("spreadsheet_id, spreadsheet_url, orders_count")
      .eq("month_key", monthKey)
      .maybeSingle();

    if (exportCheckError) throw new Error(`sheet_exports lookup failed: ${exportCheckError.message}`);

    if (existing && existing.orders_count > 0) {
      console.log(`[sheets-export] Already exported month=${monthKey}, returning existing sheet`);
      return jsonResponse({
        status: "already_exported",
        spreadsheet_id: existing.spreadsheet_id,
        sheet_url: existing.spreadsheet_url,
      });
    }

    // 3. FETCH orders for the month
    const { start, end } = monthBounds(monthKey);
    console.log(`[sheets-export] Fetching orders between ${start} and ${end}`);

    const { data: rows, error: fetchError } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        total_kg,
        total_price,
        delivery_date,
        created_at,
        notes,
        profiles ( full_name ),
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          price_per_kg,
          size_label,
          size_kg,
          products ( name )
        ),
        shopify_orders ( shopify_order_number )
      `)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true });

    if (fetchError) throw new Error(`Orders fetch failed: ${fetchError.message}`);

    console.log(`[sheets-export] Fetched ${rows?.length ?? 0} orders`);

    // 4. BUILD rows array
    type ItemRow = {
      id: string;
      product_name: string;
      quantity: number;
      price_per_kg: number;
      size_label: string | null;
      size_kg: number | null;
      products: { name: string } | null;
    };

    type OrderRow = {
      id: string;
      status: string;
      total_price: number;
      delivery_date: string;
      created_at: string;
      profiles: { full_name: string } | null;
      order_items: ItemRow[];
      shopify_orders: { shopify_order_number: string | null }[] | null;
    };

    const HEADER = [
      "Date", "Order ID", "Shopify #", "Customer",
      "Product", "Qty (kg)", "Size", "Price/kg (€)",
      "Line Total (€)", "Status", "Order Total (€)", "Delivery Date",
    ];

    const dataRows: (string | number)[][] = [];
    const orderIds: string[] = [];

    for (const order of (rows ?? []) as OrderRow[]) {
      const date = order.created_at.slice(0, 10);
      const shortId = order.id.slice(0, 8);
      const shopifyNum = Array.isArray(order.shopify_orders) && order.shopify_orders.length > 0
        ? (order.shopify_orders[0].shopify_order_number ?? "")
        : "";
      const customerName = order.profiles?.full_name ?? "Shopify customer";
      const deliveryDate = order.delivery_date ?? "";

      orderIds.push(order.id);

      for (const item of (order.order_items ?? []) as ItemRow[]) {
        const productName = item.products?.name ?? item.product_name;
        const quantityKg = Number(item.quantity) || 0;
        const pricePerKg = Number(item.price_per_kg) || 0;
        const lineTotal = Math.round(quantityKg * pricePerKg * 100) / 100;

        dataRows.push([
          date,
          shortId,
          shopifyNum,
          customerName,
          productName,
          quantityKg,
          item.size_label ?? "",
          pricePerKg,
          lineTotal,
          order.status,
          Number(order.total_price) || 0,
          deliveryDate,
        ]);
      }
    }

    console.log(`[sheets-export] Built ${dataRows.length} data rows from ${orderIds.length} orders`);

    // 5 + 6. GET Google token & CREATE spreadsheet
    console.log("[sheets-export] Authenticating with Google");
    const accessToken = await getGoogleAccessToken();

    const sheetTitle = `Plural Roaster — Orders ${monthKey}`;
    console.log(`[sheets-export] Creating spreadsheet: "${sheetTitle}"`);
    const spreadsheetId = await createSpreadsheet(accessToken, sheetTitle);
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    console.log(`[sheets-export] Created spreadsheet id=${spreadsheetId}`);

    // Share with configured email so it appears in Google Drive
    if (GOOGLE_SHARE_EMAIL) {
      console.log(`[sheets-export] Sharing sheet with ${GOOGLE_SHARE_EMAIL}`);
      await shareSpreadsheet(accessToken, spreadsheetId, GOOGLE_SHARE_EMAIL);
    }

    // 7. WRITE header + data rows
    console.log(`[sheets-export] Writing ${dataRows.length + 1} rows to sheet`);
    await writeRows(accessToken, spreadsheetId, [HEADER, ...dataRows]);

    // 8. UPSERT sheet_exports
    console.log("[sheets-export] Upserting sheet_exports row");
    const { error: upsertError } = await supabase
      .from("sheet_exports")
      .upsert(
        {
          month_key: monthKey,
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: sheetUrl,
          orders_count: dataRows.length,
          last_exported_at: new Date().toISOString(),
        },
        { onConflict: "month_key" },
      );

    if (upsertError) throw new Error(`sheet_exports upsert failed: ${upsertError.message}`);

    // 9. STAMP orders with exported_to_sheet_at
    if (orderIds.length > 0) {
      console.log(`[sheets-export] Stamping ${orderIds.length} orders with exported_to_sheet_at`);
      const { error: stampError } = await supabase
        .from("orders")
        .update({ exported_to_sheet_at: new Date().toISOString() })
        .in("id", orderIds);

      if (stampError) throw new Error(`Order stamp failed: ${stampError.message}`);
    }

    // 10. RETURN
    console.log(`[sheets-export] Done — rows_written=${dataRows.length}`);
    return jsonResponse({
      spreadsheet_id: spreadsheetId,
      rows_written: dataRows.length,
      sheet_url: sheetUrl,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sheets-export] Error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
