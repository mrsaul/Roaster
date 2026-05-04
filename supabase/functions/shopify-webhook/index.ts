// supabase/functions/shopify-webhook/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// ─── NOTE ────────────────────────────────────────────────────────────────────
// Two schema constraints must be relaxed before this function can insert rows:
//   ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
//   ALTER TABLE public.order_status_history ALTER COLUMN changed_by DROP NOT NULL;
// Add a migration for both before deploying.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");

function requireEnv(value: string | undefined | null, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createServiceSupabaseClient() {
  return createClient(
    requireEnv(SUPABASE_URL, "SUPABASE_URL"),
    requireEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  );
}

// Constant-time byte comparison — prevents timing attacks on HMAC verify
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyShopifyHmac(
  rawBody: string,
  headerHmac: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return timingSafeEqual(
    new TextEncoder().encode(computed),
    new TextEncoder().encode(headerHmac),
  );
}

type ShopifyLineItem = {
  sku: string | null;
  title: string;
  quantity: number;
  grams: number;
  price: string;
  variant_title: string | null;
};

type ShopifyOrder = {
  id: number;
  order_number: number;
  customer?: { first_name?: string; last_name?: string; email?: string };
  line_items: ShopifyLineItem[];
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
};

Deno.serve(async (req) => {
  // 1. VALIDATE — method
  if (req.method !== "POST") {
    console.log(`[shopify-webhook] Rejected ${req.method} — only POST allowed`);
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. VALIDATE — HMAC signature
  const headerHmac = req.headers.get("x-shopify-hmac-sha256");
  if (!headerHmac) {
    console.log("[shopify-webhook] Missing x-shopify-hmac-sha256 header");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const rawBody = await req.text();
  console.log(`[shopify-webhook] Received payload (${rawBody.length} bytes)`);

  let secret: string;
  try {
    secret = requireEnv(SHOPIFY_WEBHOOK_SECRET, "SHOPIFY_WEBHOOK_SECRET");
  } catch (err) {
    console.error("[shopify-webhook] Missing env var:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const valid = await verifyShopifyHmac(rawBody, headerHmac, secret);
  if (!valid) {
    console.log("[shopify-webhook] HMAC mismatch — unauthorized");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  console.log("[shopify-webhook] HMAC verified");

  // 2. PARSE
  let shopifyOrder: ShopifyOrder;
  try {
    shopifyOrder = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    console.error("[shopify-webhook] Failed to parse JSON body");
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const shopifyOrderId = String(shopifyOrder.id);
  const orderNumber = shopifyOrder.order_number ? String(shopifyOrder.order_number) : null;
  const customerName = [
    shopifyOrder.customer?.first_name,
    shopifyOrder.customer?.last_name,
  ]
    .filter(Boolean)
    .join(" ") || null;
  const customerEmail = shopifyOrder.customer?.email ?? null;
  const lineItems = shopifyOrder.line_items ?? [];
  const totalPrice = parseFloat(shopifyOrder.total_price) || 0;
  const currency = shopifyOrder.currency ?? "EUR";
  const financialStatus = shopifyOrder.financial_status ?? null;
  const fulfillmentStatus = shopifyOrder.fulfillment_status ?? null;

  console.log(`[shopify-webhook] Parsed order shopify_id=${shopifyOrderId} order_number=${orderNumber}`);

  const supabase = createServiceSupabaseClient();

  // 3. DEDUPLICATE
  console.log(`[shopify-webhook] Checking for existing shopify_orders row for id=${shopifyOrderId}`);
  const { data: existing, error: dedupError } = await supabase
    .from("shopify_orders")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();

  if (dedupError) {
    console.error("[shopify-webhook] Dedup check failed:", dedupError.message);
    return jsonResponse({ error: dedupError.message }, 500);
  }
  if (existing) {
    console.log(`[shopify-webhook] Already processed shopify_id=${shopifyOrderId} — skipping`);
    return jsonResponse({ status: "already_processed" });
  }

  // 4. INSERT shopify_orders row
  console.log("[shopify-webhook] Inserting shopify_orders row");
  const { data: shopifyRow, error: shopifyInsertError } = await supabase
    .from("shopify_orders")
    .insert({
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderNumber,
      customer_name: customerName,
      customer_email: customerEmail,
      line_items: lineItems,
      total_price: totalPrice,
      currency,
      financial_status: financialStatus,
      fulfillment_status: fulfillmentStatus,
      raw_payload: JSON.parse(rawBody),
    })
    .select("id")
    .single();

  if (shopifyInsertError || !shopifyRow) {
    console.error("[shopify-webhook] shopify_orders insert failed:", shopifyInsertError?.message);
    return jsonResponse({ error: shopifyInsertError?.message ?? "Insert failed" }, 500);
  }
  const shopifyRowId: string = shopifyRow.id;
  console.log(`[shopify-webhook] shopify_orders row created id=${shopifyRowId}`);

  // 5. MATCH PRODUCTS
  type MatchedItem = {
    productId: string;
    productName: string;
    quantityKg: number;
    unitPrice: number;
    variantTitle: string;
  };

  const matchedItems: MatchedItem[] = [];

  for (const item of lineItems) {
    const quantityKg =
      item.grams && item.grams > 0
        ? (item.grams / 1000) * item.quantity
        : item.quantity;

    console.log(`[shopify-webhook] Matching line_item sku=${item.sku} title="${item.title}"`);

    let product: { id: string; name: string } | null = null;

    // a. Try SKU match
    if (item.sku) {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("sku", item.sku)
        .maybeSingle();
      if (data) {
        product = data;
        console.log(`[shopify-webhook] Matched by SKU: product_id=${product.id}`);
      }
    }

    // b. Try ILIKE name match
    if (!product && item.title) {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", `%${item.title}%`)
        .limit(1)
        .maybeSingle();
      if (data) {
        product = data;
        console.log(`[shopify-webhook] Matched by name ILIKE: product_id=${product.id}`);
      }
    }

    // c. No match — skip with warning
    if (!product) {
      console.warn(
        `[shopify-webhook] No product match for sku=${item.sku} title="${item.title}" — skipping line item`,
      );
      continue;
    }

    const unitPrice = parseFloat(item.price) || 0;
    const pricePerKg = quantityKg > 0
      ? Math.round((unitPrice / quantityKg) * 100) / 100
      : 0;

    matchedItems.push({
      productId: product.id,
      productName: product.name,
      quantityKg,
      unitPrice: pricePerKg,
      variantTitle: item.variant_title ?? "",
    });
  }

  const totalKg = matchedItems.reduce((sum, i) => sum + i.quantityKg, 0);
  console.log(`[shopify-webhook] Matched ${matchedItems.length}/${lineItems.length} line items, total_kg=${totalKg}`);

  // 6. CREATE internal order
  console.log("[shopify-webhook] Inserting internal order");
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: null,
      status: "received",
      total_kg: totalKg,
      total_price: totalPrice,
      notes: `Shopify order #${orderNumber}`,
      confirmed_at: new Date().toISOString(),
      // delivery_date has no Shopify equivalent — set to today as a placeholder
      delivery_date: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[shopify-webhook] orders insert failed:", orderError?.message);
    return jsonResponse({ error: orderError?.message ?? "Order insert failed" }, 500);
  }
  const orderId: string = order.id;
  console.log(`[shopify-webhook] Internal order created order_id=${orderId}`);

  // Insert order_items
  if (matchedItems.length > 0) {
    const orderItemsPayload = matchedItems.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantityKg,
      price_per_kg: item.unitPrice,
      size_label: item.variantTitle,
      size_kg: item.quantityKg,
    }));

    console.log(`[shopify-webhook] Inserting ${orderItemsPayload.length} order_items`);
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsPayload);

    if (itemsError) {
      console.error("[shopify-webhook] order_items insert failed:", itemsError.message);
      return jsonResponse({ error: itemsError.message }, 500);
    }
  }

  // Insert order_status_history
  console.log("[shopify-webhook] Inserting order_status_history");
  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert({
      order_id: orderId,
      status: "received",
      changed_by: null,
      changed_at: new Date().toISOString(),
    });

  if (historyError) {
    console.error("[shopify-webhook] order_status_history insert failed:", historyError.message);
    return jsonResponse({ error: historyError.message }, 500);
  }

  // Update shopify_orders.synced_to_order_id
  console.log(`[shopify-webhook] Linking shopify_row=${shopifyRowId} → order_id=${orderId}`);
  const { error: linkError } = await supabase
    .from("shopify_orders")
    .update({ synced_to_order_id: orderId })
    .eq("id", shopifyRowId);

  if (linkError) {
    console.error("[shopify-webhook] synced_to_order_id update failed:", linkError.message);
    return jsonResponse({ error: linkError.message }, 500);
  }

  // 7. RETURN
  console.log(`[shopify-webhook] Done — order_id=${orderId}`);
  return jsonResponse({ status: "created", order_id: orderId });
});
