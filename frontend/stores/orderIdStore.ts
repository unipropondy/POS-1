import { API_URL } from "@/constants/Config";

let currentNumber = 1;
let lastUsedDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");

/**
 * Initialize the counter from the backend to ensure continuity across sessions.
 */
export const initializeOrderCounter = async () => {
  try {
    const res = await fetch(`${API_URL}/api/sales/daily-order-count`);
    const data = await res.json();
    if (data && typeof data.nextNumber === "number") {
      currentNumber = data.nextNumber;
      console.log(`[OrderIdStore] Initialized with next number: ${currentNumber}`);
    }
  } catch (err) {
    console.error("[OrderIdStore] Failed to sync order count:", err);
  }
};

/**
 * Generate a unique Order ID in format YYYYMMDD-NNNN
 * Examples: 20260413-0001, 20260413-0002
 */
export const getNextOrderId = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  
  // If date changed, reset counter
  if (dateStr !== lastUsedDate) {
    lastUsedDate = dateStr;
    currentNumber = 1;
  }

  const paddedNumber = String(currentNumber).padStart(4, "0");
  const code = `${dateStr}-${paddedNumber}`;
  
  currentNumber++;
  return code;
};

/**
 * Check if order ID matches the professional format YYYYMMDD-NNNN
 */
export const validateOrderId = (orderId: string): boolean => {
  return /^\d{8}-\d{4}$/.test(orderId);
};

