// ============================================================
// POS Yoga — Cart Store (Zustand)
// ============================================================

import { create } from 'zustand';

export interface CartItem {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: { id: string; name: string; price: number }) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  incrementQty: (productId: string) => void;
  decrementQty: (productId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id
              ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
              : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            productName: product.name,
            price: product.price,
            qty: 1,
            subtotal: product.price,
          },
        ],
      };
    });
  },

  removeItem: (productId) => {
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    }));
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId ? { ...i, qty, subtotal: qty * i.price } : i,
      ),
    }));
  },

  incrementQty: (productId) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId
          ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
          : i,
      ),
    }));
  },

  decrementQty: (productId) => {
    const item = get().items.find((i) => i.productId === productId);
    if (item && item.qty <= 1) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId
          ? { ...i, qty: i.qty - 1, subtotal: (i.qty - 1) * i.price }
          : i,
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),

  getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
}));
