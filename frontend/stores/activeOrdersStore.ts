import { create } from "zustand";
import { CartItem, DiscountInfo, getContextId, useCartStore } from "./cartStore";
import { OrderContext } from "./orderContextStore";

/* ================= TYPES ================= */

export type OrderItem = CartItem & {
  status: "NEW" | "SENT" | "VOIDED";
  sentAt?: number;
};


export type ActiveOrder = {
  orderId: string;
  context: OrderContext;
  items: OrderItem[];
  discount?: DiscountInfo; // 🔥 ADDED
  createdAt: number;
};

type ActiveOrdersState = {
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
};

/* ================= STORE ================= */

export const useActiveOrdersStore = create<ActiveOrdersState>((set, get) => ({
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
}));

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
