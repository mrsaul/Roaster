// ── PluralRoaster — New Order Notification ───────────────────────────────────
// Triggered by a Supabase Database Webhook on INSERT to public.orders.
// Sends:
//   1. Email to admin with full order details
//   2. Confirmation email to the client
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — from resend.com
//   ADMIN_EMAIL      — e.g. orders@pluralroaster.com
//   FROM_EMAIL       — e.g. noreply@pluralroaster.com (verified in Resend)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OrderItem = {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  price_per_kg: number;
};

type Profile = { id: string; full_name: string | null; email: string | null };

async function sendEmail(
  apiKey: string,
  to: string,
  from: string,
  subject: string,
  html: string,
): Promise<void> {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend error ${resp.status}: ${text}`);
  }
}

function orderTable(items: OrderItem[]): string {
  const rows = items
    .map((item) => {
      const total = (Number(item.quantity) * Number(item.price_per_kg)).toFixed(2);
      return `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${item.product_name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666">${item.product_sku ?? "—"}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${Number(item.quantity).toFixed(2)} kg</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">€${Number(item.price_per_kg).toFixed(2)}/kg</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">€${total}</td>
        </tr>`;
    })
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;text-align:left;font-weight:600">Product</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#666">SKU</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600">Qty (kg)</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600">€/kg</th>
          <th style="padding:8px 12px;text-align:right;font-weight:600">Total HT</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "noreply@pluralroaster.com";

    if (!resendKey || !adminEmail) {
      console.warn("[notify-new-order] Missing RESEND_API_KEY or ADMIN_EMAIL — skipping emails");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Webhook payload from Supabase DB webhook
    const payload = await req.json() as {
      type: string;
      table: string;
      record: Record<string, unknown>;
    };

    if (payload.type !== "INSERT" || payload.table !== "orders") {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const order = payload.record;
    const orderId = order.id as string;
    const userId = order.user_id as string;
    const deliveryDate = order.delivery_date as string;
    const totalPrice = Number(order.total_price);
    const totalKg = Number(order.total_kg);
    const notes = (order.notes as string | null) ?? null;

    // Fetch order items + client profile using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const [{ data: itemsRaw }, { data: profileRaw }] = await Promise.all([
      db.from("order_items").select("product_name,product_sku,quantity,price_per_kg").eq("order_id", orderId),
      db.from("profiles").select("id,full_name,email").eq("id", userId).single(),
    ]);

    const items = (itemsRaw ?? []) as OrderItem[];
    const profile = profileRaw as Profile | null;
    const clientName = profile?.full_name ?? profile?.email ?? "Client";
    const clientEmail = profile?.email;

    const vatAmount = totalPrice * 0.20;
    const totalTTC = totalPrice + vatAmount;
    const ref = orderId.slice(0, 8).toUpperCase();

    // ── Admin notification email ───────────────────────────────────────────

    const adminHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
        <h2 style="margin:0 0 4px">New order received 🎉</h2>
        <p style="color:#666;margin:0 0 24px">Order #${ref} from <strong>${clientName}</strong></p>

        ${orderTable(items)}

        <table style="width:100%;margin-top:8px;font-size:14px">
          <tr><td style="padding:6px 0;color:#666">Subtotal HT</td><td style="text-align:right">€${totalPrice.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">VAT (20%)</td><td style="text-align:right">€${vatAmount.toFixed(2)}</td></tr>
          <tr style="font-weight:700"><td style="padding:6px 0">Total TTC</td><td style="text-align:right">€${totalTTC.toFixed(2)}</td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:14px;color:#444"><strong>Delivery date:</strong> ${deliveryDate}</p>
        <p style="font-size:14px;color:#444"><strong>Total weight:</strong> ${totalKg.toFixed(2)} kg</p>
        ${notes ? `<p style="font-size:14px;color:#444"><strong>Notes:</strong> ${notes}</p>` : ""}
        ${clientEmail ? `<p style="font-size:14px;color:#444"><strong>Client email:</strong> ${clientEmail}</p>` : ""}
      </div>`;

    await sendEmail(resendKey, adminEmail, fromEmail, `New order #${ref} — ${clientName}`, adminHtml);

    // ── Client confirmation email ──────────────────────────────────────────

    if (clientEmail) {
      const clientHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="margin:0 0 4px">Your order has been confirmed ✅</h2>
          <p style="color:#666;margin:0 0 8px">Hi ${clientName}, we've received your order.</p>
          <p style="color:#666;margin:0 0 24px;font-size:14px">Reference: <strong>#${ref}</strong></p>

          ${orderTable(items)}

          <table style="width:100%;margin-top:8px;font-size:14px">
            <tr><td style="padding:6px 0;color:#666">Subtotal HT</td><td style="text-align:right">€${totalPrice.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#666">VAT (20%)</td><td style="text-align:right">€${vatAmount.toFixed(2)}</td></tr>
            <tr style="font-weight:700"><td style="padding:6px 0">Total TTC</td><td style="text-align:right">€${totalTTC.toFixed(2)}</td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="font-size:14px;color:#444"><strong>Delivery date:</strong> ${deliveryDate}</p>
          ${notes ? `<p style="font-size:14px;color:#444"><strong>Your notes:</strong> ${notes}</p>` : ""}
          <p style="font-size:14px;color:#666;margin-top:20px">
            Our team will process your order shortly. You will hear from us if anything changes.
          </p>
        </div>`;

      await sendEmail(resendKey, clientEmail, fromEmail, `Order confirmed — #${ref}`, clientHtml);
    }

    return new Response(
      JSON.stringify({ success: true, orderId, notifiedAdmin: true, notifiedClient: !!clientEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-new-order]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
