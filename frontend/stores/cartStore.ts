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
  categoryName?: string; 
  status?: "NEW" | "SENT" | "VOIDED" | "READY" | "SERVED";
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
  tableOrderIds: Record<string, string | null>;

  currentContextId: string | null;
  pendingSync: boolean; // Item 4: Resilience

  setCurrentContext: (contextId: string | null) => void;

  getCart: () => CartItem[];

  addToCartGlobal: (item: Omit<CartItem, "qty" | "lineItemId">) => Promise<string>;
  removeFromCartGlobal: (lineItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  clearAllCarts: () => void;

  applyDiscount: (discount: DiscountInfo) => void;
  clearDiscount: () => void;

  setCartItems: (contextId: string, items: CartItem[], skipSync?: boolean) => void;
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
  setTableOrderId: (tableId: string, orderId: string | null) => void;
};

/* ================= STORE ================= */

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      discounts: {},
      tableOrderIds: {},
      currentContextId: null,
      pendingSync: false,

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
        const { fetchCartFromDB } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId) return "";

        const isTakeawayDefault = orderContext?.orderType === "TAKEAWAY";
        const targetLineItemId = uuidv4();

        try {
          await fetch(`${API_URL}/api/orders/add-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              item: { 
                ...item, 
                qty: 1,
                isTakeaway: item.isTakeaway !== undefined ? item.isTakeaway : isTakeawayDefault
              }
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
        const { fetchCartFromDB, carts, currentContextId } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId || !currentContextId) return;
        const currentCart = carts[currentContextId] || [];
        const item = currentCart.find((p: CartItem) => p.lineItemId === lineItemId);
        if (!item) return;

        // ✅ If item was already SENT to kitchen, it MUST be voided, not deleted
        if (item.status === "SENT" || item.status === "READY" || item.status === "SERVED") {
          console.log("⚠️ Item already sent. Triggering VOID instead of DELETE.");
          try {
            await fetch(`${API_URL}/api/orders/update-item-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: get().tableOrderIds[tableId],
                lineItemId: lineItemId,
                status: "VOIDED"
              })
            });
            await fetchCartFromDB(tableId);
          } catch (err) {
            console.error("❌ [CartStore] Void failed:", err);
          }
          return;
        }

        try {
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
        const { fetchCartFromDB, carts, currentContextId } = get();
        const orderContext = useOrderContextStore.getState().currentOrder;
        const tableId = orderContext?.tableId;
        
        if (!tableId || !currentContextId) return;

        try {
          const currentCart = carts[currentContextId] || [];
          const sentItems = currentCart.filter(i => i.status === "SENT" || i.status === "READY" || i.status === "SERVED" || i.status === "VOIDED");
          
          await fetch(`${API_URL}/api/orders/save-cart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId,
              items: sentItems
            })
          });

          await fetchCartFromDB(tableId);
        } catch (err) {
          console.error("❌ [CartStore] Clear failed:", err);
        }
      },

      clearAllCarts: () =>
        set({ carts: {}, discounts: {}, tableOrderIds: {}, currentContextId: null }),

      /* ================= SET ================= */

      setCartItems: (contextId, items, skipSync = false) => {
        set((state) => ({
          carts: {
            ...state.carts,
            [contextId]: items,
          },
        }));
        if (!skipSync) {
          get().syncCartWithDB(contextId);
        }
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
        const tableId = orderContext?.tableId;

        if (!tableId) return;

        set({ pendingSync: true });
        if ((get() as any)._syncTimeout) clearTimeout((get() as any)._syncTimeout);
        const timeout = setTimeout(async () => {
          try {
            const res = await fetch(`${API_URL}/api/orders/save-cart`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tableId,
                items: items.map(item => ({
                  ...item,
                  status: item.status || "NEW"
                }))
              })
            });
            if (res.ok) {
              set({ pendingSync: false });
            } else {
              throw new Error("Sync failed");
            }
          } catch (err) {
            console.error("❌ [CartStore] Sync failed (Will retry on next change):", err);
            // We keep pendingSync true so UI can show a warning
          }
        }, 800); // Increased debounce for stability
        set({ _syncTimeout: timeout } as any);
      },

      fetchCartFromDB: async (tableId) => {
        try {
          const response = await fetch(`${API_URL}/api/orders/cart/${tableId}`);
          const data = await response.json();
          
          const rawItems = Array.isArray(data) ? data : (data.items || []);
          const orderId = data.currentOrderId || null;

          const mappedItems = rawItems.map((item: any) => ({
            lineItemId: item.ItemId || item.lineItemId,
            id: item.ProductId || item.id,
            name: item.name || item.ProductName || item.DishName,
            qty: item.Quantity || item.qty,
            price: item.Cost || item.price,
            note: item.Note || item.note,
            isTakeaway: !!(item.IsTakeaway !== undefined ? item.IsTakeaway : item.isTakeaway),
            isVoided: !!(item.IsVoided !== undefined ? item.IsVoided : item.isVoided),
            modifiers: typeof item.ModifiersJSON === 'string' ? JSON.parse(item.ModifiersJSON) : (item.modifiers || []),
            status: item.Status || item.status || "NEW",
          }));

          const contextId = get().currentContextId;
          if (contextId) {
            set((state) => ({
              carts: { ...state.carts, [contextId]: mappedItems },
              tableOrderIds: { ...state.tableOrderIds, [tableId]: orderId }
            }));
          }
        } catch (err) {
          console.error("❌ [CartStore] Fetch failed:", err);
        }
      },
      setTableOrderId: (tableId, orderId) => {
        const { tableOrderIds } = get();
        set({
          tableOrderIds: {
            ...tableOrderIds,
            [tableId]: orderId,
          },
        });
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

export const setCartItemsGlobal = (contextId: string, items: CartItem[], skipSync?: boolean) =>
  useCartStore.getState().setCartItems(contextId, items, skipSync);

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
