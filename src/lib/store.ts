import { useState, useCallback, useMemo } from "react";

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
}

export interface CartItem {
  product: Product;
  quantity: number; // in kg
}

export interface Order {
  id: string;
  items: CartItem[];
  totalKg: number;
  totalPrice: number;
  deliveryDate: string;
  status: "pending" | "confirmed" | "fulfilled" | "synced";
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

  const updateQuantity = useCallback((product: Product, quantity: number) => {
    setItems((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) {
        next.delete(product.id);
      } else {
        next.set(product.id, { product, quantity });
      }
      return next;
    });
  }, []);

  const hydrateCart = useCallback((cartItems: CartItem[]) => {
    setItems(new Map(cartItems.map((item) => [item.product.id, item])));
  }, []);

  const getQuantity = useCallback((productId: string) => {
    return items.get(productId)?.quantity ?? 0;
  }, [items]);

  const clearCart = useCallback(() => {
    setItems(new Map());
  }, []);

  const cartItems = useMemo(() => Array.from(items.values()), [items]);
  const totalKg = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);
  const totalPrice = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity * item.product.pricePerKg, 0), [cartItems]);

  return useMemo(
    () => ({ items: cartItems, updateQuantity, hydrateCart, getQuantity, clearCart, totalKg, totalPrice }),
    [cartItems, updateQuantity, hydrateCart, getQuantity, clearCart, totalKg, totalPrice],
  );
}
