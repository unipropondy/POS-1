import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { API_URL } from "../constants/Config";

/* ================= TYPES ================= */

export type Modifier = {
  ModifierId: string;
  ModifierName: string;
  Price?: number;
};

export type CartItem = {
  ItemId?: number; // DB Primary Key
  lineItemId: string;
  id: string; // ProductId
  name: string;
  price?: number;
  qty: number;

  spicy?: string;
  oil?: string;
  salt?: string;
  sugar?: string;
  note?: string;

  modifiers?: Modifier[];
  discount?: number;
  basePrice?: number;
  isTakeaway?: boolean;
};

export type DiscountInfo = {
  applied: boolean;
  type: "percentage" | "fixed";
  value: number;
  label?: string;
};

type CartState = {
  carts: Record<string, CartItem[]>;
  discounts: Record<string, DiscountInfo>;

  currentContextId: string | null;
  loading: boolean;

  setCurrentContext: (contextId: string | null) => void;
  loadCartFromServer: (contextId: string) => Promise<void>;

  getCart: () => CartItem[];

  addToCartGlobal: (item: Omit<CartItem, "qty" | "lineItemId">) => Promise<string>;
  removeFromCartGlobal: (lineItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  clearAllCarts: () => void;

  applyDiscount: (discount: DiscountInfo) => void;
  clearDiscount: () => void;

  setCartItems: (contextId: string, items: CartItem[]) => void;
  updateCartItemQty: (
    lineItemId: string,
    newQty: number,
    discount?: number,
  ) => Promise<void>;
  updateCartItemModifiers: (lineItemId: string, modifiers: Modifier[]) => void;
  updateCartItemTakeaway: (lineItemId: string, isTakeaway: boolean) => void;
  updateCartItemDiscount: (lineItemId: string, discount: number) => void;
  updateCartItemFull: (
    lineItemId: string,
    updates: {
      qty?: number;
      note?: string;
      discount?: number;
      isTakeaway?: boolean;
    },
  ) => void;
};

/* ================= STORE ================= */

export const useCartStore = create<CartState>((set, get) => ({
  carts: {},
  discounts: {},

  currentContextId: null,
  loading: false,

  setCurrentContext: (contextId) => set({ currentContextId: contextId }),

  loadCartFromServer: async (contextId) => {
    if (!contextId) return;
    set({ loading: true });
    try {
      const response = await fetch(`${API_URL}/api/cart/${contextId}`);
      if (!response.ok) throw new Error("Failed to load cart");
      const data = await response.json();
      
      const items: CartItem[] = data.map((d: any) => ({
        ItemId: d.ItemId,
        lineItemId: uuidv4(),
        id: d.ProductId,
        name: d.ProductName || "Unknown Item",
        price: Number(d.Cost),
        qty: d.Quantity,
        basePrice: Number(d.Cost)
      }));

      set((state) => ({
        carts: { ...state.carts, [contextId]: items },
        loading: false
      }));
    } catch (err) {
      console.error("Cart Load Error:", err);
      set({ loading: false });
    }
  },

  getCart: () => {
    const { carts, currentContextId } = get();
    if (!currentContextId) return [];
    return carts[currentContextId] || [];
  },

  /* ================= DISCOUNT ================= */

  applyDiscount: (discount) => {
    const { currentContextId, discounts } = get();
    if (!currentContextId) return;

    set({
      discounts: {
        ...discounts,
        [currentContextId]: discount,
      },
    });
  },

  clearDiscount: () => {
    const { currentContextId, discounts } = get();
    if (!currentContextId) return;

    const updated = { ...discounts };
    delete updated[currentContextId];

    set({ discounts: updated });
  },

  /* ================= ADD ================= */

  addToCartGlobal: async (item) => {
    const { currentContextId } = get();
    if (!currentContextId) return "";

    try {
      const response = await fetch(`${API_URL}/api/cart/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartId: currentContextId,
          productId: item.id,
          quantity: 1,
          cost: item.price || 0
        })
      });

      if (!response.ok) throw new Error("API Save Error");
      
      await get().loadCartFromServer(currentContextId);
      return "OK";
    } catch (err) {
      console.error("Cart Save Sync Error:", err);
      return "";
    }
  },

  /* ================= REMOVE ================= */

  removeFromCartGlobal: async (lineItemId) => {
    const { carts, currentContextId } = get();
    if (!currentContextId) return;

    const currentCart = carts[currentContextId] || [];
    const item = currentCart.find((p) => p.lineItemId === lineItemId);
    if (!item || !item.ItemId) return;

    try {
      const response = await fetch(`${API_URL}/api/cart/remove/${item.ItemId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("API Delete Error");
      
      const updatedCart = currentCart.filter((p) => p.lineItemId !== lineItemId);
      set({
        carts: { ...carts, [currentContextId]: updatedCart }
      });
    } catch (err) {
      console.error("Cart Delete Sync Error:", err);
    }
  },

  /* ================= CLEAR ================= */

  clearCart: async () => {
    const { currentContextId, carts } = get();
    if (!currentContextId) return;

    try {
      const response = await fetch(`${API_URL}/api/cart/clear/${currentContextId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("API Clear Error");

      set({
        carts: { ...carts, [currentContextId]: [] }
      });
    } catch (err) {
      console.error("Cart Clear Sync Error:", err);
    }
  },

  clearAllCarts: () =>
    set({ carts: {}, discounts: {}, currentContextId: null }),

  /* ================= SET ================= */

  setCartItems: (contextId, items) => {
    set((state) => ({
      carts: {
        ...state.carts,
        [contextId]: items,
      },
    }));
  },

  updateCartItemQty: async (lineItemId, newQty) => {
    const { currentContextId } = get();
    if (currentContextId) {
       await get().loadCartFromServer(currentContextId);
    }
  },

  updateCartItemModifiers: (lineItemId, modifiers) => {},
  updateCartItemTakeaway: (lineItemId, isTakeaway) => {},
  updateCartItemDiscount: (lineItemId, discount) => {},
  updateCartItemFull: (lineItemId, updates) => {},
}));

/* ================= HELPERS ================= */

export const getContextId = (
  context?: {
    orderType: string;
    section?: string;
    tableNo?: string;
    takeawayNo?: string;
  } | null,
) => {
  if (!context) return null;

  if (context.orderType === "DINE_IN") {
    return `DINE_IN_${context.section}_${context.tableNo}`;
  }

  if (context.orderType === "TAKEAWAY") {
    return `TAKEAWAY_${context.takeawayNo}`;
  }

  return null;
};

export const getCart = () => useCartStore.getState().getCart();

export const addToCartGlobal = (item: Omit<CartItem, "qty" | "lineItemId">) =>
  useCartStore.getState().addToCartGlobal(item);

export const removeFromCartGlobal = (lineItemId: string) =>
  useCartStore.getState().removeFromCartGlobal(lineItemId);

export const clearCart = () => useCartStore.getState().clearCart();

export const setCurrentContext = (contextId: string | null) =>
  useCartStore.getState().setCurrentContext(contextId);

export const setCartItemsGlobal = (contextId: string, items: CartItem[]) =>
  useCartStore.getState().setCartItems(contextId, items);

export const subscribeCart = (listener: () => void) =>
  useCartStore.subscribe(listener);
export const updateCartItemFullGlobal = (
  lineItemId: string,
  updates: {
    qty?: number;
    note?: string;
    discount?: number;
    isTakeaway?: boolean;
  },
) => useCartStore.getState().updateCartItemFull(lineItemId, updates);
