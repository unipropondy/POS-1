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
  const markItemReady = useActiveOrdersStore((s) => s.markItemReady);
  const markItemServed = useActiveOrdersStore((s) => s.markItemServed);

  const voidOrderItem = useActiveOrdersStore((s) => s.voidOrderItem);

  useEffect(() => {
    const handleNewOrder = (payload: {
      orderId: string;
      context: any;
      items: any[];
    }) => {
      console.log("📦 [KDS] New order received via socket:", payload.orderId);
      appendOrder(payload.orderId, payload.context, payload.items);
    };

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

    const handleItemStatusUpdated = (payload: {
      orderId: string;
      lineItemId: string;
      status: "READY" | "SERVED" | "SENT" | "VOIDED";
    }) => {
      console.log(`✨ [KDS] Item status synced: ${payload.lineItemId} -> ${payload.status}`);
      if (payload.status === "READY") {
        markItemReady(payload.orderId, payload.lineItemId, true);
      } else if (payload.status === "SERVED") {
        markItemServed(payload.orderId, payload.lineItemId, true);
      } else if (payload.status === "VOIDED") {
        voidOrderItem(payload.orderId, payload.lineItemId);
      }
    };

    socket.on("new_order", handleNewOrder);
    socket.on("order_status_update", handleStatusUpdate);
    socket.on("item_status_updated", handleItemStatusUpdated);

    return () => {
      socket.off("new_order", handleNewOrder);
      socket.off("order_status_update", handleStatusUpdate);
      socket.off("item_status_updated", handleItemStatusUpdated);
    };
  }, [appendOrder, closeActiveOrder, voidOrderItem, markItemReady, markItemServed]);

  return socket;
}
