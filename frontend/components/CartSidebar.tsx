import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  DimensionValue,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { API_URL } from "../constants/Config";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import EditDishModal from "./EditDishModal";
import { useToast } from "./Toast";

import { socket } from "../constants/socket";
import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";
import {
  CartItem,
  clearCart as clearCartStandalone,
  useCartStore,
} from "../stores/cartStore";
import { holdOrder } from "../stores/heldOrdersStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatSectionGlobal = (sec: string) => {
  if (!sec) return "";
  const s = sec.toUpperCase();
  if (s.startsWith("SECTION_")) {
    return s.replace("SECTION_", "Section-");
  }
  return s;
};

interface CartSidebarProps {
  width?: DimensionValue;
}

export default function CartSidebar({ width = 400 }: CartSidebarProps) {

  const router = useRouter();
  const { showToast } = useToast();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth > screenHeight;
  const isPhone = Math.min(screenWidth, screenHeight) < 500;

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CartItem | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [itemToVoid, setItemToVoid] = useState<any | null>(null);
  const [cancelPassword, setCancelPassword] = useState("");

  const orderContext = useOrderContextStore((state) => state.currentOrder);
  const carts = useCartStore((state) => state.carts);
  const currentContextId = useCartStore((state) => state.currentContextId);
  const removeFromCartGlobal = useCartStore(
    (state) => state.removeFromCartGlobal,
  );
  const addToCartGlobal = useCartStore((state) => state.addToCartGlobal);
  const updateCartItemQty = useCartStore((state) => state.updateCartItemQty);
  const updateCartItemTakeaway = useCartStore((state) => state.updateCartItemTakeaway);
  const updateCartItemDiscount = useCartStore((state) => state.updateCartItemDiscount);
  const tableOrderIds = useCartStore((state) => state.tableOrderIds);

  const cart = useMemo(() => {
    return (currentContextId && carts[currentContextId]) || [];
  }, [carts, currentContextId]);

  const activeOrders = useActiveOrdersStore((state) => state.activeOrders);
  const appendOrder = useActiveOrdersStore((state) => state.appendOrder);
  const markItemsSent = useActiveOrdersStore((state) => state.markItemsSent);
  const closeActiveOrder = useActiveOrdersStore(
    (state) => state.closeActiveOrder,
  );
  const voidOrderItem = useActiveOrdersStore((state) => state.voidOrderItem);
  const updateTableStatus = useTableStatusStore((s) => s.updateTableStatus);
  const tables = useTableStatusStore((s) => s.tables);

  const tableData = useMemo(() => {
    if (!orderContext) return null;
    if (orderContext.orderType === "TAKEAWAY") {
      return tables.find(
        (t) =>
          t.section === "TAKEAWAY" && t.tableNo === orderContext.takeawayNo,
      );
    }
    return tables.find(
      (t) =>
        t.section === orderContext.section &&
        t.tableNo === orderContext.tableNo,
    );
  }, [tables, orderContext]);

  const unsentCount = useMemo(() => {
    return cart.filter((i: any) => !i.status || i.status === "NEW").length;
  }, [cart]);

  const currentTableStatus = useMemo(() => {
    if (!tableData) return "EMPTY";

    // Normalize status if it comes from the database as a number
    const s = tableData.status;
    if (
      typeof s === "number" ||
      typeof (tableData as any).Status === "number"
    ) {
      const val = typeof s === "number" ? s : (tableData as any).Status;
      const statusMap: Record<number, string> = {
        0: "EMPTY",
        1: "SENT",
        2: "BILL_REQUESTED",
        3: "HOLD",
        4: "LOCKED",
        5: "SENT",
      };
      return statusMap[val] || "EMPTY";
    }
    return s || "EMPTY";
  }, [tableData]);

  const activeOrder = useMemo(() => {
    if (!orderContext) return undefined;
    return activeOrders.find((o) => {
      if (orderContext.orderType === "DINE_IN") {
        return (
          o.context.orderType === "DINE_IN" &&
          o.context.section === orderContext.section &&
          o.context.tableNo === orderContext.tableNo
        );
      }
      return (
        o.context.orderType === "TAKEAWAY" &&
        o.context.takeawayNo === orderContext.takeawayNo
      );
    });
  }, [activeOrders, orderContext]);

  useEffect(() => {
    if (orderContext?.tableId) {
      console.log(`🔄 [CartSidebar] Refreshing cart from DB for table: ${orderContext.tableId}`);
      useCartStore.getState().fetchCartFromDB(orderContext.tableId);
    }
  }, [orderContext?.tableId]);

  useEffect(() => {
    // ✅ Sync official Order ID from DB whenever table changes
    if (orderContext?.tableId) {
      fetch(`${API_URL}/api/tables/${orderContext.tableId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.table?.CurrentOrderId) {
            useCartStore.getState().setTableOrderId(orderContext.tableId!, data.table.CurrentOrderId);
          }
        })
        .catch(err => console.error("Sidebar ID sync error:", err));
    }
  }, [orderContext?.tableId]);

  useEffect(() => {
    const handleCartUpdate = (data: { tableId: string }) => {
      if (orderContext?.tableId && String(data.tableId) === String(orderContext.tableId)) {
        console.log(`🔌 [Socket] Cart updated for table ${data.tableId}, re-fetching...`);
        useCartStore.getState().fetchCartFromDB(orderContext.tableId);
      }
    };

    socket.on("cart_updated", handleCartUpdate);
    return () => {
      socket.off("cart_updated", handleCartUpdate);
    };
  }, [orderContext?.tableId]);

  const displayItems = useMemo(() => {
    // The 'cart' from useCartStore now contains both NEW and SENT items from the DB.
    // This prevents duplication with activeOrder.items.
    return cart;
  }, [cart]);

  useEffect(() => {
    // 🔥 If the cart is completely empty (no unsent items AND no active order items),
    // and we have a table context, reset the table status to Available (0) in the DB.
    const ctx = orderContext;
    if (ctx?.tableId && false && displayItems.length === 0) {
      console.log(`🧹 [CartSidebar] Cart empty, resetting table ${ctx?.tableId}`);
      fetch(`${API_URL}/api/orders/save-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: ctx?.tableId,
          items: [],
        }),
      }).catch((err) => console.error("Error auto-resetting table:", err));
    }
  }, [displayItems.length, orderContext?.tableId]);

  const subtotal = useMemo(() => {
    return displayItems.reduce((sum, item) => {
      const isVoided = "status" in item && item.status === "VOIDED";
      if (isVoided) return sum;
      const baseTotal = (item.price || 0) * item.qty;
      const discountVal = (item.discount || 0) / 100;
      return sum + baseTotal * (1 - discountVal);
    }, 0);
  }, [displayItems]);

  const taxRate = 0; // Tax removed
  const taxAmount = subtotal * taxRate;
  const payableAmount = subtotal + taxAmount;

  const handleClearCart = () => {
    if (cart.length === 0) return;
    clearCartStandalone();
    showToast({
      type: "success",
      message: "Cart Cleared",
      subtitle: "Unsent items removed.",
    });
  };

  if (!orderContext) {
    return (
      <View
        style={[
          styles.container,
          { width },
          isPhone && isLandscape && styles.containerLandscapePhone,
        ]}
      >
        <View style={styles.emptyCartSurface}>
          <View style={[styles.emptyCartIconWrap, { opacity: 0.6 }]}>
            <View
              style={[
                styles.emptyCartIconPulse,
                { backgroundColor: Theme.border + "40" },
              ]}
            />
            <View
              style={[
                styles.emptyCartIconContainer,
                { borderColor: Theme.border },
              ]}
            >
              <Ionicons name="cart-outline" size={48} color={Theme.textMuted} />
            </View>
          </View>
          <Text style={styles.emptyCartTitle}>No Active Order</Text>
          <Text style={styles.emptyCartSubtitle}>
            Select a table or start a takeaway to begin an order.
          </Text>
        </View>
      </View>
    );
  }

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItemId(expandedItemId === id ? null : id);
  };

  const handleCheckout = async () => {
    if (!orderContext) return;
    if (orderContext.orderType === "DINE_IN") {
      updateTableStatus(
        orderContext.tableId || "",
        orderContext.section!,
        orderContext.tableNo!,
        activeOrder?.orderId || "PAYMENT",
        "BILL_REQUESTED",
        undefined,
        undefined,
        payableAmount,
      );
      
      if (cart.length > 0) {
        let targetOrderId = activeOrder?.orderId;
        // If we don't have an ID yet, we must wait for the server to provide one during checkout/send

        appendOrder(targetOrderId || "NEW", orderContext, cart);
        markItemsSent(targetOrderId || "NEW");
        try {
          await fetch(`${API_URL}/api/orders/save-cart`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              tableId: orderContext.tableId, 
              orderId: targetOrderId, 
              items: cart 
            }),
          });
        } catch (err) {
          console.error("Cart Save Error on Checkout:", err);
        }
      }

      await fetch(`${API_URL}/api/orders/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: orderContext.tableId }),
      }).catch(err => console.error("Checkout Sync Error:", err));

      socket.emit("order_status_update", {
        orderId: activeOrder?.orderId || "PAYMENT",
        action: "CLOSE",
      });

      router.replace(`/(tabs)/category?section=${orderContext.section}`);
    } else {
      router.push("/summary");
    }
  };

  const handleSendOrder = async () => {
    const unsentItems = cart.filter((i: any) => !i.status || i.status === "NEW");
    if (unsentItems.length === 0) return;

    let targetOrderId = activeOrder?.orderId;
    // No more getNextOrderId() - we wait for the database

    
    appendOrder(targetOrderId || "NEW", orderContext, unsentItems);
    markItemsSent(targetOrderId || "NEW");

    const updatedCart = cart.map(item => {
      if (!item.status || item.status === "NEW") {
        return { ...item, status: "SENT" as const };
      }
      return item;
    });

    try {
      await fetch(`${API_URL}/api/orders/save-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tableId: orderContext.tableId, 
          orderId: targetOrderId, 
          items: updatedCart 
        }),
      });

      const sendRes = await fetch(`${API_URL}/api/orders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: orderContext.tableId }),
      });
      
      const sendData = await sendRes.json();
        if (sendData.success) {
          const officialOrderId = sendData.currentOrderId || sendData.CurrentOrderId || targetOrderId;
          
          if (officialOrderId) {
            useCartStore.getState().setTableOrderId(orderContext.tableId!, officialOrderId);
            useActiveOrdersStore.getState().updateOrderId(targetOrderId || "NEW", officialOrderId);
            
            updateTableStatus(
              orderContext.tableId || "",
              orderContext.section || "TAKEAWAY",
              orderContext.orderType === "DINE_IN" ? orderContext.tableNo! : orderContext.takeawayNo!,
              officialOrderId,
              "SENT",
              undefined,
              undefined,
              payableAmount,
            );

            socket.emit("new_order", {
              orderId: officialOrderId,
              context: orderContext,
              items: unsentItems,
              createdAt: Date.now(), // ✅ Add timestamp for synchronized KDS clock
            });

            showToast({
              type: "success",
              message: "Order Sent",
              subtitle: `Kitchen notified. Order #${officialOrderId}`,
            });
          }
        }

    } catch (err) {
      console.error("Cart Save/Send Error:", err);
    }

    if (currentContextId) {
      useCartStore.getState().setCartItems(currentContextId, updatedCart, true);
    }

    router.replace(`/(tabs)/category?section=${orderContext.section}`);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyCartSurface}>
      <View style={styles.emptyCartIconWrap}>
        <View style={styles.emptyCartIconPulse} />
        <View style={styles.emptyCartIconContainer}>
          <Ionicons name="fast-food-outline" size={48} color={Theme.primary} />
        </View>
      </View>
      <Text style={styles.emptyCartTitle}>Empty Cart</Text>
      <Text style={styles.emptyCartSubtitle}>
        Select delicious dishes from the menu to start this order.
      </Text>
    </View>
  );

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isSent = "status" in item && item.status === "SENT";
    const isVoided = "status" in item && item.status === "VOIDED";
    const isExpanded = expandedItemId === item.lineItemId;

    return (
      <View style={[styles.itemContainer, isExpanded && styles.itemExpanded]}>
        <View style={[styles.statusBar, { backgroundColor: isSent ? "#22C55E" : "#3B82F6" }]} />
        <Pressable
          style={styles.itemHeader}
          onPress={() => {
            if (!isSent) {
              setItemToEdit(item);
              setIsEditModalVisible(true);
            }
          }}
        >
          {(!isPhone || isLandscape) && (
            <View style={styles.itemIndexWrap}>
              <Ionicons name="chevron-forward" size={12} color={Theme.textMuted} style={styles.chevron} />
              <Text style={styles.itemIndex}>{index + 1}</Text>
            </View>
          )}

          <View style={styles.itemInfo}>
            <View style={[styles.itemMainRow, isPhone && { alignItems: "center", gap: 6 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                <Text style={[styles.itemName, (isSent || isVoided) && styles.textMuted, isVoided && styles.strikeThrough, isPhone && { fontSize: 13, flex: 1 }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.isTakeaway && (
                  <TouchableOpacity 
                    onPress={(e) => { e.stopPropagation(); updateCartItemTakeaway(item.lineItemId, !item.isTakeaway); }}
                    style={[styles.twBadge, { backgroundColor: Theme.danger + '15', borderColor: Theme.danger + '30' }]}
                  >
                    <Text style={[styles.twBadgeText, { color: Theme.danger }]}>TW</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.statusTag, { 
                backgroundColor: isVoided ? Theme.danger + "10" : isSent ? "#22C55E15" : "#3B82F615",
                borderColor: isVoided ? Theme.danger + "30" : isSent ? "#22C55E30" : "#3B82F630",
                paddingVertical: isPhone ? 2 : 4,
              }]}>
                <Text style={[styles.statusTagText, { fontSize: isPhone ? 8 : 9, color: isVoided ? Theme.danger : isSent ? "#15803D" : "#1D4ED8" }]}>
                  {isVoided ? "VOIDED" : isSent ? "SENT" : "NEW"}
                </Text>
              </View>
            </View>

            <View style={styles.modifierListSmall}>
              {item.modifiers && item.modifiers.map((m: any, idx: number) => (
                <Text key={`${m.ModifierId}-${idx}`} style={styles.modifierTextSmall}>• {m.ModifierName}{m.Price > 0 ? ` (+$${m.Price.toFixed(2)})` : ""}</Text>
              ))}
              {(item.note || item.notes) ? <Text style={styles.modifierTextSmall}>• Note: {item.note || item.notes}</Text> : null}
            </View>

            <View style={[styles.inlineControls, isPhone && { marginTop: 8 }]}>
              {isSent || isVoided ? (
                <View style={styles.sentLabel}><Text style={styles.sentQtyText}>QTY: {item.qty}</Text></View>
              ) : (
                <View style={[styles.qtyControlSmall, isPhone && { backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border }]}>
                  <TouchableOpacity style={[styles.qtyBtnSmall, isPhone && { width: 32, height: 32 }]} onPress={(e) => { e.stopPropagation(); updateCartItemQty(item.lineItemId, Math.max(0, item.qty - 1)); }}>
                    <Ionicons name="remove" size={isPhone ? 20 : 18} color={Theme.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyTextSmall, isPhone && { paddingHorizontal: 12, fontSize: 14 }]}>{item.qty}</Text>
                  <TouchableOpacity style={[styles.qtyBtnSmall, isPhone && { width: 32, height: 32 }]} onPress={(e) => { e.stopPropagation(); updateCartItemQty(item.lineItemId, item.qty + 1); }}>
                    <Ionicons name="add" size={isPhone ? 20 : 18} color={Theme.primary} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <View style={[styles.priceContainer, { alignItems: "flex-end" }]}>
                {item.discount > 0 ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.itemPrice, { fontSize: isPhone ? 10 : 11, textDecorationLine: "line-through", color: Theme.textMuted, minWidth: 0 }]}>${((item.price || 0) * item.qty).toFixed(2)}</Text>
                      <View style={[styles.discountBadge, isPhone && { paddingHorizontal: 3 }]}><Text style={[styles.discountBadgeText, isPhone && { fontSize: 8 }]}>-{item.discount}%</Text></View>
                    </View>
                    <Text style={[styles.itemPrice, { color: "#22C55E", fontSize: isPhone ? 15 : 16 }, isVoided && styles.strikeThrough]}>${((item.price || 0) * item.qty * (1 - (item.discount || 0) / 100)).toFixed(2)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.itemPrice, isPhone && { fontSize: 15 }, isVoided && styles.strikeThrough]}>${((item.price || 0) * item.qty).toFixed(2)}</Text>
                )}
              </View>
              {isSent && !isVoided ? (
                <TouchableOpacity style={[styles.deleteBtn, { marginLeft: 10 }]} onPress={() => { setItemToVoid(item); setShowCancelModal(true); }}>
                  <Ionicons name="trash" size={20} color={Theme.danger} />
                </TouchableOpacity>
              ) : !isSent && !isVoided ? (
                <TouchableOpacity style={[styles.deleteBtn, { marginLeft: 10 }]} onPress={() => { removeFromCartGlobal(item.lineItemId); showToast({ type: "info", message: "Removed", subtitle: `${item.name} deleted` }); }}>
                  <Ionicons name="trash-outline" size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { width },
        isPhone && isLandscape && styles.containerLandscapePhone,
      ]}
    >
      {/* HEADER ACTIONS */}
      <View
        style={[styles.header, isPhone && isLandscape && { marginBottom: 10 }]}
      >
        <View style={styles.tableIdentity}>
          <Text
            style={[
              styles.tableIdentityText,
              isPhone && isLandscape && { fontSize: 13 },
            ]}
          >
            {orderContext.orderType === "TAKEAWAY"
              ? `TAKEAWAY #${orderContext.takeawayNo}`
              : `${formatSectionGlobal(orderContext.section || "")} - T${orderContext.tableNo}`}
          </Text>
          {orderContext.tableId && tableOrderIds[orderContext.tableId] && (
            <Text style={styles.orderIdLabel}>
              Order ID: {tableOrderIds[orderContext.tableId]}
            </Text>
          )}
        </View>

        {cart.length > 0 && (
          <TouchableOpacity
            style={[
              styles.clearBtn,
              isPhone && {
                paddingHorizontal: 10,
                width: 44,
                justifyContent: "center",
              },
            ]}
            onPress={handleClearCart}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={Theme.danger} />
            {!isPhone && <Text style={styles.clearBtnText}>Clear Unsent</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* ITEMS LIST */}
      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.lineItemId}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.listContent,
          displayItems.length === 0 && { flex: 1, justifyContent: "center" },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* FOOTER AREA */}
      {displayItems.length > 0 && (
        <View
          style={[styles.footer, isPhone && isLandscape && { paddingTop: 8 }]}
        >
          <View
            style={[
              styles.summary,
              isPhone && isLandscape && { marginBottom: 8 },
            ]}
          >
            <View style={styles.summaryRow}>
              <Text
                style={[
                  styles.payableLabel,
                  isPhone && isLandscape && { fontSize: 13 },
                ]}
              >
                Subtotal
              </Text>
              <Text
                style={[
                  styles.payableValue,
                  isPhone && isLandscape && { fontSize: 14 },
                ]}
              >
                ${subtotal.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            {unsentCount > 0 ? (
              <>
                <TouchableOpacity
                  style={styles.holdBtn}
                  onPress={async () => {
                    let targetOrderId = activeOrder?.orderId;

                    if (orderContext.tableId) {
                      try {
                        await fetch(`${API_URL}/api/orders/save-cart`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ 
                            tableId: orderContext.tableId, 
                            orderId: targetOrderId, 
                            items: cart 
                          }),
                        });

                        await fetch(`${API_URL}/api/orders/hold`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tableId: orderContext.tableId }),
                        });
                      } catch (err) {
                        console.error("Hold sync error:", err);
                      }
                    }
                    updateTableStatus(
                      orderContext.tableId || "",
                      orderContext.section!,
                      orderContext.tableNo!,
                      targetOrderId || "HOLD",
                      "HOLD",
                    );
                    holdOrder(targetOrderId || "HOLD", cart, orderContext);
                    router.replace(
                      `/(tabs)/category?section=${orderContext.section}`,
                    );
                  }}
                >
                  <Ionicons
                    name="pause-circle-outline"
                    size={20}
                    color="#fff"
                  />
                  {!isPhone && <Text style={styles.btnText}>Hold Cart</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.proceedBtn,
                    { backgroundColor: Theme.success },
                  ]}
                  onPress={() => handleSendOrder()}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                  {!isPhone && <Text style={styles.btnText}>Send</Text>}
                </TouchableOpacity>
              </>
            ) : currentTableStatus === "SENT" ? (
              <TouchableOpacity
                style={[
                  styles.proceedBtn,
                  { flex: 1, backgroundColor: "#F59E0B" },
                ]}
                onPress={() => handleCheckout()}
              >
                <Ionicons name="receipt-outline" size={20} color="#fff" />
                <Text style={styles.btnText}>Checkout</Text>
              </TouchableOpacity>
            ) : currentTableStatus === "HOLD" || currentTableStatus === "BILL_REQUESTED" ? (
              <TouchableOpacity
                style={[
                  styles.proceedBtn,
                  { flex: 1, backgroundColor: Theme.primary },
                ]}
                onPress={() => router.push("/summary")}
              >
                <Ionicons
                  name="arrow-forward-circle-outline"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.btnText}>Proceed to Pay</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {/* CANCEL PASSWORD MODAL */}
      {showCancelModal && (
        <Modal transparent visible={showCancelModal} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Cancel Order?</Text>
              <TextInput
                style={styles.modalInput}
                secureTextEntry
                autoFocus
                value={cancelPassword}
                onChangeText={setCancelPassword}
                placeholder="Admin Password"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowCancelModal(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnConfirm}
                  onPress={async () => {
                        // Securely verify password with backend - checks for any Admin/Manager password
                        const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ 
                            password: cancelPassword 
                          })
                        });
                        const verifyData = await verifyRes.json();

                        if (verifyData.success) {
                          if (itemToVoid && orderContext.tableId) {
                            // 1. Remove from Backend Database
                            fetch(`${API_URL}/api/orders/remove-item`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ 
                                tableId: orderContext.tableId, 
                                itemId: itemToVoid.lineItemId 
                              }),
                            }).catch(err => console.error("Void sync error:", err));

                            // 2. Update local store
                            if (activeOrder) {
                              voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
                            }
                            
                            setItemToVoid(null);
                            setCancelPassword("");
                            setShowCancelModal(false);
                            showToast({
                              type: "success",
                              message: "Item Voided",
                              subtitle: "Database & Kitchen updated",
                            });
                          } else {
                            clearCartStandalone();
                            setCancelPassword("");
                            setShowCancelModal(false);
                          }
                        } else {
                          showToast({
                            type: "error",
                            message: "Invalid Password",
                          });
                        }

                  }}
                >
                  <Text style={styles.modalBtnTextConfirm}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* EDIT DISH MODAL */}
      <EditDishModal
        visible={isEditModalVisible}
        item={itemToEdit}
        onClose={() => {
          setIsEditModalVisible(false);
          setItemToEdit(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "100%",
    backgroundColor: Theme.bgCard,
    borderLeftWidth: 1.5,
    borderLeftColor: Theme.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyCartSurface: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyCartIconWrap: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyCartIconPulse: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.primary + "10",
  },
  emptyCartIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.primary + "10",
  },
  emptyCartTitle: {
    fontFamily: Fonts.extraBold,
    fontSize: 22,
    color: Theme.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  emptyCartSubtitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  containerLandscapePhone: {
    padding: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    zIndex: 10,
  },
  tableIdentity: {},
  tableIdentityText: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
    textTransform: "uppercase",
  },
  headerIcons: { flexDirection: "row", gap: 8 },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: { paddingBottom: 20 },
  itemContainer: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.border + "80", // Softer border
    borderRadius: 16,
    backgroundColor: "#fff",
    overflow: "hidden",
    flexDirection: "row",
    ...Theme.shadowSm,
    borderBottomWidth: 2, // Slight dimensional feel
    borderBottomColor: Theme.border + "40",
  },
  itemExpanded: {
    backgroundColor: Theme.bgMuted + "50",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statusBar: { width: 4, height: "100%" },
  itemHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  itemIndexWrap: {
    width: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    marginRight: 8,
    gap: 2,
  },
  chevron: { marginLeft: -4 },
  itemIndex: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  itemInfo: { flex: 1, paddingRight: 4 },
  itemMainRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 9,
    fontFamily: Fonts.black,
    textTransform: "uppercase",
  },
  modifierListSmall: { marginTop: 4, paddingLeft: 10, gap: 2, marginBottom: 2 },
  modifierTextSmall: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  inlineControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sentQtyText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  qtyControlSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 8,
    padding: 2,
  },
  qtyBtnSmall: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 6,
    ...Theme.shadowSm,
  },
  qtyTextSmall: {
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Theme.textPrimary,
  },
  priceContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemPrice: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: Theme.primary,
    minWidth: 60,
    textAlign: "right",
  },
  deleteBtn: { padding: 4, marginLeft: 4 },
  textMuted: { color: Theme.textMuted },
  discountRow: {
    padding: 10,
    backgroundColor: Theme.bgMain + "30",
    borderTopWidth: 1,
    borderTopColor: Theme.border + "50",
  },
  discountInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountLabel: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  discountInputSmall: {
    width: 60,
    height: 32,
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.border,
    textAlign: "center",
    fontSize: 12,
    fontFamily: Fonts.black,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  footer: { borderTopWidth: 1, borderTopColor: Theme.border, paddingTop: 16 },
  addBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.primaryLight,
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  addLabel: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginRight: 15,
  },
  addActions: { flex: 1, flexDirection: "row", gap: 15 },
  addBtnText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.primary },
  summary: { gap: 6, marginBottom: 20 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  payableLabel: {
    fontSize: 15,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  payableValue: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  actions: { flexDirection: "row", gap: 10 },
  holdBtn: {
    flex: 1,
    height: 50,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Theme.shadowMd,
  },
  proceedBtn: {
    flex: 1.1,
    height: 50,
    backgroundColor: "#F59E0B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Theme.shadowMd,
  },
  btnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: Theme.bgCard,
    padding: 24,
    borderRadius: 20,
    width: 300,
  },
  modalTitle: { fontSize: 18, fontFamily: Fonts.black, marginBottom: 15 },
  modalInput: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalBtnCancel: { padding: 10 },
  modalBtnTextCancel: { color: Theme.textSecondary, fontFamily: Fonts.bold },
  modalBtnConfirm: {
    backgroundColor: Theme.danger,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalBtnTextConfirm: { color: "#fff", fontFamily: Fonts.black },
  twBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.danger,
  },
  strikeThrough: {
    textDecorationLine: "line-through",
    marginBottom: -2,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.danger + "10",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Theme.danger + "20",
  },
  clearBtnText: {
    color: Theme.danger,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  sentLabel: {
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountBadge: {
    backgroundColor: "#22C55E15",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22C55E30",
  },
  discountBadgeText: {
    color: "#15803D",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  orderIdLabel: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    marginTop: 2,
    opacity: 0.8,
  },
});
