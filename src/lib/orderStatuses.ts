/* ─── Order Status System ─── */

export const ORDER_STATUSES = [
  "received",
  "approved",
  "in_production",
  "ready_for_packaging",
  "packaging",
  "ready_for_delivery",
  "shipped",
  "delivered",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Received",
  approved: "Approved",
  in_production: "In Production",
  ready_for_packaging: "Ready for Packaging",
  packaging: "Packaging",
  ready_for_delivery: "Ready for Delivery",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  received: "bg-muted text-muted-foreground border-border",
  approved: "bg-info/10 text-info border-info/20",
  in_production: "bg-primary/10 text-primary border-primary/20",
  ready_for_packaging: "bg-warning/10 text-warning border-warning/20",
  packaging: "bg-warning/15 text-warning border-warning/30",
  ready_for_delivery: "bg-info/10 text-info border-info/20",
  shipped: "bg-info/15 text-info border-info/30",
  delivered: "bg-success/10 text-success border-success/20",
};

/** Backwards-compat: map old statuses to new */
export function normalizeOrderStatus(raw: string): OrderStatus {
  if (ORDER_STATUSES.includes(raw as OrderStatus)) return raw as OrderStatus;
  if (raw === "draft") return "received";
  if (raw === "approved") return "approved";
  if (raw === "sent_to_sellsy" || raw === "synced" || raw === "confirmed" || raw === "fulfilled") return "delivered";
  if (raw === "error") return "received";
  return "received";
}

/** Get next logical status */
export function getNextStatus(current: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUSES.indexOf(current);
  if (idx < 0 || idx >= ORDER_STATUSES.length - 1) return null;
  return ORDER_STATUSES[idx + 1];
}

/** Priority classification based on delivery date */
export type PriorityLevel = "urgent" | "normal" | "low";

export function getOrderPriority(deliveryDate: string): PriorityLevel {
  const delivery = new Date(deliveryDate);
  const now = new Date();
  const diffMs = delivery.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 48) return "urgent";
  if (diffHours <= 96) return "normal";
  return "low";
}

export const PRIORITY_CLASS: Record<PriorityLevel, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  normal: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  urgent: "Urgent",
  normal: "Normal",
  low: "Low",
};
