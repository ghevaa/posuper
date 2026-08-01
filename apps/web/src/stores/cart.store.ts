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
  note?: string;
}

interface CartState {
  items: CartItem[];
  orderType: 'dine_in' | 'take_away';
  tableNo: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  globalNote: string;
  addItem: (
    product: { id: string; name: string; price: number },
    variant?: { id: string; name: string; additionalPrice: number }
  ) => void;
  removeItem: (cartItemId: string) => void;
  updateQty: (cartItemId: string, qty: number) => void;
  incrementQty: (cartItemId: string) => void;
  decrementQty: (cartItemId: string) => void;
  setItemNote: (cartItemId: string, note: string) => void;
  setOrderType: (orderType: 'dine_in' | 'take_away') => void;
  setTableNo: (tableNo: string) => void;
  setDiscount: (value: number, type?: 'percent' | 'fixed') => void;
  setGlobalNote: (note: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  orderType: 'dine_in',
  tableNo: '',
  discountType: 'fixed',
  discountValue: 0,
  globalNote: '',

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
            productName: product.name,
            price: finalPrice,
            qty: 1,
            subtotal: finalPrice,
            variantId,
            variantName,
            note: '',
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

  setItemNote: (cartItemId, note) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.cartItemId === cartItemId ? { ...i, note } : i,
      ),
    }));
  },

  setOrderType: (orderType) => set({ orderType }),
  setTableNo: (tableNo) => set({ tableNo }),
  setDiscount: (discountValue, discountType) =>
    set((state) => ({
      discountValue: Math.max(0, discountValue),
      discountType: discountType || state.discountType,
    })),
  setGlobalNote: (globalNote) => set({ globalNote }),

  clearCart: () =>
    set({
      items: [],
      tableNo: '',
      discountValue: 0,
      globalNote: '',
    }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),

  getDiscountAmount: () => {
    const subtotal = get().getSubtotal();
    const { discountType, discountValue } = get();
    if (discountType === 'percent') {
      return Math.min(subtotal, Math.round((subtotal * discountValue) / 100));
    }
    return Math.min(subtotal, discountValue);
  },

  getTotal: () => Math.max(0, get().getSubtotal() - get().getDiscountAmount()),

  getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
}));
