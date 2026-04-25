import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type OrderContext = {
  orderType: "DINE_IN" | "TAKEAWAY";
  section?: string;
  tableId?: string;
  tableNo?: string;
  takeawayNo?: string;
};

type OrderContextState = {
  currentOrder: OrderContext | null;
  setOrderContext: (data: OrderContext) => void;
  clearOrderContext: () => void;
};

export const useOrderContextStore = create<OrderContextState>()(
  persist(
    (set) => ({
      currentOrder: null,
      setOrderContext: (data) => set({ currentOrder: data }),
      clearOrderContext: () => set({ currentOrder: null }),
    }),
    {
      name: "order-context-storage",
      storage: createJSONStorage(() => (Platform.OS === "web" ? localStorage : AsyncStorage)),
    }
  )
);

// Backwards compatibility
export const getOrderContext = () => useOrderContextStore.getState().currentOrder;
export const setOrderContext = (data: OrderContext) => useOrderContextStore.getState().setOrderContext(data);
export const clearOrderContext = () => useOrderContextStore.getState().clearOrderContext();
