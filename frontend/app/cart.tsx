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

import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";
import { CartItem, useCartStore } from "../stores/cartStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { getNextOrderId } from "../stores/orderIdStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { holdOrder } from "../stores/heldOrdersStore";

// --- MEMOIZED CART ITEM ---
const CartItemRow = React.memo(({ 
  item, 
  onMinus, 
  onPlus, 
  onEdit 
}: { 
  item: any; 
  onMinus: (id: string) => void; 
  onPlus: (id: string) => void;
  onEdit: (item: any) => void;
}) => {
  return (
    <View style={styles.row}>
      <View style={styles.itemInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.name, item.sent === 1 && styles.sentName]}>
            {item.name}
          </Text>
          <View style={styles.badgeRow}>
            {item.sent === 1 ? (
              <>
                <Ionicons name="checkmark-circle" size={14} color={Theme.success} />
                <Text style={styles.sentBadgeText}>SENT</Text>
              </>
            ) : (
              <>
                <Ionicons name="time" size={14} color={Theme.primary} />
                <Text style={styles.newBadgeText}>NEW</Text>
              </>
            )}
          </View>
        </View>

        {item.modifiers && item.modifiers.length > 0 && (
          <View style={styles.modifierContainer}>
            <Text style={styles.modifierText}>
              {item.modifiers.map((m: any) => m.ModifierName).join(", ")}
            </Text>
          </View>
        )}

        {item.notes ? (
          <View style={[styles.modifierContainer, { backgroundColor: Theme.bgMain }]}>
            <Text style={[styles.modifierText, { color: Theme.textPrimary }]}>
              Note: {item.notes}
            </Text>
          </View>
        ) : null}

        <View style={styles.itemFooter}>
          <Text style={styles.qty}>Qty: {item.qty}</Text>
          <Text style={styles.price}>
            ${((item.price || 0) * item.qty).toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => onMinus(item.id)}
          style={styles.actionBtn}
        >
          <Ionicons name="remove" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onPlus(item.id)}
          style={[styles.actionBtn, { backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder }]}
        >
          <Ionicons name="add" size={20} color={Theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onEdit(item)}
          style={[styles.actionBtn, { backgroundColor: Theme.bgNav }]}
        >
          <Ionicons name="create-outline" size={20} color={Theme.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function CartScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [cancelPassword, setCancelPassword] = React.useState("");

  const [editingItem, setEditingItem] = React.useState<CartItem | null>(null);
  const [editQty, setEditQty] = React.useState(1);
  const [editNote, setEditNote] = React.useState("");

  const orderContext = useOrderContextStore((state) => state.currentOrder);
  const carts = useCartStore((state) => state.carts);
  const currentContextId = useCartStore((state) => state.currentContextId);
  const removeFromCartGlobal = useCartStore((state) => state.removeFromCartGlobal);
  const addToCartGlobal = useCartStore((state) => state.addToCartGlobal);
  const clearCart = useCartStore((state) => state.clearCart);
  const setCartItemsGlobal = useCartStore((state) => state.setCartItems);

  const cart = useMemo(() => {
    return (currentContextId && carts[currentContextId]) || [];
  }, [carts, currentContextId]);

  const activeOrders = useActiveOrdersStore((state) => state.activeOrders);
  const appendOrder = useActiveOrdersStore((state) => state.appendOrder);
  const markItemsSent = useActiveOrdersStore((state) => state.markItemsSent);
  const closeActiveOrder = useActiveOrdersStore((state) => state.closeActiveOrder);

  const tables = useTableStatusStore((s) => s.tables);
  const updateTableStatus = useTableStatusStore((s) => s.updateTableStatus);

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

  const subtotal = useMemo(() => {
    return displayItems.reduce((sum, item) => {
      if (!item) return sum;
      return sum + (item.price || 0) * item.qty;
    }, 0);
  }, [displayItems]);

  const taxRate = 0; 
  const taxAmount = subtotal * taxRate;
  const payableAmount = subtotal + taxAmount;

  const currentTableData = useMemo(() => {
    if (orderContext?.orderType !== "DINE_IN") return undefined;
    return tables.find(t => t.section === orderContext.section && t.tableNo === orderContext.tableNo);
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

  const handleCancelOrder = () => {
    if (cancelPassword !== "786") {
      showToast({ type: "error", message: "Incorrect Password", subtitle: "Admin password required to cancel" });
      return;
    }

    if (activeOrder) closeActiveOrder(activeOrder.orderId);
    clearCart();
    if (orderContext.orderType === "DINE_IN" && orderContext.section && orderContext.tableNo) {
      updateTableStatus(orderContext.section, orderContext.tableNo, "", "EMPTY");
    }
    
    setShowCancelModal(false);
    setCancelPassword("");
    router.replace("/(tabs)/category");
  };

  const updateItemNotes = (contextId: string, lineItemId: string, notes: string) => {
    const currentItems = carts[contextId] || [];
    const updated = currentItems.map(i => i.lineItemId === lineItemId ? { ...i, notes } : i);
    setCartItemsGlobal(contextId, updated);
  };

  const handlePlus = React.useCallback((lineItemId: string) => {
    const item = cart.find(i => i.lineItemId === lineItemId);
    if (item) {
      const { qty, lineItemId: lid, ...rest } = item;
      addToCartGlobal(rest);
    }
  }, [cart, addToCartGlobal]);

  const handleMinus = React.useCallback((lineItemId: string) => {
    removeFromCartGlobal(lineItemId);
  }, [removeFromCartGlobal]);

  const handleEdit = React.useCallback((item: any) => {
    setEditingItem(item);
    setEditQty(item.qty);
    setEditNote(item.note || item.notes || "");
  }, []);

  const handleEditItemSave = () => {
    if (!editingItem || !currentContextId) return;
    
    const updatedCart = cart.map(item => {
      if (item && item.lineItemId === editingItem.lineItemId) {
        return { ...item, qty: editQty, note: editNote };
      }
      return item;
    });

    setCartItemsGlobal(currentContextId, updatedCart);
    setEditingItem(null);
  };

  const handleEditItemDelete = () => {
    if (!editingItem) return;
    removeFromCartGlobal(editingItem.lineItemId);
    setEditingItem(null);
  };

  const sendOrder = () => {
    const context = orderContext;
    if (!context || cart.length === 0) return;

    let targetOrderId = activeOrder?.orderId;
    if (!targetOrderId) {
      targetOrderId = getNextOrderId();
    }

    appendOrder(targetOrderId, context, cart);
    markItemsSent(targetOrderId);

    if (context.orderType === "DINE_IN") {
      updateTableStatus(context.section!, context.tableNo!, targetOrderId, 'SENT', undefined, undefined, payableAmount);
      clearCart();
      router.replace(`/(tabs)/category?section=${context.section}`);
    } else if (context.orderType === "TAKEAWAY") {
      updateTableStatus("TAKEAWAY", context.takeawayNo!, targetOrderId, 'SENT', undefined, undefined, payableAmount);
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
        <CartItemRow
          item={item}
          onPlus={handlePlus}
          onMinus={handleMinus}
          onEdit={handleEdit}
        />
      );
    },
    [handlePlus, handleMinus, handleEdit, cart],
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
                  Table {orderContext.tableNo} · {orderContext.section?.replace("_", " ")}
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
              style={[styles.topActionBtn, { backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder, borderWidth: 1 }]}
              onPress={() => setShowCancelModal(true)}
            >
              <Ionicons name="close-circle-outline" size={16} color={Theme.danger} />
              <Text style={[styles.topBtnText, { color: Theme.danger }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.topActionBtn, { backgroundColor: Theme.bgMuted, borderColor: Theme.border, borderWidth: 1 }]}
              onPress={() => clearCart()}
            >
              <Ionicons name="trash-outline" size={16} color={Theme.textSecondary} />
              <Text style={[styles.topBtnText, { color: Theme.textSecondary }]}>Clear</Text>
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
        />

        <View style={styles.bottomBlock}>
          <View style={styles.subtotalCard}>
            <Text style={styles.subtotalLabel}>SUBTOTAL</Text>
            <Text style={styles.subtotalAmount}>${subtotal.toFixed(2)}</Text>
          </View>

          <View style={styles.checkoutRow}>
            {cart.length > 0 && (
              <>
                <Pressable
                  style={[styles.checkoutBtn, { backgroundColor: Theme.info }]}
                  onPress={() => {
                    let targetOrderId = activeOrder?.orderId;
                    if (!targetOrderId) targetOrderId = getNextOrderId();

                    if (orderContext.orderType === "DINE_IN") {
                      updateTableStatus(orderContext.section!, orderContext.tableNo!, targetOrderId, 'HOLD', undefined, undefined, payableAmount);
                      holdOrder(targetOrderId, cart, orderContext);
                      clearCart();
                      router.replace(`/(tabs)/category?section=${orderContext.section}`);
                    } else if (orderContext.orderType === "TAKEAWAY") {
                      updateTableStatus("TAKEAWAY", orderContext.takeawayNo!, targetOrderId, 'HOLD', undefined, undefined, payableAmount);
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

            {cart.length === 0 && activeOrder && (
              <>
                {(!currentTableData || currentTableData.status === 'SENT' || currentTableData.status === 'HOLD') ? (
                  <Pressable
                    style={[styles.checkoutBtn, { backgroundColor: Theme.warning }]}
                    onPress={() => {
                      if (orderContext.orderType === "DINE_IN") {
                        updateTableStatus(orderContext.section!, orderContext.tableNo!, activeOrder.orderId, 'BILL_REQUESTED', undefined, undefined, payableAmount);
                        router.replace(`/(tabs)/category?section=${orderContext.section}`);
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
            <Text style={styles.modalTitle}>Cancel Order?</Text>
            <Text style={styles.modalDesc}>Please enter admin password to cancel.</Text>
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

      {/* EDIT ITEM MODAL */}
      <Modal transparent visible={!!editingItem} animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContentEdit}>
            <Text style={styles.modalTitle}>Editing {editingItem?.name}</Text>
            
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 15 }}>
              <Text style={{ color: Theme.textPrimary, fontSize: 16 }}>Quantity</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
                <TouchableOpacity 
                  style={styles.minus} 
                  onPress={() => {
                    if (editQty === 1) {
                      handleEditItemDelete();
                    } else {
                      setEditQty(q => q - 1);
                    }
                  }}
                >
                  <Ionicons name="remove" size={20} color={Theme.textPrimary} />
                </TouchableOpacity>
                <Text style={{ color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.bold, width: 30, textAlign: "center" }}>
                  {editQty}
                </Text>
                <TouchableOpacity 
                  style={styles.plus} 
                  onPress={() => setEditQty(q => q + 1)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: Theme.textMuted, fontSize: 14, marginTop: 10, marginBottom: 5 }}>Special Instructions:</Text>
            <TextInput
              style={[styles.modalInput, { marginBottom: 15 }]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="e.g. Less spicy, no onions"
              placeholderTextColor={Theme.textMuted}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtnCancel, { backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder, borderWidth: 1 }]} 
                onPress={handleEditItemDelete}
              >
                <Text style={[styles.modalBtnTextCancel, { color: Theme.danger }]}>Delete Item</Text>
              </TouchableOpacity>
              
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setEditingItem(null)}>
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: Theme.primary }]} onPress={handleEditItemSave}>
                  <Text style={styles.modalBtnTextConfirm}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: Theme.radiusLg,
    marginBottom: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  itemInfo: { flex: 1, paddingRight: 8 },
  name: { color: Theme.textPrimary, fontFamily: Fonts.extraBold, fontSize: 17, flex: 1 },
  sentName: { color: Theme.textSecondary },
  badgeRow: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  sentBadgeText: { color: Theme.success, fontSize: 11, fontFamily: Fonts.extraBold, marginLeft: 3 },
  newBadgeText: { color: Theme.primary, fontSize: 11, fontFamily: Fonts.extraBold, marginLeft: 3 },
  itemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  qty: { color: Theme.textSecondary, fontSize: 15, fontFamily: Fonts.semiBold },
  price: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 18 },
  actionRow: { flexDirection: "row", gap: 12, alignItems: 'center' },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  bottomBlock: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: Theme.bgMain,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    ...Theme.shadowLg,
  },
  subtotalCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: Theme.radiusLg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: Theme.borderOrange,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  subtotalLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  subtotalAmount: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 32,
  },
  checkoutRow: { flexDirection: "row", gap: 12 },
  checkoutBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: Theme.radiusLg,
    gap: 10,
    ...Theme.shadowMd,
  },
  checkoutBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 18 },
  modifierContainer: {
    marginTop: 8,
    marginBottom: 6,
    backgroundColor: Theme.bgMuted,
    padding: 8,
    borderRadius: 8,
  },
  modifierText: {
    color: Theme.textSecondary,
    fontSize: 13,
    fontFamily: Fonts.bold,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Theme.bgCard,
    padding: 24,
    borderRadius: Theme.radiusXl,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowLg,
  },
  modalContentEdit: {
    backgroundColor: Theme.bgCard,
    padding: 24,
    borderRadius: Theme.radiusXl,
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowLg,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontSize: 22,
    fontFamily: Fonts.black,
    marginBottom: 10,
  },
  modalDesc: {
    color: Theme.textSecondary,
    fontSize: 14,
    marginBottom: 20,
    fontFamily: Fonts.medium,
  },
  modalInput: {
    backgroundColor: Theme.bgInput,
    color: Theme.textPrimary,
    padding: 16,
    borderRadius: Theme.radiusMd,
    fontSize: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 20,
    fontFamily: Fonts.bold,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalBtnCancel: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: Theme.radiusMd,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalBtnTextCancel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  modalBtnConfirm: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Theme.radiusMd,
    backgroundColor: Theme.primary,
    ...Theme.shadowSm,
  },
  modalBtnTextConfirm: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
  },
  minus: {
    width: 44,
    height: 44,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Theme.radiusMd,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  plus: {
    width: 44,
    height: 44,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Theme.radiusMd,
    ...Theme.shadowSm,
  },
});
