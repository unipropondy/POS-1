import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";

import { API_URL } from "../constants/Config";
import { OrderItem, useActiveOrdersStore, voidOrderItem } from "../stores/activeOrdersStore";
import { CartItem, useCartStore } from "../stores/cartStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { getNextOrderId } from "../stores/orderIdStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { holdOrder } from "../stores/heldOrdersStore";
import EditDishModal from "../components/EditDishModal";
import { socket } from "../constants/socket";

// Premium Cart Item Card
const CartItemCard = React.memo(
  ({
    item,
    onMinus,
    onPlus,
    onEdit,
    onVoid,
  }: {
    item: any;
    onMinus?: (id: string) => void;
    onPlus?: (id: string) => void;
    onEdit: (item: any) => void;
    onVoid?: (item: any) => void;
  }) => {
    const isSent = item.sent === 1 || !!item.sentDate || item.status === "SENT";
    const isVoided = item.status === "VOIDED";

    const statusColor = isVoided
      ? Theme.danger
      : isSent
      ? Theme.success
      : Theme.primary;

    return (
      <View
        style={[
          styles.itemCard,
          isVoided && styles.voidedCard,
        ]}
      >
        <View style={[styles.statusBar, { backgroundColor: statusColor }]} />
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.nameRow}>
              <Text style={[styles.dishName, isVoided && styles.voidedText]}>
                {item.name}
              </Text>
              <View style={styles.badgeRow}>
                {isVoided ? (
                  <View style={[styles.statusTag, { backgroundColor: Theme.danger + "15", borderColor: Theme.danger + "30" }]}>
                    <Text style={[styles.statusTagText, { color: Theme.danger }]}>VOIDED</Text>
                  </View>
                ) : (
                  <View style={[styles.statusTag, { backgroundColor: statusColor + "15", borderColor: statusColor + "30" }]}>
                    <Text style={[styles.statusTagText, { color: statusColor }]}>
                      {isSent ? "SENT" : "NEW"}
                    </Text>
                  </View>
                )}
                {item.isTakeaway && (
                  <View style={[styles.statusTag, { backgroundColor: Theme.danger + "15", borderColor: Theme.danger + "30" }]}>
                    <Text style={[styles.statusTagText, { color: Theme.danger }]}>TW</Text>
                  </View>
                )}
              </View>
            </View>
            
            <TouchableOpacity onPress={() => onEdit(item)} style={styles.editBtn}>
              <Ionicons name="ellipsis-vertical" size={20} color={Theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {(item.modifiers && item.modifiers.length > 0) || (item.note || item.notes) ? (
            <View style={styles.modifiersList}>
              {item.modifiers && item.modifiers.length > 0 && (
                <Text style={styles.modifierText}>
                  {item.modifiers.map((m: any) => m.ModifierName).join(", ")}
                </Text>
              )}
              {(item.note || item.notes) && (
                <Text style={styles.noteText}>
                  • Note: {item.note || item.notes}
                </Text>
              )}
            </View>
          ) : null}

          <View style={styles.cardDivider} />

          <View style={styles.cardFooter}>
            <View style={styles.qtyContainer}>
              {!isSent && !isVoided ? (
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => onMinus?.(item.lineItemId)}
                  >
                    <Ionicons name="remove" size={18} color={Theme.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{item.qty}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { backgroundColor: Theme.primary }]}
                    onPress={() => onPlus?.(item.lineItemId)}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.sentPill, { backgroundColor: statusColor + "10" }]}>
                  <Text style={[styles.sentQtyLabel, { color: statusColor }]}>
                    {item.qty} Items {isVoided ? "Cancelled" : "Sent"}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.priceSection}>
              <View style={styles.priceColumn}>
                {item.discount > 0 && (
                  <View style={styles.discountRow}>
                    <Text style={styles.originalPrice}>${((item.price || 0) * item.qty).toFixed(2)}</Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>-{item.discount}%</Text>
                    </View>
                  </View>
                )}
                <Text style={[styles.itemTotal, isVoided && styles.voidedText, item.discount > 0 && { color: "#22C55E" }]}>
                  ${((item.price || 0) * item.qty * (1 - (item.discount || 0) / 100)).toFixed(2)}
                </Text>
              </View>

              {(isSent && !isVoided) ? (
                <TouchableOpacity onPress={() => onVoid?.(item)} style={styles.trashBtn}>
                  <Ionicons name="trash-outline" size={20} color={Theme.danger} />
                </TouchableOpacity>
              ) : !isSent && (
                <TouchableOpacity onPress={() => onMinus?.(item.lineItemId)} style={styles.trashBtn}>
                  <Ionicons name="trash-outline" size={20} color={Theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }
);

export default function CartScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [cancelPassword, setCancelPassword] = React.useState("");

  const [editingItem, setEditingItem] = React.useState<CartItem | null>(null);
  const [editQty, setEditQty] = React.useState(1);
  const [editNote, setEditNote] = React.useState("");

  const orderContext = useOrderContextStore((state: any) => state.currentOrder);
  const carts = useCartStore((state: any) => state.carts);
  const currentContextId = useCartStore((state: any) => state.currentContextId);
  const removeFromCartGlobal = useCartStore((state: any) => state.removeFromCartGlobal);
  const addToCartGlobal = useCartStore((state: any) => state.addToCartGlobal);
  const clearCart = useCartStore((state: any) => state.clearCart);
  const setCartItemsGlobal = useCartStore((state: any) => state.setCartItems);

  const cart = useMemo(() => {
    return (currentContextId && carts[currentContextId]) || [];
  }, [carts, currentContextId]);

  const activeOrders = useActiveOrdersStore((state: any) => state.activeOrders);
  const appendOrder = useActiveOrdersStore((state: any) => state.appendOrder);
  const markItemsSent = useActiveOrdersStore((state: any) => state.markItemsSent);
  const closeActiveOrder = useActiveOrdersStore((state: any) => state.closeActiveOrder);

  const tables = useTableStatusStore((s: any) => s.tables);
  const updateTableStatus = useTableStatusStore((s: any) => s.updateTableStatus);

  const activeOrder = useMemo(() => {
    if (!orderContext) return undefined;

    return activeOrders.find((o: any) => {
      if (orderContext.orderType === "DINE_IN") {
        return (
          o.context.orderType === "DINE_IN" &&
          o.context.section === orderContext.section &&
          o.context.tableNo === orderContext.tableNo
        );
      }
      if (orderContext.orderType === "TAKEAWAY") {
        return (
          o.context.orderType === "TAKEAWAY" &&
          o.context.takeawayNo === orderContext.takeawayNo
        );
      }
      return false;
    });
  }, [activeOrders, orderContext]);

  const displayItems = useMemo(() => {
    const sentItems: (OrderItem | CartItem)[] = activeOrder?.items || [];
    return [...sentItems, ...cart].filter(Boolean); // Filter out any null values
  }, [activeOrder, cart]);

  const unsentCount = useMemo(() => {
    return cart.filter((i: any) => !i.status || i.status === 'NEW').length;
  }, [cart]);

  const subtotal = useMemo(() => {
    return displayItems.reduce((sum, item) => {
      if (!item || item.status === "VOIDED") return sum;
      const baseTotal = (item.price || 0) * item.qty;
      const discountVal = (item.discount || 0) / 100;
      return sum + baseTotal * (1 - discountVal);
    }, 0);
  }, [displayItems]);

  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const payableAmount = subtotal + taxAmount;

  const currentTableData = useMemo(() => {
    if (orderContext?.orderType !== "DINE_IN") return undefined;
    const table = tables.find((t: any) => t.section === orderContext.section && t.tableNo === orderContext.tableNo);
    if (!table) return undefined;

    // Normalize status to string if it's an integer
    if (typeof table.status === 'number' || typeof (table as any).Status === 'number') {
      const s = typeof table.status === 'number' ? table.status : (table as any).Status;
      const statusMap: Record<number, string> = {
        0: 'EMPTY',
        1: 'SENT',
        2: 'HOLD',
        3: 'BILL_REQUESTED',
        4: 'LOCKED',
        5: 'SENT'
      };
      return { ...table, status: statusMap[s] };
    }
    return table;
  }, [orderContext, tables]);

  React.useEffect(() => {
    if (!orderContext) router.replace("/(tabs)/category");
  }, [orderContext]);

  if (!orderContext) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.emptyText}>No Active Order Context</Text>
      </View>
    );
  }

  const [itemToVoid, setItemToVoid] = React.useState<any>(null);

  const handleCancelOrder = () => {
    if (cancelPassword !== "786") {
      showToast({
        type: "error",
        message: "Incorrect Password",
        subtitle: "Admin password required",
      });
      return;
    }

    if (itemToVoid && activeOrder) {
      // Logic for voiding a single item
      voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
      
      // 🔥 EMIT SOCKET EVENT FOR KDS
      socket.emit("order_status_update", {
        orderId: activeOrder.orderId,
        action: "VOID",
        lineItemId: itemToVoid.lineItemId
      });

      showToast({
        type: "success",
        message: "Item Voided",
        subtitle: "Sent items updated",
      });
    } else {
      // Logic for canceling the entire order
      if (activeOrder) {
        closeActiveOrder(activeOrder.orderId);
        // ✅ Sync status with DB via new API
        const tableId = orderContext?.tableId || currentTableData?.tableId;
        if (tableId) {
          fetch(`${API_URL}/api/orders/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableId }),
          }).catch(err => console.error("Sync Error:", err));
        }
      }
      clearCart();
      if (
        orderContext.orderType === "DINE_IN" &&
        orderContext.section &&
        orderContext.tableNo
      ) {
        updateTableStatus(
          orderContext.section,
          orderContext.tableNo,
          "",
          "EMPTY",
        );
      }
      router.replace("/(tabs)/category");
    }

    setShowCancelModal(false);
    setCancelPassword("");
    setItemToVoid(null);
  };

  const updateItemNotes = (contextId: string, lineItemId: string, notes: string) => {
    const currentItems = carts[contextId] || [];
    const updated = currentItems.map((i: any) => i.lineItemId === lineItemId ? { ...i, notes } : i);
    setCartItemsGlobal(contextId, updated);
  };

  const handlePlus = React.useCallback((lineItemId: string) => {
    const item = cart.find((i: any) => i.lineItemId === lineItemId);
    if (item) {
      const { qty, lineItemId: lid, ...rest } = item;
      addToCartGlobal(rest);
    }
  }, [cart, addToCartGlobal]);

  const handleMinus = React.useCallback((lineItemId: string) => {
    removeFromCartGlobal(lineItemId);
  }, [removeFromCartGlobal]);

  const handleVoidItem = (item: any) => {
    setEditingItem(null); // Close edit if open
    setCancelPassword("");
    setItemToVoid(item);
    setShowCancelModal(true);
  };

  const handleEdit = React.useCallback((item: any) => {
    setEditingItem(item);
  }, []);

  const sendOrder = async () => {
    const context = orderContext;
    if (!context || cart.length === 0) return;

    let targetOrderId = activeOrder?.orderId;
    if (!targetOrderId) {
      targetOrderId = getNextOrderId();
    }

    appendOrder(targetOrderId, context, cart);
    markItemsSent(targetOrderId);

    // 🔥 EMIT SOCKET EVENT FOR KDS
    socket.emit("new_order", {
      orderId: targetOrderId,
      context,
      items: cart
    });

    if (context.orderType === "DINE_IN") {
      const tableId = context.tableId || currentTableData?.tableId;
      if (tableId) {
      if (tableId) {
        try {
          // ✅ Use new synchronized status API
          await fetch(`${API_URL}/api/orders/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableId }),
          });
        } catch (err) {
          console.error("Failed to update status on server:", err);
        }
      }
      }
      updateTableStatus(tableId || "", context.section!, context.tableNo!, targetOrderId, 'SENT', undefined, undefined, payableAmount);
      clearCart();
      router.replace(`/(tabs)/category?section=${context.section}`);
    } else if (context.orderType === "TAKEAWAY") {
      updateTableStatus("", "TAKEAWAY", context.takeawayNo!, targetOrderId, 'SENT', undefined, undefined, payableAmount);
      clearCart();
      router.replace(`/(tabs)/category?section=TAKEAWAY`);
    } else {
      clearCart();
      router.replace("/(tabs)/category");
    }
  };

  const renderCartItem = React.useCallback(
    ({ item }: { item: any }) => {
      if (!item) return null;
      return (
        <CartItemCard
          item={item}
          onPlus={handlePlus}
          onMinus={handleMinus}
          onEdit={handleEdit}
          onVoid={handleVoidItem}
        />
      );
    },
    [handlePlus, handleMinus, handleEdit, handleVoidItem, cart],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
      <View style={styles.container}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
            
            <View>
              {orderContext.orderType === "DINE_IN" && (
                <Text style={styles.contextText}>
                  Table {orderContext.tableNo} · {orderContext.section?.replace("_", "-").replace("SECTION", "Section")}
                </Text>
              )}
              {orderContext.orderType === "TAKEAWAY" && (
                <Text style={styles.contextText}>
                  Takeaway · #{orderContext.takeawayNo}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[
                styles.topActionBtn,
                { backgroundColor: Theme.bgMuted, borderColor: Theme.border, borderWidth: 1 },
              ]}
              onPress={() => clearCart()}
            >
              <Ionicons name="trash-outline" size={16} color={Theme.textSecondary} />
              <Text style={[styles.topBtnText, { color: Theme.textSecondary }]}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.cartTitleRow}>
          <Text style={styles.title}>ORDER</Text>
          {displayItems.length > 0 && (
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>{displayItems.length}</Text>
            </View>
          )}
        </View>

        <FlatList
          data={displayItems}
          keyExtractor={(i, index) => i ? i.lineItemId + index : `null-${index}`}
          contentContainerStyle={{ paddingBottom: 150 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Cart is Empty</Text>
          }
          renderItem={renderCartItem}
          style={{ flex: 1 }}
        />

        <View style={styles.bottomBlock}>
          <View style={styles.subtotalCard}>
            <Text style={styles.subtotalLabel}>SUBTOTAL</Text>
            <Text style={styles.subtotalAmount}>${subtotal.toFixed(2)}</Text>
          </View>

           <View style={styles.checkoutRow}>
            {unsentCount > 0 && (
              <>
                <Pressable
                  style={[styles.checkoutBtn, { backgroundColor: Theme.info }]}
                  onPress={async () => {
                    let targetOrderId = activeOrder?.orderId;
                    if (!targetOrderId) targetOrderId = getNextOrderId();

                    if (orderContext.orderType === "DINE_IN") {
                      const tableId = orderContext.tableId || currentTableData?.tableId;
                      if (tableId) {
                        try {
                          await fetch(`${API_URL}/api/orders/hold`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tableId }),
                          });
                        } catch (err) {
                          console.error("Failed to update status on server:", err);
                        }
                      }
                      updateTableStatus(tableId || "", orderContext.section!, orderContext.tableNo!, targetOrderId, 'HOLD', undefined, undefined, payableAmount);
                      holdOrder(targetOrderId, cart, orderContext);
                      clearCart();
                      router.replace(`/(tabs)/category?section=${orderContext.section}`);
                    } else if (orderContext.orderType === "TAKEAWAY") {
                      updateTableStatus("", "TAKEAWAY", orderContext.takeawayNo!, targetOrderId, 'HOLD', undefined, undefined, payableAmount);
                      holdOrder(targetOrderId, cart, orderContext);
                      clearCart();
                      router.replace(`/(tabs)/category?section=TAKEAWAY`);
                    } else {
                      clearCart();
                      router.replace("/(tabs)/category");
                    }
                  }}
                >
                  <Ionicons name="pause-circle-outline" size={18} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Hold</Text>
                </Pressable>

                <Pressable
                  style={[styles.checkoutBtn, { backgroundColor: Theme.primary }]}
                  onPress={sendOrder}
                >
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Send</Text>
                </Pressable>
              </>
            )}

            {unsentCount === 0 && (activeOrder || cart.length > 0) && (
              <>
                {(!currentTableData || currentTableData.status === 'SENT' || currentTableData.status === 'HOLD') ? (
                  <Pressable
                    style={[styles.checkoutBtn, { backgroundColor: Theme.warning }]}
                    onPress={async () => {
                      if (orderContext.orderType === "DINE_IN") {
                        const tableId = orderContext.tableId || currentTableData?.tableId;
                        if (tableId) {
                          try {
                            // Hit the synchronized Checkout status endpoint
                            await fetch(`${API_URL}/api/orders/checkout`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tableId }),
                            });
                          } catch (err) {
                            console.error("Failed to update checkout status:", err);
                          }
                        }
                        updateTableStatus(tableId || "", orderContext.section!, orderContext.tableNo!, activeOrder.orderId, 'BILL_REQUESTED', undefined, undefined, payableAmount);
                        router.push("/summary");
                      } else {
                        router.push("/summary");
                      }
                    }}
                  >
                    <Ionicons name="receipt-outline" size={18} color="#fff" />
                    <Text style={styles.checkoutBtnText}>Checkout</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.checkoutBtn, { backgroundColor: Theme.primary }]}
                    onPress={() => router.push("/summary")}
                  >
                    <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
                    <Text style={styles.checkoutBtnText}>Proceed</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </View>

      {/* CANCEL MODAL */}
      <Modal transparent visible={showCancelModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{itemToVoid ? "Void Item?" : "Cancel Order?"}</Text>
            <Text style={styles.modalDesc}>
              {itemToVoid 
                ? `Enter password to void "${itemToVoid.name}"` 
                : "Enter password to cancel the entire order."}
            </Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              autoFocus
              keyboardType="number-pad"
              value={cancelPassword}
              onChangeText={setCancelPassword}
              placeholder="Admin Password"
              placeholderTextColor={Theme.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setShowCancelModal(false); setCancelPassword(""); }}>
                <Text style={styles.modalBtnTextCancel}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: Theme.danger }]} onPress={handleCancelOrder}>
                <Text style={styles.modalBtnTextConfirm}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* UNIFIED EDIT MODAL */}
      <EditDishModal
        visible={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  container: { flex: 1, padding: 16 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: Theme.bgCard,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    borderRadius: Theme.radiusLg,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Theme.radiusMd,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  topActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radiusSm,
    borderWidth: 1,
  },
  topBtnText: { fontFamily: Fonts.bold, fontSize: 13 },
  contextText: { color: Theme.primary, fontSize: 15, fontFamily: Fonts.bold },
  cartTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16, marginTop: 4 },
  title: { color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.black, letterSpacing: 1 },
  itemCountBadge: {
    backgroundColor: Theme.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  itemCountText: { color: Theme.primary, fontFamily: Fonts.bold, fontSize: 13 },
  emptyText: { color: Theme.textMuted, fontSize: 16, textAlign: "center", marginTop: 40, fontFamily: Fonts.medium },
  itemCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  statusBar: {
    width: 4,
    height: "100%",
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  voidedCard: {
    backgroundColor: Theme.danger + "05",
    borderColor: Theme.danger + "20",
    borderStyle: "dashed",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  nameRow: {
    flex: 1,
  },
  dishName: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    textTransform: "uppercase",
  },
  editBtn: {
    padding: 8,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    marginLeft: 10,
  },
  modifiersList: {
    marginTop: 10,
    paddingLeft: 4,
  },
  modifierText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  noteText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.primary,
    fontStyle: "italic",
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Theme.border + "50",
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  qtyContainer: {
    flex: 1,
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    padding: 4,
    alignSelf: "flex-start",
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  qtyValue: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    paddingHorizontal: 16,
  },
  sentPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  sentQtyLabel: {
    fontSize: 12,
    fontFamily: Fonts.black,
  },
  priceSection: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  priceColumn: {
    alignItems: "flex-end",
  },
  discountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  originalPrice: {
    fontSize: 12,
    color: Theme.textMuted,
    textDecorationLine: "line-through",
    fontFamily: Fonts.bold,
  },
  discountBadge: {
    backgroundColor: "#22C55E15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22C55E30",
  },
  discountBadgeText: {
    color: "#15803D",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  itemTotal: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  trashBtn: {
    padding: 10,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  voidedText: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
  },
  bottomBlock: {
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.border + "50",
    ...Theme.shadowLg,
  },
  subtotalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.primary + "15",
    ...Theme.shadowMd,
  },
  subtotalLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  subtotalAmount: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 24,
  },
  checkoutRow: { flexDirection: "row", gap: 12 },
  checkoutBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: Theme.radiusMd,
    gap: 10,
    backgroundColor: Theme.primary,
    ...Theme.shadowMd,
  },
  checkoutBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 30,
    borderRadius: 32,
    width: "100%",
    maxWidth: 400,
    ...Theme.shadowLg,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontSize: 24,
    fontFamily: Fonts.black,
    marginBottom: 8,
    textAlign: "center",
  },
  modalDesc: {
    color: Theme.textSecondary,
    fontSize: 15,
    marginBottom: 24,
    fontFamily: Fonts.medium,
    textAlign: "center",
    lineHeight: 22,
  },
  modalInput: {
    backgroundColor: Theme.bgMuted,
    color: Theme.textPrimary,
    padding: 18,
    borderRadius: 16,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 24,
    fontFamily: Fonts.black,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    alignItems: "center",
  },
  modalBtnTextCancel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  modalBtnConfirm: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    alignItems: "center",
    ...Theme.shadowSm,
  },
  modalBtnTextConfirm: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 16,
  },
});
