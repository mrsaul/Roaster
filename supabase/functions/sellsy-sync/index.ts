import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SELLSY_API_BASE_URL = Deno.env.get("SELLSY_API_BASE_URL");
const SELLSY_CLIENT_ID = Deno.env.get("SELLSY_CLIENT_ID");
const SELLSY_CLIENT_SECRET = Deno.env.get("SELLSY_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims?.sub) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = data.claims.sub;
  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);

  if (roleError) {
    throw new Error(`Role lookup failed: ${roleError.message}`);
  }

  if (!roleRows?.length) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return {
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

function getServiceSupabaseClient() {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function getSellsyAccessToken() {
  if (!SELLSY_API_BASE_URL) {
    throw new Error("SELLSY_API_BASE_URL is not configured");
  }

  if (!SELLSY_CLIENT_ID) {
    throw new Error("SELLSY_CLIENT_ID is not configured");
  }

  if (!SELLSY_CLIENT_SECRET) {
    throw new Error("SELLSY_CLIENT_SECRET is not configured");
  }

  const tokenUrl = new URL("https://login.sellsy.com/oauth2/access-tokens").toString();
  const body = JSON.stringify({
    grant_type: "client_credentials",
    client_id: SELLSY_CLIENT_ID,
    client_secret: SELLSY_CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || !data.access_token) {
    throw new Error(`Sellsy token request failed [${response.status}]: ${text}`);
  }

  return data.access_token as string;
}

async function createSellsyOrder(accessToken: string, payload: Record<string, unknown>) {
  const endpoint = new URL("/v2/orders", SELLSY_API_BASE_URL ?? "https://api.sellsy.com").toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Sellsy order creation failed [${response.status}]: ${text}`);
  }

  return data;
}

async function fetchSellsyProducts(accessToken: string) {
  const endpoint = new URL("/v2/products", SELLSY_API_BASE_URL ?? "https://api.sellsy.com");
  endpoint.searchParams.set("limit", "200");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Sellsy product fetch failed [${response.status}]: ${text}`);
  }

  const products = Array.isArray(data)
    ? data
    : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.items)
        ? data.items
        : [];

  return products as Record<string, unknown>[];
}

function normalizeProducts(products: Record<string, unknown>[]) {
  return products
    .filter((product) => {
      const rawName = product.name ?? product.label ?? product.designation;
      const category = String(product.category_name ?? product.category ?? product.family ?? "").toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags.join(" ").toLowerCase() : "";
      const text = `${String(rawName ?? "")} ${category} ${tags}`.toLowerCase();
      return Boolean(rawName) && /(coffee|café|roast|espresso|blend|arabica|robusta)/.test(text);
    })
    .map((product) => {
      const sellsyId = String(product.id ?? product.sellsy_id ?? product.reference ?? crypto.randomUUID());
      const description = typeof product.description === "string" ? product.description : null;
      const fullText = `${String(product.name ?? "")} ${description ?? ""}`.toLowerCase();
      let roastLevel: string | null = null;
      if (fullText.includes("espresso")) roastLevel = "espresso";
      else if (fullText.includes("dark")) roastLevel = "dark";
      else if (fullText.includes("medium")) roastLevel = "medium";
      else if (fullText.includes("light")) roastLevel = "light";

      const priceSource = product.price ?? product.unit_amount ?? product.amount ?? product.price_tax_exc ?? 0;
      const numericPrice = Number(priceSource);

      return {
        sellsy_id: sellsyId,
        sku: product.sku ? String(product.sku) : product.reference ? String(product.reference) : null,
        name: String(product.name ?? product.label ?? product.designation),
        description,
        origin: product.origin ? String(product.origin) : null,
        roast_level: roastLevel,
        price_per_kg: Number.isFinite(numericPrice) ? numericPrice : 0,
        is_active: product.is_active === false ? false : product.active === false ? false : true,
        synced_at: new Date().toISOString(),
      } satisfies ProductRow;
    });
}

async function syncProductsToDatabase(rows: ProductRow[]) {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("products").upsert(rows, {
    onConflict: "sellsy_id",
  });

  if (error) {
    throw new Error(`Product upsert failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "sync-products" ? "sync-products" : "order";
    const accessToken = await getSellsyAccessToken();

    if (mode === "sync-products") {
      const sellsyProducts = await fetchSellsyProducts(accessToken);
      const normalizedProducts = normalizeProducts(sellsyProducts);
      await syncProductsToDatabase(normalizedProducts);

      return jsonResponse({
        success: true,
        mode,
        syncedCount: normalizedProducts.length,
        requestedBy: user.userId,
      });
    }

    const sellsyPayload = {
      source: "PluralRoaster",
      external_reference: body.orderId,
      ordered_at: body.createdAt,
      delivery_date: body.deliveryDate,
      customer: body.customer ?? {
        email: user.email,
      },
      notes: body.notes ?? null,
      lines: Array.isArray(body.items)
        ? body.items.map((item: Record<string, unknown>) => ({
            sku: item.sku,
            name: item.name,
            quantity: item.quantity,
            unit: "kg",
            unit_price: item.pricePerKg,
            total_price: item.totalPrice,
          }))
        : [],
      totals: {
        total_kg: body.totalKg,
        total_price: body.totalPrice,
      },
      metadata: {
        user_id: user.userId,
        app: "PluralRoaster",
      },
    };

    const sellsyResponse = await createSellsyOrder(accessToken, sellsyPayload);

    return jsonResponse({
      success: true,
      mode,
      sellsyResponse,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sellsy-sync error:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    );
  }
});
