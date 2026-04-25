import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { Platform } from "react-native";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "@/constants/Config";
import { useOrderContextStore } from "./orderContextStore";

/* ================= TYPES ================= */

export type Modifier = {
  ModifierId: string;
  ModifierName: string;
  Price?: number;
};

export type CartItem = {
  lineItemId: string;
  id: string;
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
  isVoided?: boolean;
  categoryName?: string; // 🔥 Added for KDS grouping
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

  setCurrentContext: (contextId: string | null) => void;

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
  ) => void;
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
      isVoided?: boolean;
    },
  ) => void;

  syncCartWithDB: (contextId: string) => Promise<void>;
  fetchCartFromDB: (tableId: string) => Promise<void>;
};

/* ================= STORE ================= */

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      discounts: {},

      currentContextId: null,

      setCurrentContext: (contextId) => set({ currentContextId: contextId }),

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
        const { currentContextId, fetchCartFromDB } = get();
        if (!currentContextId) return "";

        const tableId = currentContextId.split("_").pop() || "";
        const targetLineItemId = uuidv4();

        try {
          await fetch(`${API_URL}/api/orders/add-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              item: { ...item, qty: 1 }
            })
          });
          
          // Re-fetch from DB to ensure sync
          await fetchCartFromDB(tableId);
        } catch (err) {
          console.error("❌ [CartStore] Add failed:", err);
        }
        
        return targetLineItemId;
      },

      /* ================= REMOVE ================= */

      removeFromCartGlobal: async (lineItemId) => {
        const { carts, currentContextId, fetchCartFromDB } = get();
        if (!currentContextId) return;

        const tableId = currentContextId.split("_").pop() || "";
        const currentCart = carts[currentContextId] || [];
        const item = currentCart.find((p) => p.lineItemId === lineItemId);
        if (!item) return;

        try {
          // If qty > 1, we might need an update-qty route, 
          // but for simplicity we'll just handle removal for now as per user prompt
          // or use the save-cart for bulk updates.
          // The user specifically asked for DELETE FROM CartItems.
          
          await fetch(`${API_URL}/api/orders/remove-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              itemId: lineItemId
            })
          });

          await fetchCartFromDB(tableId);
        } catch (err) {
          console.error("❌ [CartStore] Remove failed:", err);
        }
      },

      /* ================= CLEAR ================= */

      clearCart: async () => {
        const { currentContextId, fetchCartFromDB } = get();
        if (!currentContextId) return;

        const tableId = currentContextId.split("_").pop() || "";

        try {
          await fetch(`${API_URL}/api/orders/save-cart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              items: []
            })
          });

          await fetchCartFromDB(tableId);
        } catch (err) {
          console.error("❌ [CartStore] Clear failed:", err);
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

      updateCartItemQty: (lineItemId, newQty, discount) => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = carts[currentContextId] || [];
        const updatedCart = currentCart
          .map((item) =>
            item.lineItemId === lineItemId
              ? {
                  ...item,
                  qty: Math.max(0, newQty),
                  discount: discount !== undefined ? discount : item.discount,
                }
              : item,
          )
          .filter((item) => item.qty > 0);

        set({
          carts: {
            ...carts,
            [currentContextId]: updatedCart,
          },
        });
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemModifiers: (lineItemId, modifiers) => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = carts[currentContextId] || [];
        const sourceItem = currentCart.find((i) => i.lineItemId === lineItemId);
        if (!sourceItem) return;

        const areModifiersEqual = (mods1?: Modifier[], mods2?: Modifier[]) => {
          const getIds = (mods?: any[]) => (mods || []).map(m => String(m.ModifierId || m.ModifierID || "")).sort().join("|");
          return getIds(mods1) === getIds(mods2);
        };

        if (areModifiersEqual(sourceItem.modifiers, modifiers)) return;

        const base = sourceItem.basePrice || sourceItem.price || 0;
        const extra = modifiers.reduce((sum, m) => sum + (m.Price || 0), 0);
        const newPrice = base + extra;

        const matchingExistingItem = currentCart.find(
          (p) =>
            p.lineItemId !== lineItemId &&
            p.id === sourceItem.id &&
            p.spicy === sourceItem.spicy &&
            p.oil === sourceItem.oil &&
            p.salt === sourceItem.salt &&
            p.sugar === sourceItem.sugar &&
            p.note === sourceItem.note &&
            areModifiersEqual(p.modifiers, modifiers),
        );

        let updatedCart = [...currentCart];

        if (sourceItem.qty > 1) {
          updatedCart = updatedCart.map((i) =>
            i.lineItemId === lineItemId ? { ...i, qty: i.qty - 1 } : i,
          );
          if (matchingExistingItem) {
            updatedCart = updatedCart.map((i) =>
              i.lineItemId === matchingExistingItem.lineItemId ? { ...i, qty: i.qty + 1 } : i,
            );
          } else {
            updatedCart.push({ ...sourceItem, qty: 1, lineItemId: uuidv4(), modifiers, price: newPrice });
          }
        } else {
          if (matchingExistingItem) {
            updatedCart = updatedCart.filter((i) => i.lineItemId !== lineItemId);
            updatedCart = updatedCart.map((i) =>
              i.lineItemId === matchingExistingItem.lineItemId ? { ...i, qty: i.qty + 1 } : i,
            );
          } else {
            updatedCart = updatedCart.map((i) =>
              i.lineItemId === lineItemId ? { ...i, modifiers, price: newPrice } : i,
            );
          }
        }

        set({
          carts: {
            ...carts,
            [currentContextId]: updatedCart,
          },
        });
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemTakeaway: (lineItemId, isTakeaway) => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = carts[currentContextId] || [];
        const updatedCart = currentCart.map((item) =>
          item.lineItemId === lineItemId ? { ...item, isTakeaway } : item,
        );

        set({
          carts: {
            ...carts,
            [currentContextId]: updatedCart,
          },
        });
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemDiscount: (lineItemId, discount) => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = carts[currentContextId] || [];
        const updatedCart = currentCart.map((item) =>
          item.lineItemId === lineItemId ? { ...item, discount } : item,
        );

        set({
          carts: {
            ...carts,
            [currentContextId]: updatedCart,
          },
        });
        get().syncCartWithDB(currentContextId);
      },

      updateCartItemFull: (lineItemId, updates) => {
        const { carts, currentContextId } = get();
        if (!currentContextId) return;

        const currentCart = carts[currentContextId] || [];
        const updatedCart = currentCart.map((item) =>
          item.lineItemId === lineItemId ? { ...item, ...updates } : item,
        );

        set({
          carts: {
            ...carts,
            [currentContextId]: updatedCart,
          },
        });
        get().syncCartWithDB(currentContextId);
      },

      syncCartWithDB: async (contextId) => {
        const { carts } = get();
        const items = carts[contextId] || [];
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId =
          orderContext?.orderType === "DINE_IN"
            ? orderContext.tableId
            : orderContext?.takeawayNo;

        if (!tableId) {
          return;
        }

        try {
          const latestResponse = await fetch(`${API_URL}/api/orders/cart/${tableId}`);
          const latestItems = await latestResponse.json();
          const mergedItems = new Map<string, any>();

          if (Array.isArray(latestItems)) {
            latestItems.forEach((item) => {
              mergedItems.set(String(item.lineItemId || item.ItemId || ""), item);
            });
          }

          items.forEach((item) => {
            mergedItems.set(String(item.lineItemId), item);
          });

          await fetch(`${API_URL}/api/orders/save-cart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              items: Array.from(mergedItems.values()).map(item => ({
                id: item.id,
                qty: item.qty,
                price: item.price,
                note: item.note,
                isTakeaway: item.isTakeaway,
                isVoided: item.isVoided,
                modifiers: item.modifiers,
                spicy: item.spicy,
                salt: item.salt,
                oil: item.oil,
                sugar: item.sugar
              }))
            })
          });
        } catch (err) {
          console.error("❌ [CartStore] Sync failed:", err);
        }
      },

      fetchCartFromDB: async (tableId) => {
        try {
          const response = await fetch(`${API_URL}/api/orders/cart/${tableId}`);
          const dbItems = await response.json();
          
          if (Array.isArray(dbItems)) {
            const contextId = get().currentContextId;
            if (contextId) {
              set((state) => ({
                carts: { ...state.carts, [contextId]: dbItems }
              }));
            }
          }
        } catch (err) {
          console.error("❌ [CartStore] Fetch failed:", err);
        }
      },
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => 
        Platform.OS === 'web' ? window.sessionStorage : AsyncStorage
      ),
    }
  )
);

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
    isVoided?: boolean;
  },
) => useCartStore.getState().updateCartItemFull(lineItemId, updates);

export const fetchCartFromDBGlobal = (tableId: string) =>
  useCartStore.getState().fetchCartFromDB(tableId);
