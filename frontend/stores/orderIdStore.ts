import { API_URL } from "@/constants/Config";

/**
 * Generate a unique local reference. 
 * Note: The real OrderId is now assigned by the database (IDENTITY) upon saving.
 */
export const getNextOrderId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `TEMP-${timestamp}-${random}`;
};

/**
 * Legacy support for validation, though DB now handles it.
 */
export const validateOrderId = (orderId: string): boolean => {
  if (!orderId) return false;
  return (
    orderId.startsWith("TEMP-") || 
    /^\d+$/.test(orderId) || 
    /^#\d{8}-\d{4,6}$/.test(orderId)
  );
};

export const initializeOrderCounter = async () => {
  // Logic deprecated as DB handles auto-increment now
  console.log("[OrderIdStore] Real OrderId is now handled by database IDENTITY.");
};

