// ============================================================
// POS Yoga — Cart Store (Zustand)
// ============================================================

import { create } from 'zustand';

export interface CartItem {
  cartItemId: string; // combination of productId + variantId
  productId: string;
  productName: string;
  price: number;
  qty: number;
  subtotal: number;
  variantId?: string;
  variantName?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (
    product: { id: string; name: string; price: number },
    variant?: { id: string; name: string; additionalPrice: number }
  ) => void;
  removeItem: (cartItemId: string) => void;
  updateQty: (cartItemId: string, qty: number) => void;
  incrementQty: (cartItemId: string) => void;
  decrementQty: (cartItemId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, variant) => {
    set((state) => {
      const finalPrice = product.price + (variant ? Number(variant.additionalPrice) : 0);
      const variantId = variant?.id;
      const variantName = variant?.name;
      const cartItemId = product.id + (variantId ? `-${variantId}` : '');

      const existing = state.items.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.cartItemId === cartItemId
              ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
              : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            cartItemId,
            productId: product.id,
            productName: variantName ? `${product.name} (${variantName})` : product.name,
            price: finalPrice,
            qty: 1,
            subtotal: finalPrice,
            variantId,
            variantName,
          },
        ],
      };
    });
  },

  removeItem: (cartItemId) => {
    set((state) => ({
      items: state.items.filter((i) => i.cartItemId !== cartItemId),
    }));
  },

  updateQty: (cartItemId, qty) => {
    if (qty <= 0) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.cartItemId === cartItemId ? { ...i, qty, subtotal: qty * i.price } : i,
      ),
    }));
  },

  incrementQty: (cartItemId) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.cartItemId === cartItemId
          ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
          : i,
      ),
    }));
  },

  decrementQty: (cartItemId) => {
    const item = get().items.find((i) => i.cartItemId === cartItemId);
    if (item && item.qty <= 1) {
      get().removeItem(cartItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.cartItemId === cartItemId
          ? { ...i, qty: i.qty - 1, subtotal: (i.qty - 1) * i.price }
          : i,
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),

  getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
}));
