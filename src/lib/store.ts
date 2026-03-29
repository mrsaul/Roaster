import { useState, useCallback, useMemo } from "react";

export interface ProductVariant {
  id: string;
  size_label: string; // '250g', '1kg', '3kg'
  size_kg: number;    // 0.25, 1, 3
  price: number;
  sku: string | null;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  origin: string;
  sku: string;
  pricePerKg: number;
  roastLevel: "light" | "medium" | "dark" | "espresso";
  available: boolean;
  description?: string;
  imageUrl?: string | null;
  tags?: string[];
  tastingNotes?: string | null;
  process?: string | null;
  variants?: ProductVariant[];
}

export interface CartItem {
  product: Product;
  quantity: number; // number of units (bags)
  sizeLabel?: string; // '250g', '1kg', '3kg'
  sizeKg?: number;    // 0.25, 1, 3
  unitPrice?: number; // price per bag
}

// Cart key combines product id + size for unique identification
function cartKey(productId: string, sizeLabel?: string): string {
  return sizeLabel ? `${productId}::${sizeLabel}` : productId;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  deliveryDate: string;
  status: "pending" | "confirmed" | "fulfilled" | "synced" | "received" | "approved" | "in_production" | "ready_for_packaging" | "packaging" | "ready_for_delivery" | "shipped" | "delivered";
  sellsyId?: string;
  createdAt: string;
}

export const MOCK_PRODUCTS: Product[] = [
  { id: "1", name: "Ethiopia Yirgacheffe", origin: "Ethiopia", sku: "ETH-YIR-001", pricePerKg: 24.5, roastLevel: "light", available: true },
  { id: "2", name: "Colombia Supremo", origin: "Colombia", sku: "COL-SUP-002", pricePerKg: 19.8, roastLevel: "medium", available: true },
  { id: "3", name: "Brazil Santos", origin: "Brazil", sku: "BRA-SAN-003", pricePerKg: 16.5, roastLevel: "medium", available: true },
  { id: "4", name: "Guatemala Antigua", origin: "Guatemala", sku: "GUA-ANT-004", pricePerKg: 22.0, roastLevel: "dark", available: true },
  { id: "5", name: "Kenya AA", origin: "Kenya", sku: "KEN-AA-005", pricePerKg: 28.0, roastLevel: "light", available: true },
  { id: "6", name: "Sumatra Mandheling", origin: "Indonesia", sku: "SUM-MAN-006", pricePerKg: 21.0, roastLevel: "dark", available: true },
  { id: "7", name: "Costa Rica Tarrazú", origin: "Costa Rica", sku: "CRC-TAR-007", pricePerKg: 25.5, roastLevel: "medium", available: true },
  { id: "8", name: "House Espresso Blend", origin: "Blend", sku: "BLE-ESP-008", pricePerKg: 18.0, roastLevel: "espresso", available: true },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: "ORD-001",
    items: [
      { product: MOCK_PRODUCTS[0], quantity: 10 },
      { product: MOCK_PRODUCTS[2], quantity: 15 },
    ],
    totalKg: 25,
    totalPrice: 492.5,
    deliveryDate: "2026-03-20",
    status: "synced",
    sellsyId: "SY-29481",
    createdAt: "2026-03-14",
  },
  {
    id: "ORD-002",
    items: [
      { product: MOCK_PRODUCTS[7], quantity: 20 },
    ],
    totalKg: 20,
    totalPrice: 360.0,
    deliveryDate: "2026-03-18",
    status: "fulfilled",
    sellsyId: "SY-29455",
    createdAt: "2026-03-10",
  },
];

export function useCart() {
  const [items, setItems] = useState<Map<string, CartItem>>(new Map());

  const updateQuantity = useCallback((product: Product, quantity: number, sizeLabel?: string, sizeKg?: number, unitPrice?: number) => {
    setItems((prev) => {
      const next = new Map(prev);
      const key = cartKey(product.id, sizeLabel);
      if (quantity <= 0) {
        next.delete(key);
      } else {
        next.set(key, { product, quantity, sizeLabel, sizeKg, unitPrice });
      }
      return next;
    });
  }, []);

  const hydrateCart = useCallback((cartItems: CartItem[]) => {
    setItems(new Map(cartItems.map((item) => [cartKey(item.product.id, item.sizeLabel), item])));
  }, []);

  const getQuantity = useCallback((productId: string, sizeLabel?: string) => {
    return items.get(cartKey(productId, sizeLabel))?.quantity ?? 0;
  }, [items]);

  const clearCart = useCallback(() => {
    setItems(new Map());
  }, []);

  const cartItems = useMemo(() => Array.from(items.values()), [items]);

  const totalKg = useMemo(() =>
    cartItems.reduce((sum, item) => {
      const kg = item.sizeKg ? item.sizeKg * item.quantity : item.quantity;
      return sum + kg;
    }, 0),
    [cartItems],
  );

  const totalPrice = useMemo(() =>
    cartItems.reduce((sum, item) => {
      const price = item.unitPrice
        ? item.unitPrice * item.quantity
        : item.quantity * item.product.pricePerKg;
      return sum + price;
    }, 0),
    [cartItems],
  );

  return useMemo(
    () => ({ items: cartItems, updateQuantity, hydrateCart, getQuantity, clearCart, totalKg, totalPrice }),
    [cartItems, updateQuantity, hydrateCart, getQuantity, clearCart, totalKg, totalPrice],
  );
}
