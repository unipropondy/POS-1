import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";

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

  addToCartGlobal: (item: Omit<CartItem, "qty" | "lineItemId">) => string;
  removeFromCartGlobal: (lineItemId: string) => void;
  clearCart: () => void;
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
};

/* ================= STORE ================= */

export const useCartStore = create<CartState>((set, get) => ({
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

  addToCartGlobal: (item) => {
    const { carts, currentContextId, discounts } = get();
    if (!currentContextId) return "";

    const currentCart = carts[currentContextId] || [];

    const areModifiersEqual = (mods1?: Modifier[], mods2?: Modifier[]) => {
      const ids1 = (mods1 || [])
        .map((m) => m.ModifierId)
        .sort()
        .join("|");
      const ids2 = (mods2 || [])
        .map((m) => m.ModifierId)
        .sort()
        .join("|");
      return ids1 === ids2;
    };

    const existing = currentCart.find(
      (p) =>
        p.id === item.id &&
        p.spicy === item.spicy &&
        p.oil === item.oil &&
        p.salt === item.salt &&
        p.sugar === item.sugar &&
        p.note === item.note &&
        areModifiersEqual(p.modifiers, item.modifiers),
    );

    let updatedCart;
    const targetLineItemId = existing ? existing.lineItemId : uuidv4();
    const basePrice = item.price || 0; // Store the original dish price

    if (existing) {
      updatedCart = currentCart.map((p) =>
        p.lineItemId === existing.lineItemId ? { ...p, qty: p.qty + 1 } : p,
      );
    } else {
      updatedCart = [
        ...currentCart,
        { ...item, qty: 1, lineItemId: targetLineItemId, basePrice },
      ];
    }

    const newDiscounts = { ...discounts };
    delete newDiscounts[currentContextId]; // 🔥 reset discount

    set({
      carts: {
        ...carts,
        [currentContextId]: updatedCart,
      },
      discounts: newDiscounts,
    });

    return targetLineItemId;
  },

  /* ================= REMOVE ================= */

  removeFromCartGlobal: (lineItemId) => {
    const { carts, currentContextId, discounts } = get();
    if (!currentContextId) return;

    const currentCart = carts[currentContextId] || [];
    const item = currentCart.find((p) => p.lineItemId === lineItemId);
    if (!item) return;

    let updatedCart;

    if (item.qty > 1) {
      updatedCart = currentCart.map((p) =>
        p.lineItemId === lineItemId ? { ...p, qty: p.qty - 1 } : p,
      );
    } else {
      updatedCart = currentCart.filter((p) => p.lineItemId !== lineItemId);
    }

    const newDiscounts = { ...discounts };
    delete newDiscounts[currentContextId];

    set({
      carts: {
        ...carts,
        [currentContextId]: updatedCart,
      },
      discounts: newDiscounts,
    });
  },

  /* ================= CLEAR ================= */

  clearCart: () => {
    const { carts, currentContextId, discounts } = get();
    if (!currentContextId) return;

    const newDiscounts = { ...discounts };
    delete newDiscounts[currentContextId];

    set({
      carts: {
        ...carts,
        [currentContextId]: [],
      },
      discounts: newDiscounts,
    });
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

  updateCartItemQty: (
    lineItemId: string,
    newQty: number,
    discount?: number,
  ) => {
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
  },

  updateCartItemModifiers: (lineItemId: string, modifiers: Modifier[]) => {
    const { carts, currentContextId } = get();
    if (!currentContextId) return;

    const currentCart = carts[currentContextId] || [];
    const sourceItem = currentCart.find((i) => i.lineItemId === lineItemId);
    if (!sourceItem) return;

    const areModifiersEqual = (mods1?: Modifier[], mods2?: Modifier[]) => {
      const ids1 = (mods1 || [])
        .map((m) => m.ModifierId)
        .sort()
        .join("|");
      const ids2 = (mods2 || [])
        .map((m) => m.ModifierId)
        .sort()
        .join("|");
      return ids1 === ids2;
    };

    if (areModifiersEqual(sourceItem.modifiers, modifiers)) {
      return; // No change in modifiers, early exit.
    }

    const base = sourceItem.basePrice || sourceItem.price || 0;
    const extra = modifiers.reduce((sum, m) => sum + (m.Price || 0), 0);
    const newPrice = base + extra;

    // See if the new combo matches an EXISTING item (other than the temporary un-modified source item)
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
      // Split the source item (drop 1 from group)
      updatedCart = updatedCart.map((i) =>
        i.lineItemId === lineItemId ? { ...i, qty: i.qty - 1 } : i,
      );

      if (matchingExistingItem) {
        // Merge the separated 1 qty into the matching existing item
        updatedCart = updatedCart.map((i) =>
          i.lineItemId === matchingExistingItem.lineItemId
            ? { ...i, qty: i.qty + 1 }
            : i,
        );
      } else {
        // Create a new independent item for the 1 qty
        updatedCart.push({
          ...sourceItem,
          qty: 1,
          lineItemId: uuidv4(),
          modifiers,
          price: newPrice,
        });
      }
    } else {
      // Source item is single qty, so we alter it completely
      if (matchingExistingItem) {
        // It matches another existing item! Merge them, delete the source line.
        updatedCart = updatedCart.filter((i) => i.lineItemId !== lineItemId);
        updatedCart = updatedCart.map((i) =>
          i.lineItemId === matchingExistingItem.lineItemId
            ? { ...i, qty: i.qty + 1 }
            : i,
        );
      } else {
        // Just modify it in place
        updatedCart = updatedCart.map((i) =>
          i.lineItemId === lineItemId
            ? { ...i, modifiers, price: newPrice }
            : i,
        );
      }
    }

    set({
      carts: {
        ...carts,
        [currentContextId]: updatedCart,
      },
    });
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
  },
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
