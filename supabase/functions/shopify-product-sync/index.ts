import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHOPIFY_STORE = Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "";
const SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_ADMIN_API_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShopifyVariant {
  id: number;
  sku: string;
  price: string;
  inventory_quantity: number;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  tags: string;
  status: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

async function fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let pageInfo: string | null = null;
  const limit = 250;

  do {
    const url = pageInfo
      ? `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=${limit}&page_info=${pageInfo}`
      : `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=${limit}&status=active`;

    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Shopify API error", res.status, text);
      throw new Error(`Shopify API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    products.push(...(data.products ?? []));

    // Parse Link header for pagination
    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    pageInfo = nextMatch ? nextMatch[1] : null;
  } while (pageInfo);

  return products;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
      throw new Error("SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_TOKEN env var not set");
    }

    console.log("shopify-product-sync: store =", SHOPIFY_STORE);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const shopifyProducts = await fetchAllShopifyProducts();

    let syncedCount = 0;
    const errors: { shopify_id: number; title: string; error: string }[] = [];

    for (const product of shopifyProducts) {
      try {
        const variant = product.variants?.[0];
        if (!variant) continue;

        const pricePerKg = parseFloat(variant.price);
        if (isNaN(pricePerKg) || pricePerKg <= 0) {
          errors.push({ shopify_id: product.id, title: product.title, error: `Invalid price: ${variant.price}` });
          continue;
        }

        const imageUrl = product.images?.[0]?.src ?? null;

        // Parse tags: treat comma-separated tags, look for tasting_notes:<...>, origin:<...>
        const tagList = product.tags.split(",").map((t) => t.trim()).filter(Boolean);
        const origin = tagList.find((t) => t.toLowerCase().startsWith("origin:"))?.split(":")[1]?.trim() ?? null;
        const tastingNotes = tagList.find((t) => t.toLowerCase().startsWith("tasting:"))?.split(":")[1]?.trim() ?? null;
        const cleanTags = tagList.filter((t) => !t.toLowerCase().startsWith("origin:") && !t.toLowerCase().startsWith("tasting:"));

        const record = {
          name: product.title,
          sku: variant.sku || null,
          price_per_kg: pricePerKg,
          is_active: product.status === "active",
          shopify_product_id: String(product.id),
          shopify_variant_id: String(variant.id),
          shopify_synced_at: new Date().toISOString(),
          source: "shopify",
          image_url: imageUrl,
          tags: cleanTags,
          tasting_notes: tastingNotes,
          origin: origin,
          description: product.body_html ?? null,
          data_source_mode: "custom",
          // sellsy_id remains null for Shopify-sourced products
        };

        const { error: upsertErr } = await (supabase as any)
          .from("products")
          .upsert(record, { onConflict: "shopify_product_id", ignoreDuplicates: false });

        if (upsertErr) {
          errors.push({ shopify_id: product.id, title: product.title, error: upsertErr.message });
        } else {
          syncedCount++;
        }
      } catch (err) {
        errors.push({ shopify_id: product.id, title: product.title, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        syncedCount,
        totalFetched: shopifyProducts.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("shopify-product-sync error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
