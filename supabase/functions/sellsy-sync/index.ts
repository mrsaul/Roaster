import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SELLSY_API_BASE_URL = Deno.env.get("SELLSY_API_BASE_URL");
const SELLSY_CLIENT_ID = Deno.env.get("SELLSY_CLIENT_ID");
const SELLSY_CLIENT_SECRET = Deno.env.get("SELLSY_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SELLSY_DEFAULT_API_BASE_URL = "https://api.sellsy.com";
const SELLSY_TOKEN_URL = "https://login.sellsy.com/oauth2/access-tokens";

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

type ProductParseError = {
  sellsy_id: string | null;
  sku: string | null;
  name: string | null;
  message: string;
  available_keys: string[];
};

type AdminClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  client_type: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
};

type AuthenticatedUser = {
  userId: string;
  email: string | null;
};

type JsonRecord = Record<string, unknown>;

type SellsyResponsePayload = {
  text: string;
  data: unknown;
};

type SellsyOrderLine = {
  sku: unknown;
  name: unknown;
  quantity: unknown;
  pricePerKg: unknown;
  totalPrice: unknown;
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

function errorResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(value: string | undefined | null, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function getRequestBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw errorResponse(401, "Unauthorized");
  }

  return authHeader;
}

function createUserScopedSupabaseClient(authHeader: string) {
  return createClient(
    requireEnv(SUPABASE_URL, "SUPABASE_URL"),
    requireEnv(SUPABASE_ANON_KEY, "SUPABASE_PUBLISHABLE_KEY"),
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );
}

function createServiceSupabaseClient() {
  return createClient(
    requireEnv(SUPABASE_URL, "SUPABASE_URL"),
    requireEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  );
}

async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser> {
  const authHeader = getRequestBearerToken(req);
  const token = authHeader.replace("Bearer ", "");
  const supabase = createUserScopedSupabaseClient(authHeader);

  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims?.sub) {
    throw errorResponse(401, "Unauthorized");
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
    throw errorResponse(403, "Forbidden");
  }

  return {
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

function getSellsyApiBaseUrl() {
  if (!SELLSY_API_BASE_URL) {
    return SELLSY_DEFAULT_API_BASE_URL;
  }

  try {
    const parsedUrl = new URL(SELLSY_API_BASE_URL);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname === "api.sellsy.com" || hostname.endsWith(".sellsy.com")) {
      return `${parsedUrl.origin}${parsedUrl.pathname === "/" ? "" : parsedUrl.pathname}`;
    }
  } catch {
    console.warn("Invalid SELLSY_API_BASE_URL secret, falling back to Sellsy API default");
    return SELLSY_DEFAULT_API_BASE_URL;
  }

  console.warn("SELSY_API_BASE_URL does not target the Sellsy API, falling back to https://api.sellsy.com");
  return SELLSY_DEFAULT_API_BASE_URL;
}

async function parseJsonResponse(response: Response): Promise<SellsyResponsePayload> {
  const text = await response.text();
  return {
    text,
    data: text ? JSON.parse(text) : {},
  };
}

async function fetchSellsy(path: string, accessToken: string, init?: RequestInit) {
  const endpoint = new URL(path, getSellsyApiBaseUrl()).toString();
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseJsonResponse(response);

  return {
    endpoint,
    response,
    payload,
  };
}

function extractSellsyCollection(data: unknown) {
  if (Array.isArray(data)) {
    return data as JsonRecord[];
  }

  if (data && typeof data === "object") {
    const objectData = data as JsonRecord;

    if (Array.isArray(objectData.data)) {
      return objectData.data as JsonRecord[];
    }

    if (Array.isArray(objectData.items)) {
      return objectData.items as JsonRecord[];
    }

    if (Array.isArray(objectData.result)) {
      return objectData.result as JsonRecord[];
    }

    if (objectData.pagination && Array.isArray((objectData.pagination as JsonRecord).items)) {
      return (objectData.pagination as JsonRecord).items as JsonRecord[];
    }
  }

  return [];
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim();

  if (!normalized) {
    return null;
  }

  normalized = normalized
    .replace(/[€$£¥₣\s]/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!normalized) {
    return null;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(value: unknown): number | null {
  return parseLocalizedNumber(value);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const picked = pickString(value);
    if (picked) return picked;
  }

  return null;
}

function pickNestedString(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record;

    for (const key of path) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }

      current = (current as JsonRecord)[key];
    }

    const picked = pickString(current);
    if (picked) return picked;
  }

  return null;
}

function pickNestedValue(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record;

    for (const key of path) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }

      current = (current as JsonRecord)[key];
    }

    if (current !== undefined && current !== null && current !== "") {
      return current;
    }
  }

  return null;
}

async function getSellsyAccessToken() {
  const response = await fetch(SELLSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: requireEnv(SELLSY_CLIENT_ID, "SELLSY_CLIENT_ID"),
      client_secret: requireEnv(SELLSY_CLIENT_SECRET, "SELLSY_CLIENT_SECRET"),
    }),
  });

  const payload = await parseJsonResponse(response);
  const accessToken =
    payload.data && typeof payload.data === "object" && typeof (payload.data as JsonRecord).access_token === "string"
      ? (payload.data as JsonRecord).access_token as string
      : null;

  if (!response.ok || !accessToken) {
    throw new Error(`Sellsy token request failed [${response.status}]: ${payload.text}`);
  }

  return accessToken;
}

async function fetchSellsyProducts(accessToken: string) {
  const listRequest = await fetchSellsy("/v2/items?limit=200", accessToken, {
    method: "GET",
  });

  if (listRequest.response.ok) {
    return extractSellsyCollection(listRequest.payload.data);
  }

  const searchPayloadCandidates: JsonRecord[] = [
    {
      filters: {},
    },
    {
      filters: {},
      limit: 200,
    },
    {
      filters: {},
      page: 1,
      limit: 200,
    },
  ];

  let lastSearchError: string | null = null;

  for (const candidatePayload of searchPayloadCandidates) {
    const searchRequest = await fetchSellsy("/v2/items/search", accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(candidatePayload),
    });

    if (searchRequest.response.ok) {
      return extractSellsyCollection(searchRequest.payload.data);
    }

    lastSearchError = searchRequest.payload.text;
  }

  throw new Error(
    `Sellsy product fetch failed: ${lastSearchError || listRequest.payload.text || "Unknown Sellsy search error"}`,
  );
}

async function fetchSellsyClients(accessToken: string) {
  const endpointCandidates = [
    { path: "/v2/companies?limit=200", method: "GET" as const },
    { path: "/v2/contacts?limit=200", method: "GET" as const },
  ];

  const searchPayloadCandidates: JsonRecord[] = [
    { filters: {} },
    { filters: {}, limit: 200 },
    { filters: {}, page: 1, limit: 200 },
  ];

  let lastError: string | null = null;

  for (const candidate of endpointCandidates) {
    const listRequest = await fetchSellsy(candidate.path, accessToken, {
      method: candidate.method,
    });

    if (listRequest.response.ok) {
      return extractSellsyCollection(listRequest.payload.data);
    }

    lastError = listRequest.payload.text;

    const searchPath = `${candidate.path.replace(/\?.*$/, "")}/search`;

    for (const searchPayload of searchPayloadCandidates) {
      const searchRequest = await fetchSellsy(searchPath, accessToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchPayload),
      });

      if (searchRequest.response.ok) {
        return extractSellsyCollection(searchRequest.payload.data);
      }

      lastError = searchRequest.payload.text;
    }
  }

  throw new Error(`Sellsy client fetch failed: ${lastError || "Unknown Sellsy client error"}`);
}

async function createSellsyOrder(accessToken: string, payload: JsonRecord) {
  const request = await fetchSellsy("/v2/orders", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!request.response.ok) {
    throw new Error(`Sellsy order creation failed [${request.response.status}]: ${request.payload.text}`);
  }

  return request.payload.data;
}

function inferRoastLevel(product: JsonRecord, description: string | null) {
  const fullText = `${String(product.name ?? "")} ${description ?? ""}`.toLowerCase();

  if (fullText.includes("espresso")) return "espresso";
  if (fullText.includes("dark")) return "dark";
  if (fullText.includes("medium")) return "medium";
  if (fullText.includes("light")) return "light";

  return null;
}

function isCoffeeProduct(product: JsonRecord) {
  const rawName = product.name ?? product.label ?? product.designation;
  const category = String(product.category_name ?? product.category ?? product.family ?? "").toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.join(" ").toLowerCase() : "";
  const text = `${String(rawName ?? "")} ${category} ${tags}`.toLowerCase();

  return Boolean(rawName) && /(coffee|café|roast|espresso|blend|arabica|robusta)/.test(text);
}

function extractProductPrice(product: JsonRecord) {
  const candidateValues: unknown[] = [
    product.price,
    product.price_per_kg,
    product.unit_price,
    product.unit_amount,
    product.amount,
    product.price_tax_exc,
    product.price_tax_inc,
    product.price_ht,
    product.price_ttc,
    product.buying_price,
    product.selling_price,
    product.public_price,
    pickNestedValue(product, [["prices", "unit_amount"], ["prices", "price"], ["prices", "amount"], ["prices", "price_tax_exc"]]),
    pickNestedValue(product, [["formatted_prices", "unit_amount"], ["formatted_prices", "price"], ["formatted_prices", "amount"]]),
  ];

  for (const candidate of candidateValues) {
    const parsed = parseLocalizedNumber(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  console.warn("Unable to parse Sellsy product price", {
    sellsyId: product.id ?? product.sellsy_id ?? null,
    sku: product.sku ?? product.reference ?? null,
    availableKeys: Object.keys(product),
  });

  return 0;
}

function normalizeProduct(product: JsonRecord): ProductRow {
  const sellsyId = String(product.id ?? product.sellsy_id ?? product.reference ?? crypto.randomUUID());
  const description = typeof product.description === "string" ? product.description : null;

  return {
    sellsy_id: sellsyId,
    sku: product.sku ? String(product.sku) : product.reference ? String(product.reference) : null,
    name: String(product.name ?? product.label ?? product.designation),
    description,
    origin: product.origin ? String(product.origin) : null,
    roast_level: inferRoastLevel(product, description),
    price_per_kg: extractProductPrice(product),
    is_active: product.is_active === false ? false : product.active === false ? false : true,
    synced_at: new Date().toISOString(),
  };
}

function normalizeProducts(products: JsonRecord[]) {
  return products.filter(isCoffeeProduct).map(normalizeProduct);
}

function normalizeClient(client: JsonRecord): AdminClientRow {
  const addressRecord = (client.addresses ?? client.address ?? client.main_address ?? null) as JsonRecord | JsonRecord[] | null;
  const primaryAddress = Array.isArray(addressRecord)
    ? addressRecord.find((entry) => entry && typeof entry === "object") ?? null
    : addressRecord && typeof addressRecord === "object"
      ? addressRecord
      : null;

  const statsRecord = (client.stats ?? client.statistics ?? client.kpis ?? null) as JsonRecord | null;
  const id = String(client.id ?? client.thirdid ?? client.reference ?? crypto.randomUUID());
  const firstName = pickFirstString(client.firstname, client.first_name, client.given_name);
  const lastName = pickFirstString(client.lastname, client.last_name, client.family_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    id,
    name: pickFirstString(client.name, client.full_name, client.label, fullName) ?? `Client ${id}`,
    email: pickFirstString(
      client.email,
      client.main_email,
      pickNestedString(client, [["contact", "email"], ["main_contact", "email"]]),
    ),
    phone: pickFirstString(
      client.phone,
      client.mobile,
      client.tel,
      client.main_phone,
      pickNestedString(client, [["contact", "phone"], ["main_contact", "phone"]]),
    ),
    address: pickFirstString(
      primaryAddress ? (primaryAddress as JsonRecord).address1 : null,
      primaryAddress ? (primaryAddress as JsonRecord).line1 : null,
      client.address1,
      client.address,
    ),
    city: pickFirstString(
      primaryAddress ? (primaryAddress as JsonRecord).city : null,
      client.city,
      client.town,
    ),
    country: pickFirstString(
      primaryAddress ? (primaryAddress as JsonRecord).country : null,
      primaryAddress ? (primaryAddress as JsonRecord).country_name : null,
      client.country,
    ),
    client_type: pickFirstString(client.type, client.entity_type, client.kind),
    total_orders: pickNumber(
      statsRecord?.orders_count ?? client.orders_count ?? client.order_count ?? client.nb_orders,
    ),
    total_spend: pickNumber(
      statsRecord?.turnover ?? client.turnover ?? client.total_invoiced ?? client.total_spent,
    ),
    last_order_at: pickFirstString(
      statsRecord?.last_order_at,
      client.last_order_at,
      client.last_invoice_date,
      client.updated_at,
    ),
  };
}

async function syncProductsToDatabase(rows: ProductRow[]) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("products").upsert(rows, {
    onConflict: "sellsy_id",
  });

  if (error) {
    throw new Error(`Product upsert failed: ${error.message}`);
  }
}

function buildSellsyOrderPayload(body: JsonRecord, user: AuthenticatedUser): JsonRecord {
  const items = Array.isArray(body.items) ? (body.items as SellsyOrderLine[]) : [];

  return {
    source: "PluralRoaster",
    external_reference: body.orderId,
    ordered_at: body.createdAt,
    delivery_date: body.deliveryDate,
    customer: body.customer ?? {
      email: user.email,
    },
    notes: body.notes ?? null,
    lines: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unit: "kg",
      unit_price: item.pricePerKg,
      total_price: item.totalPrice,
    })),
    totals: {
      total_kg: body.totalKg,
      total_price: body.totalPrice,
    },
    metadata: {
      user_id: user.userId,
      app: "PluralRoaster",
    },
  };
}

async function handleProductSync(user: AuthenticatedUser, accessToken: string) {
  const sellsyProducts = await fetchSellsyProducts(accessToken);
  const normalizedProducts = normalizeProducts(sellsyProducts);
  await syncProductsToDatabase(normalizedProducts);

  return jsonResponse({
    success: true,
    mode: "sync-products",
    syncedCount: normalizedProducts.length,
    requestedBy: user.userId,
  });
}

async function handleClientList(user: AuthenticatedUser, accessToken: string) {
  const sellsyClients = await fetchSellsyClients(accessToken);
  const normalizedClients = sellsyClients.map(normalizeClient);

  return jsonResponse({
    success: true,
    mode: "list-clients",
    clients: normalizedClients,
    requestedBy: user.userId,
  });
}

async function handleOrderSync(user: AuthenticatedUser, accessToken: string, body: JsonRecord) {
  const sellsyPayload = buildSellsyOrderPayload(body, user);
  const sellsyResponse = await createSellsyOrder(accessToken, sellsyPayload);

  return jsonResponse({
    success: true,
    mode: "order",
    sellsyResponse,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const accessToken = await getSellsyAccessToken();

    if (body?.mode === "sync-products") {
      return await handleProductSync(user, accessToken);
    }

    if (body?.mode === "list-clients") {
      return await handleClientList(user, accessToken);
    }

    return await handleOrderSync(user, accessToken, body);
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
