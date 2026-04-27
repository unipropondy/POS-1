import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";
import API from "../api";

interface CompanySettings {
  name: string;
  address: string;
  gstNo: string;
  gstPercentage: number;
  phone: string;
  email: string;
  cashierName: string;
  currency: string;
  currencySymbol: string;
  companyLogo: string;
  halalLogo: string;
  printerIp: string; // ✅ ADDED
  showCompanyLogo: boolean;
  showHalalLogo: boolean;
}

interface CompanySettingsState {
  settings: CompanySettings;
  loading: boolean;
  fetchSettings: (userId: string) => Promise<void>;
  updateSettings: (newSettings: Partial<CompanySettings>) => void;
}

const DEFAULT_SETTINGS: CompanySettings = {
  name: "",
  address: "",
  gstNo: "",
  gstPercentage: 0,
  phone: "",
  email: "",
  cashierName: "",
  currency: "SGD",
  currencySymbol: "$",
  companyLogo: "",
  halalLogo: "",
  printerIp: "", // ✅ ADDED
  showCompanyLogo: true,
  showHalalLogo: true,
};

export const useCompanySettingsStore = create<CompanySettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      loading: false,

      fetchSettings: async (userId: string) => {
        if (!userId) return;
        set({ loading: true });
        try {
          const response = await API.get(`/company-settings/${userId}`);
          const data = response.data;
          
          if (data && data.success && data.settings) {
            const s = data.settings;
            
            set({
              settings: {
                name: s.CompanyName || "",
                address: s.Address || "",
                gstNo: s.GSTNo || "",
                gstPercentage: parseFloat(s.GSTPercentage) || 0,
                phone: s.Phone || "",
                email: s.Email || "",
                cashierName: s.CashierName || "",
                currency: s.Currency || "SGD",
                currencySymbol: s.CurrencySymbol || "$",
                companyLogo: s.CompanyLogoUrl || "",
                halalLogo: s.HalalLogoUrl || "",
                printerIp: s.PrinterIP || "",
                showCompanyLogo: s.ShowCompanyLogo !== false && s.ShowCompanyLogo !== 0,
                showHalalLogo: s.ShowHalalLogo !== false && s.ShowHalalLogo !== 0,
              },
            });
            console.log("✅ [CompanySettingsStore] Settings loaded");
          }
        } catch (error) {
          console.error("❌ [CompanySettingsStore] Fetch Error:", error);
        } finally {
          set({ loading: false });
        }
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },
    }),
    {
      name: "company-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
