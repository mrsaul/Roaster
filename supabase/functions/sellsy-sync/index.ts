// HIDDEN — Sellsy sync disabled. Preserved for future use.
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
  sellsy_tax_id: string | null;
  sellsy_tax_rate: number | null;
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
  const supabase = createUserScopedSupabaseClient(authHeader);

  // Use standard getUser() — getClaims() is non-standard and may not exist
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw errorResponse(401, "Unauthorized");
  }

  const userId = user.id;
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
    email: user.email ?? null,
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

function extractPaginationInfo(data: unknown): { totalPages: number; currentPage: number } | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as JsonRecord;
  const pagination = obj.pagination as JsonRecord | undefined;
  if (pagination && typeof pagination === "object") {
    const totalPages = Number(pagination.total_pages ?? pagination.last_page ?? pagination.pages ?? 1);
    const currentPage = Number(pagination.current_page ?? pagination.page ?? 1);
    if (Number.isFinite(totalPages) && Number.isFinite(currentPage)) {
      return { totalPages, currentPage };
    }
  }
  // Some APIs put pagination at the top level
  const totalPages = Number(obj.total_pages ?? obj.last_page ?? 0);
  if (totalPages > 0) {
    return { totalPages, currentPage: Number(obj.current_page ?? obj.page ?? 1) };
  }
  return null;
}

async function fetchSellsyProducts(accessToken: string) {
  const allItems: JsonRecord[] = [];
  const limit = 100;

  // Try paginated GET first
  const firstPage = await fetchSellsy(`/v2/items?limit=${limit}&page=1`, accessToken, { method: "GET" });

  if (firstPage.response.ok) {
    const items = extractSellsyCollection(firstPage.payload.data);
    allItems.push(...items);

    const pageInfo = extractPaginationInfo(firstPage.payload.data);
    if (pageInfo && pageInfo.totalPages > 1) {
      for (let page = 2; page <= pageInfo.totalPages; page++) {
        const nextPage = await fetchSellsy(`/v2/items?limit=${limit}&page=${page}`, accessToken, { method: "GET" });
        if (nextPage.response.ok) {
          allItems.push(...extractSellsyCollection(nextPage.payload.data));
        }
      }
    }

    console.log(`Fetched ${allItems.length} items from Sellsy (${pageInfo?.totalPages ?? 1} page(s))`);
    return allItems;
  }

  // Fallback: search endpoint with pagination
  const searchPayloadCandidates: JsonRecord[] = [
    { filters: {}, limit },
    { filters: {}, page: 1, limit },
  ];

  let lastSearchError: string | null = null;

  for (const candidatePayload of searchPayloadCandidates) {
    const searchRequest = await fetchSellsy("/v2/items/search", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidatePayload),
    });

    if (searchRequest.response.ok) {
      const items = extractSellsyCollection(searchRequest.payload.data);
      allItems.push(...items);

      const pageInfo = extractPaginationInfo(searchRequest.payload.data);
      if (pageInfo && pageInfo.totalPages > 1) {
        for (let page = 2; page <= pageInfo.totalPages; page++) {
          const nextSearch = await fetchSellsy("/v2/items/search", accessToken, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...candidatePayload, page }),
          });
          if (nextSearch.response.ok) {
            allItems.push(...extractSellsyCollection(nextSearch.payload.data));
          }
        }
      }

      console.log(`Fetched ${allItems.length} items from Sellsy search (${pageInfo?.totalPages ?? 1} page(s))`);
      return allItems;
    }

    lastSearchError = searchRequest.payload.text;
  }

  throw new Error(
    `Sellsy product fetch failed: ${lastSearchError || firstPage.payload.text || "Unknown Sellsy search error"}`,
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
    product.reference_price,
    product.price_excl_tax,
    product.reference_price_taxes_exc,
    product.reference_price_taxes_inc,
    product.purchase_amount,
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
      return { price: parsed, parseError: null };
    }
  }

  const parseError: ProductParseError = {
    sellsy_id: pickString(product.id) ?? pickString(product.sellsy_id) ?? pickString(product.reference),
    sku: pickString(product.sku) ?? pickString(product.reference),
    name: pickFirstString(product.name, product.label, product.designation),
    message: "Unable to parse Sellsy product price",
    available_keys: Object.keys(product),
  };

  console.warn(parseError.message, parseError);

  return { price: 0, parseError };
}

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

function normalizeProducts(products: JsonRecord[]) {
  return products.reduce(
    (acc, product) => {
      // Skip items with no usable name
      const rawName = product.name ?? product.label ?? product.designation;
      if (!rawName) return acc;

      const normalized = normalizeProduct(product);
      acc.rows.push(normalized.row);
      if (normalized.parseError) {
        acc.parseErrors.push(normalized.parseError);
      }
      return acc;
    },
    { rows: [] as ProductRow[], parseErrors: [] as ProductParseError[] },
  );
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

async function logSyncRun(params: {
  userId: string;
  status: string;
  syncedCount: number;
  parseErrors: ProductParseError[];
  startedAt: string;
  completedAt: string;
  syncType?: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("sync_runs").insert({
    source: "sellsy",
    sync_type: params.syncType ?? "products",
    status: params.status,
    synced_count: params.syncedCount,
    parse_errors: params.parseErrors,
    started_at: params.startedAt,
    completed_at: params.completedAt,
    created_by: params.userId,
  });

  if (error) {
    console.error("Failed to log sync run:", error.message);
  }
}

function buildSellsyOrderPayload(body: JsonRecord, user: AuthenticatedUser): JsonRecord {
  const items = Array.isArray(body.items) ? (body.items as SellsyOrderLine[]) : [];
  const sellsyClientId = body.sellsy_client_id as string | undefined;

  const payload: JsonRecord = {
    source: "PluralRoaster",
    external_reference: String(body.orderId ?? ""),
    ordered_at: body.createdAt ?? new Date().toISOString(),
    delivery_date: body.deliveryDate,
    notes: body.notes ?? "",
    rows: items.map((item) => ({
      type: "item",
      reference: item.sku ?? "",
      description: item.name ?? "",
      quantity: String(item.quantity ?? 1),
      unit_amount: String(item.pricePerKg ?? 0),
      tax_id: null,
    })),
  };

  if (!sellsyClientId) {
    throw new Error(
      "Cannot create Sellsy order: this client has no Sellsy Client ID. " +
      "Please sync the client from Sellsy or assign a Sellsy Client ID in the client settings before invoicing."
    );
  }

  payload.related = [{ type: "company", id: Number(sellsyClientId) }];

  return payload;
}

async function handleProductSync(user: AuthenticatedUser, accessToken: string) {
  const startedAt = new Date().toISOString();

  try {
    const sellsyProducts = await fetchSellsyProducts(accessToken);
    const { rows, parseErrors } = normalizeProducts(sellsyProducts);
    await syncProductsToDatabase(rows);
    const completedAt = new Date().toISOString();
    await logSyncRun({
      userId: user.userId,
      status: parseErrors.length > 0 ? "warning" : "success",
      syncedCount: rows.length,
      parseErrors,
      startedAt,
      completedAt,
    });

    return jsonResponse({
      success: true,
      mode: "sync-products",
      syncedCount: rows.length,
      parseErrors,
      requestedBy: user.userId,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    await logSyncRun({
      userId: user.userId,
      status: "error",
      syncedCount: 0,
      parseErrors: [],
      startedAt,
      completedAt,
    });
    throw error;
  }
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

async function handleBulkClientSync(user: AuthenticatedUser, accessToken: string) {
  const startedAt = new Date().toISOString();
  const sellsyClients = await fetchSellsyClients(accessToken);
  const normalizedClients = sellsyClients.map(normalizeClient);

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  let syncedCount = 0;

  for (const client of normalizedClients) {
    const address = [client.address, client.city, client.country].filter(Boolean).join(", ") || null;

    // Check if a company already exists with this sellsy_client_id
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("sellsy_client_id", client.id)
      .maybeSingle();

    if (existing) {
      // Update Sellsy-sourced fields
      await supabase
        .from("companies")
        .update({
          name: client.name,
          email: client.email,
          phone: client.phone,
          last_synced_at: now,
        })
        .eq("id", existing.id);

      // Update delivery address
      if (address) {
        const { data: existingAddr } = await supabase
          .from("company_addresses")
          .select("id")
          .eq("company_id", existing.id)
          .eq("label", "Delivery")
          .maybeSingle();

        if (existingAddr) {
          await supabase.from("company_addresses")
            .update({ address_line1: address })
            .eq("id", existingAddr.id);
        } else {
          await supabase.from("company_addresses").insert({
            company_id: existing.id,
            label: "Delivery",
            address_line1: address,
          });
        }
      }
    } else {
      // Insert new company
      const { data: newCompany } = await supabase
        .from("companies")
        .insert({
          name: client.name,
          email: client.email,
          phone: client.phone,
          sellsy_client_id: client.id,
          sellsy_id: client.id,
          client_data_mode: "sellsy",
          onboarding_status: "completed",
          last_synced_at: now,
        })
        .select("id")
        .single();

      if (newCompany && address) {
        await supabase.from("company_addresses").insert({
          company_id: newCompany.id,
          label: "Delivery",
          address_line1: address,
        });
      }

      // Create a placeholder primary contact (no user_id — not yet linked to auth)
      if (newCompany) {
        await supabase.from("contacts").insert({
          company_id: newCompany.id,
          last_name: client.name,
          email: client.email,
          phone: client.phone,
          is_primary: true,
        });
      }
    }
    syncedCount++;
  }

  const completedAt = new Date().toISOString();
  await logSyncRun({
    userId: user.userId,
    status: "success",
    syncedCount,
    parseErrors: [],
    startedAt,
    completedAt,
    syncType: "clients",
  });

  return jsonResponse({
    success: true,
    mode: "sync-all-clients",
    syncedCount,
    requestedBy: user.userId,
  });
}

async function handleClientSync(user: AuthenticatedUser, accessToken: string, body: JsonRecord) {
  const sellsyClientId = String(body.sellsy_client_id ?? "");
  const clientOnboardingId = String(body.client_id ?? "");

  if (!sellsyClientId || !clientOnboardingId) {
    return jsonResponse({ success: false, error: "sellsy_client_id and client_id are required" }, 400);
  }

  // Fetch this specific client from Sellsy
  let clientData: JsonRecord | null = null;

  for (const endpoint of ["/v2/companies", "/v2/contacts"]) {
    const req = await fetchSellsy(`${endpoint}/${sellsyClientId}`, accessToken, { method: "GET" });
    if (req.response.ok && req.payload.data && typeof req.payload.data === "object") {
      clientData = req.payload.data as JsonRecord;
      break;
    }
  }

  if (!clientData) {
    return jsonResponse({ success: false, error: `Sellsy client ${sellsyClientId} not found` }, 404);
  }

  const normalized = normalizeClient(clientData);
  const now = new Date().toISOString();

  const supabase = createServiceSupabaseClient();
  // Update the company (clientOnboardingId is the company UUID — same UUID was kept during migration)
  const { error } = await supabase
    .from("companies")
    .update({
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
      last_synced_at: now,
    })
    .eq("id", clientOnboardingId);

  if (error) {
    throw new Error(`Failed to update company: ${error.message}`);
  }

  // Also update primary contact's email/phone
  await supabase
    .from("contacts")
    .update({ email: normalized.email, phone: normalized.phone })
    .eq("company_id", clientOnboardingId)
    .eq("is_primary", true);

  return jsonResponse({
    success: true,
    mode: "sync-client",
    client: normalized,
    synced_at: now,
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

// ── Health check ──────────────────────────────────────────────────────────────
// Verifies env vars, OAuth token acquisition, and a lightweight Sellsy probe
// in a single round-trip. Returns a structured status object so callers can
// surface connection problems without running a full sync.

async function handleHealthCheck(user: AuthenticatedUser) {
  const checks: Record<string, { ok: boolean; detail?: string; latency_ms?: number }> = {};

  // 1. Env vars
  const missingEnvVars = (
    [
      ["SELLSY_CLIENT_ID",     SELLSY_CLIENT_ID],
      ["SELLSY_CLIENT_SECRET", SELLSY_CLIENT_SECRET],
      ["SUPABASE_URL",         SUPABASE_URL],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  checks.env_vars = {
    ok: missingEnvVars.length === 0,
    detail: missingEnvVars.length === 0
      ? "All required env vars are set"
      : `Missing: ${missingEnvVars.join(", ")}`,
  };

  if (!checks.env_vars.ok) {
    return jsonResponse({ success: false, mode: "health-check", checks, requestedBy: user.userId }, 503);
  }

  // 2. OAuth token
  let accessToken: string | null = null;
  {
    const t0 = Date.now();
    try {
      accessToken = await getSellsyAccessToken();
      checks.oauth_token = { ok: true, detail: "Token acquired successfully", latency_ms: Date.now() - t0 };
    } catch (err) {
      checks.oauth_token = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - t0,
      };
      return jsonResponse({ success: false, mode: "health-check", checks, requestedBy: user.userId }, 503);
    }
  }

  // 3. Lightweight API probe — fetch exactly 1 item to confirm connectivity + auth
  {
    const t0 = Date.now();
    try {
      const probe = await fetchSellsy("/v2/items?limit=1", accessToken, { method: "GET" });
      const latency_ms = Date.now() - t0;
      if (probe.response.ok) {
        const items = extractSellsyCollection(probe.payload.data);
        checks.api_probe = {
          ok: true,
          detail: `Sellsy reachable — ${items.length} item(s) in probe response`,
          latency_ms,
        };
      } else {
        checks.api_probe = {
          ok: false,
          detail: `HTTP ${probe.response.status}: ${probe.payload.text.slice(0, 200)}`,
          latency_ms,
        };
      }
    } catch (err) {
      checks.api_probe = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - t0,
      };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return jsonResponse({
    success: allOk,
    mode: "health-check",
    checks,
    requestedBy: user.userId,
  }, allOk ? 200 : 503);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as JsonRecord;

    if (body?.mode === "health-check") {
      return await handleHealthCheck(user);
    }

    const accessToken = await getSellsyAccessToken();

    if (body?.mode === "sync-products") {
      return await handleProductSync(user, accessToken);
    }

    if (body?.mode === "list-clients") {
      return await handleClientList(user, accessToken);
    }

    if (body?.mode === "sync-all-clients") {
      return await handleBulkClientSync(user, accessToken);
    }

    if (body?.mode === "sync-client") {
      return await handleClientSync(user, accessToken, body);
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
