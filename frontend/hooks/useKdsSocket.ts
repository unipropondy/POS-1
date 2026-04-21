import { useEffect } from "react";
import { socket } from "../constants/socket";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";

/**
 * useKdsSocket
 * 
 * Uses the global socket to listen for real-time order events.
 * Call this hook inside the KDS screen to receive live updates.
 */
export function useKdsSocket() {
  const appendOrder = useActiveOrdersStore((s) => s.appendOrder);
  const closeActiveOrder = useActiveOrdersStore((s) => s.closeActiveOrder);
  const voidOrderItem = useActiveOrdersStore((s) => s.voidOrderItem);

  useEffect(() => {
    // Fired by the backend when the POS sends a new order to the kitchen
    const handleNewOrder = (payload: {
      orderId: string;
      context: any;
      items: any[];
    }) => {
      console.log("📦 [KDS] New order received via socket:", payload.orderId);
      appendOrder(payload.orderId, payload.context, payload.items);
    };

    // Fired when an order is closed or an item is voided
    const handleStatusUpdate = (payload: {
      orderId: string;
      action: "CLOSE" | "VOID";
      lineItemId?: string;
    }) => {
      console.log(`🔄 [KDS] Status update received for ${payload.orderId}: ${payload.action}`);
      if (payload.action === "CLOSE") {
        closeActiveOrder(payload.orderId);
      } else if (payload.action === "VOID" && payload.lineItemId) {
        voidOrderItem(payload.orderId, payload.lineItemId);
      }
    };

    socket.on("new_order", handleNewOrder);
    socket.on("order_status_update", handleStatusUpdate);

    return () => {
      socket.off("new_order", handleNewOrder);
      socket.off("order_status_update", handleStatusUpdate);
    };
  }, [appendOrder, closeActiveOrder, voidOrderItem]);

  return socket;
}
