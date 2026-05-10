// ── PluralRoaster — Comprehensive API Health Check ───────────────────────────
// Tests all external integrations (Sellsy, Shopify, Google Sheets, Supabase)
// and returns a structured status report with per-integration details.
// Logs results to sync_health_logs table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// ── Env vars ──────────────────────────────────────────────────────────────────

const SELLSY_CLIENT_ID = Deno.env.get("SELLSY_CLIENT_ID");
const SELLSY_CLIENT_SECRET = Deno.env.get("SELLSY_CLIENT_SECRET");
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN");
const SHOPIFY_ADMIN_API_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN");
const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckStatus = "ok" | "degraded" | "down";

interface CheckResult {
  status: CheckStatus;
  latency_ms?: number;
  detail?: string;
  error?: string;
}

interface IntegrationStatus {
  overall: CheckStatus;
  checks: Record<string, CheckResult>;
}

interface HealthReport {
  timestamp: string;
  overall: "healthy" | "degraded" | "down";
  integrations: {
    sellsy: IntegrationStatus;
    shopify: IntegrationStatus;
    google_sheets: IntegrationStatus;
    supabase: IntegrationStatus;
  };
  requested_by?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latency_ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latency_ms: Date.now() - start };
}

function rollupStatus(checks: Record<string, CheckResult>): CheckStatus {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.every((s) => s === "ok")) return "ok";
  if (statuses.some((s) => s === "down")) return "down";
  return "degraded";
}

function toOverall(statuses: CheckStatus[]): "healthy" | "degraded" | "down" {
  if (statuses.every((s) => s === "ok")) return "healthy";
  if (statuses.some((s) => s === "down")) return "down";
  return "degraded";
}

// ── Auth: Supabase admin check ────────────────────────────────────────────────

async function getAuthenticatedAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  });

  // Use standard getUser() — getClaims() is non-standard and may not exist
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = user.id;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);

  if (!roles?.length) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return userId;
}

// ── Sellsy checks ─────────────────────────────────────────────────────────────

async function checkSellsy(): Promise<IntegrationStatus> {
  const checks: Record<string, CheckResult> = {};

  // 1. Env vars
  const missingEnv: string[] = [];
  if (!SELLSY_CLIENT_ID) missingEnv.push("SELLSY_CLIENT_ID");
  if (!SELLSY_CLIENT_SECRET) missingEnv.push("SELLSY_CLIENT_SECRET");

  if (missingEnv.length > 0) {
    checks.env_vars = { status: "down", error: `Missing: ${missingEnv.join(", ")}` };
    return { overall: "down", checks };
  }
  checks.env_vars = { status: "ok", detail: "SELLSY_CLIENT_ID, SELLSY_CLIENT_SECRET present" };

  // 2. OAuth token
  let accessToken: string;
  try {
    const { result: tokenResult, latency_ms } = await timed(async () => {
      const res = await fetch("https://login.sellsy.com/oauth2/access-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: SELLSY_CLIENT_ID!,
          client_secret: SELLSY_CLIENT_SECRET!,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json() as { access_token: string };
      return json.access_token;
    });
    accessToken = tokenResult;
    checks.oauth_token = { status: "ok", latency_ms, detail: "Token acquired" };
  } catch (err) {
    checks.oauth_token = { status: "down", error: String(err) };
    return { overall: rollupStatus(checks), checks };
  }

  // 3. API probe — read items
  try {
    const { latency_ms } = await timed(async () => {
      const res = await fetch("https://api.sellsy.com/v2/items?limit=1", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    });
    checks.api_read = { status: "ok", latency_ms, detail: "GET /v2/items responded" };
  } catch (err) {
    checks.api_read = { status: "down", error: String(err) };
  }

  // 4. API probe — read companies
  try {
    const { latency_ms } = await timed(async () => {
      const res = await fetch("https://api.sellsy.com/v2/companies?limit=1", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    });
    checks.api_companies = { status: "ok", latency_ms, detail: "GET /v2/companies responded" };
  } catch (err) {
    checks.api_companies = { status: "degraded", error: String(err) };
  }

  return { overall: rollupStatus(checks), checks };
}

// ── Shopify checks ────────────────────────────────────────────────────────────

async function checkShopify(): Promise<IntegrationStatus> {
  const checks: Record<string, CheckResult> = {};

  // 1. Env vars
  const missingEnv: string[] = [];
  if (!SHOPIFY_STORE_DOMAIN) missingEnv.push("SHOPIFY_STORE_DOMAIN");
  if (!SHOPIFY_ADMIN_API_TOKEN) missingEnv.push("SHOPIFY_ADMIN_API_TOKEN");

  if (missingEnv.length > 0) {
    checks.env_vars = { status: "down", error: `Missing: ${missingEnv.join(", ")}` };
    return { overall: "down", checks };
  }
  checks.env_vars = { status: "ok", detail: "SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN present" };

  // 2. Products read
  try {
    const { result: data, latency_ms } = await timed(async () => {
      const res = await fetch(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json?limit=1`,
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN!,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json() as { products: unknown[] };
    });
    checks.api_products = {
      status: "ok",
      latency_ms,
      detail: `Fetched products (count: ${(data.products ?? []).length})`,
    };
  } catch (err) {
    checks.api_products = { status: "down", error: String(err) };
    return { overall: rollupStatus(checks), checks };
  }

  // 3. Orders read
  try {
    const { result: data, latency_ms } = await timed(async () => {
      const res = await fetch(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json?limit=1&status=any`,
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN!,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json() as { orders: unknown[] };
    });
    checks.api_orders = {
      status: "ok",
      latency_ms,
      detail: `Fetched orders (count: ${(data.orders ?? []).length})`,
    };
  } catch (err) {
    checks.api_orders = { status: "degraded", error: String(err) };
  }

  // 4. Shop info (auth verification)
  try {
    const { result: shopData, latency_ms } = await timed(async () => {
      const res = await fetch(
        `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN!,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json() as { shop: { name: string; plan_name: string } };
    });
    checks.shop_info = {
      status: "ok",
      latency_ms,
      detail: `Shop: ${shopData.shop?.name} (${shopData.shop?.plan_name})`,
    };
  } catch (err) {
    checks.shop_info = { status: "degraded", error: String(err) };
  }

  return { overall: rollupStatus(checks), checks };
}

// ── Google Sheets checks ──────────────────────────────────────────────────────

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

async function getGoogleToken(serviceEmail: string, privateKeyPem: string): Promise<string> {
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
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly",
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

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${sigInput}.${base64url(sigBuf)}`,
    }),
  });

  if (!resp.ok) throw new Error(`Google auth failed: ${await resp.text()}`);
  const json = (await resp.json()) as { access_token: string };
  return json.access_token;
}

async function checkGoogleSheets(): Promise<IntegrationStatus> {
  const checks: Record<string, CheckResult> = {};

  // 1. Env vars
  const missingEnv: string[] = [];
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) missingEnv.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!GOOGLE_PRIVATE_KEY) missingEnv.push("GOOGLE_PRIVATE_KEY");

  if (missingEnv.length > 0) {
    checks.env_vars = { status: "down", error: `Missing: ${missingEnv.join(", ")}` };
    return { overall: "down", checks };
  }
  checks.env_vars = {
    status: "ok",
    detail: `Service account: ${GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
  };

  // 2. JWT → OAuth token
  let googleToken: string;
  try {
    const { result, latency_ms } = await timed(() =>
      getGoogleToken(GOOGLE_SERVICE_ACCOUNT_EMAIL!, GOOGLE_PRIVATE_KEY!),
    );
    googleToken = result;
    checks.oauth_token = { status: "ok", latency_ms, detail: "Google OAuth token acquired" };
  } catch (err) {
    checks.oauth_token = { status: "down", error: String(err) };
    return { overall: rollupStatus(checks), checks };
  }

  // 3. Sheets API reachability (list files)
  try {
    const { result: data, latency_ms } = await timed(async () => {
      const res = await fetch(
        "https://www.googleapis.com/drive/v3/files?pageSize=1&q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27",
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json() as { files: unknown[] };
    });
    checks.drive_read = {
      status: "ok",
      latency_ms,
      detail: `Drive API responded (sheets found: ${(data.files ?? []).length})`,
    };
  } catch (err) {
    checks.drive_read = { status: "degraded", error: String(err) };
  }

  // 4. Sheets API write test (create temp sheet, write, delete)
  let testSheetId: string | null = null;
  try {
    const { result: created, latency_ms } = await timed(async () => {
      const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties: { title: `health-check-${Date.now()}` } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json() as { spreadsheetId: string };
    });
    testSheetId = created.spreadsheetId;
    checks.sheets_write = {
      status: "ok",
      latency_ms,
      detail: "Created test spreadsheet successfully",
    };
  } catch (err) {
    checks.sheets_write = { status: "degraded", error: String(err) };
  }

  // 5. Cleanup — delete test sheet
  if (testSheetId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${testSheetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      checks.sheets_cleanup = { status: "ok", detail: "Test sheet deleted" };
    } catch {
      checks.sheets_cleanup = {
        status: "degraded",
        detail: `Test sheet ${testSheetId} may need manual cleanup`,
      };
    }
  }

  return { overall: rollupStatus(checks), checks };
}

// ── Supabase checks ───────────────────────────────────────────────────────────

async function checkSupabase(): Promise<IntegrationStatus> {
  const checks: Record<string, CheckResult> = {};

  // 1. Env vars
  const missingEnv: string[] = [];
  if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingEnv.length > 0) {
    checks.env_vars = { status: "down", error: `Missing: ${missingEnv.join(", ")}` };
    return { overall: "down", checks };
  }
  checks.env_vars = { status: "ok", detail: "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY present" };

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // 2. Products table read
  try {
    const { result, latency_ms } = await timed(async () => {
      const { count, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count;
    });
    checks.products_table = {
      status: "ok",
      latency_ms,
      detail: `products table: ${result} rows`,
    };
  } catch (err) {
    checks.products_table = { status: "down", error: String(err) };
  }

  // 3. Orders table read
  try {
    const { result, latency_ms } = await timed(async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count;
    });
    checks.orders_table = {
      status: "ok",
      latency_ms,
      detail: `orders table: ${result} rows`,
    };
  } catch (err) {
    checks.orders_table = { status: "degraded", error: String(err) };
  }

  // 4. Clients table read
  try {
    const { result, latency_ms } = await timed(async () => {
      const { count, error } = await supabase
        .from("companies")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count;
    });
    checks.clients_table = {
      status: "ok",
      latency_ms,
      detail: `companies table: ${result} rows`,
    };
  } catch (err) {
    checks.clients_table = { status: "degraded", error: String(err) };
  }

  return { overall: rollupStatus(checks), checks };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth check
  let userId: string;
  try {
    userId = await getAuthenticatedAdmin(req);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return jsonResponse({ error: "Authentication error" }, 401);
  }

  const serviceSupabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const timestamp = new Date().toISOString();

  console.log(`api-health-check: started by user ${userId}`);

  // Run all checks in parallel
  const [sellsyResult, shopifyResult, googleResult, supabaseResult] = await Promise.all([
    checkSellsy().catch((err): IntegrationStatus => ({
      overall: "down",
      checks: { unexpected_error: { status: "down", error: String(err) } },
    })),
    checkShopify().catch((err): IntegrationStatus => ({
      overall: "down",
      checks: { unexpected_error: { status: "down", error: String(err) } },
    })),
    checkGoogleSheets().catch((err): IntegrationStatus => ({
      overall: "down",
      checks: { unexpected_error: { status: "down", error: String(err) } },
    })),
    checkSupabase().catch((err): IntegrationStatus => ({
      overall: "down",
      checks: { unexpected_error: { status: "down", error: String(err) } },
    })),
  ]);

  const integrationStatuses: CheckStatus[] = [
    sellsyResult.overall,
    shopifyResult.overall,
    googleResult.overall,
    supabaseResult.overall,
  ];

  const overall = toOverall(integrationStatuses);

  const report: HealthReport = {
    timestamp,
    overall,
    integrations: {
      sellsy: sellsyResult,
      shopify: shopifyResult,
      google_sheets: googleResult,
      supabase: supabaseResult,
    },
    requested_by: userId,
  };

  // Persist to sync_health_logs (best-effort, don't fail the response if this errors)
  try {
    await serviceSupabase.from("sync_health_logs").insert({
      checked_at: timestamp,
      overall_status: overall,
      sellsy_status: sellsyResult.overall,
      shopify_status: shopifyResult.overall,
      google_sheets_status: googleResult.overall,
      supabase_status: supabaseResult.overall,
      details: report,
      triggered_by: userId,
    });
  } catch (logErr) {
    console.warn("Failed to persist health log:", logErr);
  }

  const httpStatus = overall === "healthy" ? 200 : overall === "degraded" ? 207 : 503;
  return jsonResponse(report, httpStatus);
});
