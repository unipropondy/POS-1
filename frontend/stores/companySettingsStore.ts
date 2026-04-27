import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../constants/Config";

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
          const response = await fetch(`${API_URL}/api/company-settings/${userId}`);
          const data = await response.json();
          
          if (data) {
            const formatUrl = (url: string) => {
                if (!url) return '';
                if (url.startsWith('http')) return url;
                return url; // Keep relative path in store
            };

            set({
              settings: {
                name: data.CompanyName || "",
                address: data.Address || "",
                gstNo: data.GSTNo || "",
                gstPercentage: parseFloat(data.GSTPercentage) || 0,
                phone: data.Phone || "",
                email: data.Email || "",
                cashierName: data.CashierName || "",
                currency: data.Currency || "SGD",
                currencySymbol: data.CurrencySymbol || "$",
                companyLogo: formatUrl(data.CompanyLogoUrl),
                halalLogo: formatUrl(data.HalalLogoUrl),
                printerIp: data.PrinterIP || "", // ✅ ADDED
                showCompanyLogo: data.ShowCompanyLogo !== false,
                showHalalLogo: data.ShowHalalLogo !== false,
              },
            });
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
