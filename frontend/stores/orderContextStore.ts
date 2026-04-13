import { create } from "zustand";

export type OrderContext = {
  orderType: "DINE_IN" | "TAKEAWAY";
  section?: string;
  tableNo?: string;
  takeawayNo?: string;
};

type OrderContextState = {
  currentOrder: OrderContext | null;
  setOrderContext: (data: OrderContext) => void;
  clearOrderContext: () => void;
};

export const useOrderContextStore = create<OrderContextState>((set) => ({
  currentOrder: null,
  setOrderContext: (data) => set({ currentOrder: data }),
  clearOrderContext: () => set({ currentOrder: null }),
}));

// Backwards compatibility for existing code that hasn't been migrated yet
export const getOrderContext = () => useOrderContextStore.getState().currentOrder;
export const setOrderContext = (data: OrderContext) => useOrderContextStore.getState().setOrderContext(data);
export const clearOrderContext = () => useOrderContextStore.getState().clearOrderContext();
