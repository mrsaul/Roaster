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

  return {
    userId: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
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

  const tokenUrl = new URL("/oauth2/token", SELLSY_API_BASE_URL).toString();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SELLSY_CLIENT_ID,
    client_secret: SELLSY_CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || !data.access_token) {
    throw new Error(`Sellsy token request failed [${response.status}]: ${text}`);
  }

  return data.access_token as string;
}

async function createSellsyOrder(accessToken: string, payload: Record<string, unknown>) {
  if (!SELLSY_API_BASE_URL) {
    throw new Error("SELLSY_API_BASE_URL is not configured");
  }

  const endpoint = new URL("/v2/orders", SELLSY_API_BASE_URL).toString();
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

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

    const accessToken = await getSellsyAccessToken();
    const sellsyResponse = await createSellsyOrder(accessToken, sellsyPayload);

    return jsonResponse({
      success: true,
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
