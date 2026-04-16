import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";

let localOrderCounter = 0;
let lastDateString = "";

/**
 * Generate a unique local reference in the format #YYYYMMDD-0001
 * Note: The real OrderId is now assigned by the database (IDENTITY) upon saving.
 */
export const getNextOrderId = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const currentDateString = `${yyyy}${mm}${dd}`;

  if (currentDateString !== lastDateString) {
    localOrderCounter = 1;
    lastDateString = currentDateString;
  } else {
    localOrderCounter++;
  }

  // Fire and forget save to async storage so it persists if app closes/reloads
  AsyncStorage.setItem("lastOrderDateString", lastDateString).catch(console.error);
  AsyncStorage.setItem("localOrderCounter", String(localOrderCounter)).catch(console.error);

  const paddedCounter = String(localOrderCounter).padStart(4, "0");
  return `${currentDateString}-${paddedCounter}`;
};

/**
 * Legacy support for validation, though DB now handles it.
 */
export const validateOrderId = (orderId: string): boolean => {
  if (!orderId) return false;
  return (
    orderId.match(/^\d{8}-\d{4}$/) !== null ||
    orderId.startsWith("#") ||
    orderId.startsWith("TEMP-") || 
    /^\d+$/.test(orderId) || 
    /^#\d{8}-\d{4,6}$/.test(orderId)
  );
};

export const initializeOrderCounter = async () => {
  try {
    const savedDate = await AsyncStorage.getItem("lastOrderDateString");
    const savedCounter = await AsyncStorage.getItem("localOrderCounter");
    
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const currentDateString = `${yyyy}${mm}${dd}`;

    if (savedDate === currentDateString && savedCounter) {
      localOrderCounter = parseInt(savedCounter, 10);
      lastDateString = savedDate;
    } else {
      localOrderCounter = 0;
      lastDateString = currentDateString;
    }
    console.log(`[OrderIdStore] Initialized with next number: ${localOrderCounter + 1}`);
  } catch (err) {
    console.error("[OrderIdStore] Failed to init counter", err);
  }
};

