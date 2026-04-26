import { create } from "zustand";
import { Platform } from "react-native";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CartItem, DiscountInfo, getContextId, useCartStore } from "./cartStore";
import { OrderContext } from "./orderContextStore";
import { API_URL } from "../constants/Config";

/* ================= TYPES ================= */

export type OrderItem = CartItem & {
  status: "NEW" | "SENT" | "VOIDED" | "READY" | "SERVED";
  sentAt?: number;
  readyAt?: number;
};


export type ActiveOrder = {
  orderId: string;
  context: OrderContext;
  items: OrderItem[];
  discount?: DiscountInfo; // 🔥 ADDED
  createdAt: number;
};

type ActiveOrdersState = {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  activeOrders: ActiveOrder[];

  appendOrder: (
    orderId: string,
    context: OrderContext,
    cartItems: CartItem[],
  ) => void;

  markItemsSent: (orderId: string) => void;
  closeActiveOrder: (orderId: string) => void;

  // 🔥 NEW FUNCTIONS
  updateOrderDiscount: (context: OrderContext, discount: DiscountInfo) => void;
  voidOrderItem: (orderId: string, lineItemId: string) => void;
  markItemReady: (orderId: string, lineItemId: string, skipSync?: boolean) => void;
  markItemServed: (orderId: string, lineItemId: string, skipSync?: boolean) => void;
  fetchActiveKitchenOrders: () => Promise<void>;
  updateOrderId: (oldId: string, newId: string) => void;
};

/* ================= STORE ================= */

export const useActiveOrdersStore = create<ActiveOrdersState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      activeOrders: [],

  /* ================= APPEND ORDER ================= */

  appendOrder: (orderId, context, cartItems) => {
    const { activeOrders } = get();

    const contextId = getContextId(context);

    // 🔥 GET DISCOUNT FROM CART STORE
    const discount = contextId && useCartStore.getState().discounts[contextId];

    const existingOrderIndex = activeOrders.findIndex((o) => {
      if (context.orderType === "DINE_IN") {
        return (
          o.context.orderType === "DINE_IN" &&
          o.context.section === context.section &&
          o.context.tableNo === context.tableNo
        );
      }

      if (context.orderType === "TAKEAWAY") {
        return (
          o.context.orderType === "TAKEAWAY" &&
          o.context.takeawayNo === context.takeawayNo
        );
      }

      return false;
    });

    /* ================= CREATE NEW ORDER ================= */

    if (existingOrderIndex === -1) {
      const newOrder: ActiveOrder = {
        orderId,
        context,
        items: cartItems.map((i) => ({
          ...i,
          status: "NEW",
        })),
        discount: discount || undefined, // 🔥 ADD HERE
        createdAt: Date.now(),
      };

      set({ activeOrders: [...activeOrders, newOrder] });
      return;
    }

    /* ================= UPDATE EXISTING ORDER ================= */

    const updatedOrders = [...activeOrders];
    const existingOrder = { ...updatedOrders[existingOrderIndex] };

    existingOrder.items = [...existingOrder.items];

    cartItems.forEach((cartItem) => {
      const itemIndex = existingOrder.items.findIndex(
        (i) => i.lineItemId === cartItem.lineItemId && i.status === "NEW",
      );

      if (itemIndex > -1) {
        existingOrder.items[itemIndex] = {
          ...existingOrder.items[itemIndex],
          qty: existingOrder.items[itemIndex].qty + cartItem.qty,
        };
      } else {
        existingOrder.items.push({
          ...cartItem,
          status: "NEW",
        });
      }
    });

    // 🔥 UPDATE DISCOUNT ALSO
    existingOrder.discount = discount || existingOrder.discount;

    updatedOrders[existingOrderIndex] = existingOrder;

    set({ activeOrders: updatedOrders });
  },

  /* ================= UPDATE DISCOUNT ================= */

  updateOrderDiscount: (context, discount) => {
    const { activeOrders } = get();

    const updated = activeOrders.map((order) => {
      if (context.orderType === "DINE_IN") {
        if (
          order.context.orderType === "DINE_IN" &&
          order.context.section === context.section &&
          order.context.tableNo === context.tableNo
        ) {
          return { ...order, discount };
        }
      }

      if (context.orderType === "TAKEAWAY") {
        if (
          order.context.orderType === "TAKEAWAY" &&
          order.context.takeawayNo === context.takeawayNo
        ) {
          return { ...order, discount };
        }
      }

      return order;
    });

    set({ activeOrders: updated });
  },

  /* ================= MARK ITEMS SENT ================= */

  markItemsSent: (orderId) => {
    const { activeOrders } = get();
    const now = Date.now();

    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;

        return {
          ...order,
          items: order.items.map((item) => {
            if (item.status === "NEW") {
              return {
                ...item,
                status: "SENT",
                sentAt: now,
              };
            }
            return item;
          }),
        };
      }),
    });
  },
  closeActiveOrder: (orderId) => {
    const { activeOrders } = get();

    set({
      activeOrders: activeOrders.filter((o) => o.orderId !== orderId),
    });
  },

  /* ================= VOID ITEM ================= */

  voidOrderItem: (orderId, lineItemId) => {
    const { activeOrders } = get();

    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;

        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "VOIDED" };
            }
            return item;
          }),
        };
      }),
    });
  },
  /* ================= MARK ITEM READY ================= */
  markItemReady: async (orderId, lineItemId, skipSync) => {
    const { activeOrders } = get();
    const now = Date.now();

    // 1. Update Local State
    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;
        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "READY", readyAt: now };
            }
            return item;
          }),
        };
      }),
    });

    // 2. Persist to Backend (unless already synced from socket)
    if (!skipSync) {
      try {
        await fetch(`${API_URL}/api/orders/update-item-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, lineItemId, status: "READY" }),
        });
      } catch (err) {
        console.error("❌ [Store] markItemReady sync failed:", err);
      }
    }
  },

  /* ================= MARK ITEM SERVED ================= */
  markItemServed: async (orderId, lineItemId, skipSync) => {
    const { activeOrders } = get();

    // 1. Update Local State
    set({
      activeOrders: activeOrders.map((order) => {
        if (order.orderId !== orderId) return order;
        return {
          ...order,
          items: order.items.map((item) => {
            if (item.lineItemId === lineItemId) {
              return { ...item, status: "SERVED" };
            }
            return item;
          }),
        };
      }),
    });

    // 2. Persist to Backend
    if (!skipSync) {
      try {
        await fetch(`${API_URL}/api/orders/update-item-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, lineItemId, status: "SERVED" }),
        });
      } catch (err) {
        console.error("❌ [Store] markItemServed sync failed:", err);
      }
    }
  },

  /* ================= FETCH FROM DB ================= */
  fetchActiveKitchenOrders: async () => {
    try {
      const { API_URL } = require("../constants/Config");
      const res = await fetch(`${API_URL}/api/orders/active-kitchen`);
      if (!res.ok) throw new Error("Failed to fetch active kitchen orders");
      const data = await res.json();
      
      // Merge with existing orders (avoid duplicates)
      const currentOrders = get().activeOrders;
      const merged = [...data];
      
      // If we have local NEW (unsent) orders, we keep them
      currentOrders.forEach(local => {
        if (!merged.find(m => m.orderId === local.orderId)) {
          // If it's not in the DB kitchen list, it might be a local NEW order
          if (local.items.some(i => i.status === "NEW")) {
            merged.push(local);
          }
        }
      });

      set({ activeOrders: merged });
    } catch (err) {
      console.error("❌ [ActiveOrdersStore] Fetch failed:", err);
    }
  },

  /* ================= UPDATE ORDER ID ================= */
  updateOrderId: (oldId, newId) => {
    const { activeOrders } = get();
    console.log(`🔄 [Store] Updating Order ID: ${oldId} -> ${newId}`);
    
    set({
      activeOrders: activeOrders.map((o) => 
        o.orderId === oldId ? { ...o, orderId: newId } : o
      )
    });
  },
}),
  {
    name: "active-orders-storage",
    storage: createJSONStorage(() => 
      Platform.OS === 'web' ? window.sessionStorage : AsyncStorage
    ),
    onRehydrateStorage: () => (state) => {
      state?.setHasHydrated(true);
    },
  }
));

/* ================= HELPERS ================= */

export const getActiveOrders = () =>
  useActiveOrdersStore.getState().activeOrders;

export const findActiveOrder = (context: OrderContext) => {
  return useActiveOrdersStore.getState().activeOrders.find((o) => {
    if (context.orderType === "DINE_IN") {
      return (
        o.context.orderType === "DINE_IN" &&
        o.context.section === context.section &&
        o.context.tableNo === context.tableNo
      );
    }

    if (context.orderType === "TAKEAWAY") {
      return (
        o.context.orderType === "TAKEAWAY" &&
        o.context.takeawayNo === context.takeawayNo
      );
    }

    return false;
  });
};
export const voidOrderItem = (orderId: string, lineItemId: string) =>
  useActiveOrdersStore.getState().voidOrderItem(orderId, lineItemId);
