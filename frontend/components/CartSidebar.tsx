import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "./Toast";
import EditDishModal from "./EditDishModal";

import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";
import { CartItem, useCartStore } from "../stores/cartStore";
import { holdOrder } from "../stores/heldOrdersStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { getNextOrderId } from "../stores/orderIdStore";
import { useTableStatusStore } from "../stores/tableStatusStore";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CartSidebarProps {
  width?: DimensionValue;
}

export default function CartSidebar({ width = 400 }: CartSidebarProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = screenWidth < 600;

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
  const clearCart = useCartStore((state) => state.clearCart);
  const updateCartItemQty = useCartStore((state) => state.updateCartItemQty);

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

  const currentTableStatus = tableData?.status || "EMPTY";

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

  const displayItems = useMemo(() => {
    const sentItems: (OrderItem | CartItem)[] = activeOrder?.items || [];
    return [...sentItems, ...cart];
  }, [activeOrder, cart]);

  const subtotal = useMemo(() => {
    return displayItems.reduce(
      (sum, item) => {
        const isVoided = "status" in item && item.status === "VOIDED";
        if (isVoided) return sum;
        return sum + (item.price || 0) * item.qty;
      },
      0,
    );
  }, [displayItems]);

  const taxRate = 0; // Tax removed as per user request
  const taxAmount = subtotal * taxRate;
  const payableAmount = subtotal + taxAmount;

  if (!orderContext) {
    return (
      <View style={[styles.container, { width }]}>
        <View style={styles.emptySurface}>
          <Ionicons name="cart-outline" size={64} color={Theme.border} />
          <Text style={styles.emptyText}>No Active Order</Text>
        </View>
      </View>
    );
  }

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItemId(expandedItemId === id ? null : id);
  };

  const handleCheckout = () => {
    if (!orderContext) return;
    if (orderContext.orderType === "DINE_IN") {
      updateTableStatus(
        orderContext.section!,
        orderContext.tableNo!,
        activeOrder?.orderId || "PAYMENT",
        "BILL_REQUESTED",
        undefined,
        undefined,
        payableAmount,
      );
      router.replace(`/(tabs)/category?section=${orderContext.section}`);
    } else {
      router.push("/summary");
    }
  };

  const handleSendOrder = () => {
    if (cart.length === 0) return;
    let targetOrderId = activeOrder?.orderId || getNextOrderId();
    appendOrder(targetOrderId, orderContext, cart);
    markItemsSent(targetOrderId);
    if (orderContext.orderType === "DINE_IN") {
      updateTableStatus(
        orderContext.section!,
        orderContext.tableNo!,
        targetOrderId,
        "SENT",
        undefined,
        undefined,
        payableAmount,
      );
      router.replace(`/(tabs)/category?section=${orderContext.section}`);
    } else {
      updateTableStatus(
        "TAKEAWAY",
        orderContext.takeawayNo!,
        targetOrderId,
        "SENT",
        undefined,
        undefined,
        payableAmount,
      );
      router.replace(`/(tabs)/category?section=TAKEAWAY`);
    }
    clearCart();
    showToast({
      type: "success",
      message: "Order Sent",
      subtitle: "Kitchen has been notified.",
    });
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isSent = "status" in item && item.status === "SENT";
    const isVoided = "status" in item && item.status === "VOIDED";
    const isExpanded = expandedItemId === item.lineItemId;

    return (
      <View style={[styles.itemContainer, isExpanded && styles.itemExpanded]}>
        {/* Status indicator bar (Left) */}
        <View
          style={[
            styles.statusBar,
            { backgroundColor: isSent ? "#22C55E" : "#3B82F6" },
          ]}
        />

        <Pressable
          style={styles.itemHeader}
          onPress={() => {
            if (!isSent) {
              setItemToEdit(item);
              setIsEditModalVisible(true);
            }
          }}
        >
          <View style={styles.itemIndexWrap}>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={Theme.textMuted}
              style={styles.chevron}
            />
            <Text style={styles.itemIndex}>{index + 1}</Text>
          </View>

          <View style={styles.itemInfo}>
            <View style={styles.itemMainRow}>
              <Text
                style={[
                  styles.itemName,
                  (isSent || isVoided) && styles.textMuted,
                  isVoided && styles.strikeThrough,
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.isTakeaway && (
                <View style={styles.twBadge}>
                  <Text style={styles.twBadgeText}>TW</Text>
                </View>
              )}
              <View
                style={[
                  styles.statusTag,
                  { backgroundColor: isSent ? "#22C55E25" : "#3B82F625" },
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    {
                      color: isVoided
                        ? Theme.danger
                        : isSent
                        ? "#15803D"
                        : "#1D4ED8",
                    },
                  ]}
                >
                  {isVoided ? "❌ VOIDED" : isSent ? "✅ SENT" : "🔵 NEW"}
                </Text>
              </View>
            </View>

            {/* MODIFIERS LIST - VERTICAL STACK */}
            {item.modifiers && item.modifiers.length > 0 && (
              <View style={styles.modifierListSmall}>
                {item.modifiers.map((m: any, idx: number) => (
                  <Text
                    key={`${m.ModifierId}-${idx}`}
                    style={styles.modifierTextSmall}
                  >
                    • {m.ModifierName}
                    {m.Price > 0 ? ` (+$${m.Price.toFixed(2)})` : ""}
                  </Text>
                ))}
              </View>
            )}

            {/* INLINE QTY CONTROL ON MAIN ROW */}
            <View style={styles.inlineControls}>
              {isSent || isVoided ? (
                <Text style={styles.sentQtyText}>QTY: {item.qty}</Text>
              ) : (
                <View style={styles.qtyControlSmall}>
                  <TouchableOpacity
                    style={styles.qtyBtnSmall}
                    onPress={(e) => {
                      e.stopPropagation();
                      updateCartItemQty(item.lineItemId, item.qty - 1);
                    }}
                  >
                    <Ionicons
                      name="remove"
                      size={14}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.qtyTextSmall}>{item.qty}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtnSmall}
                    onPress={(e) => {
                      e.stopPropagation();
                      updateCartItemQty(item.lineItemId, item.qty + 1);
                    }}
                  >
                    <Ionicons name="add" size={14} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.priceContainer}>
                <Text
                  style={[
                    styles.itemPrice,
                    isVoided && styles.strikeThrough,
                    isVoided && styles.textMuted,
                  ]}
                >
                  ${((item.price || 0) * item.qty).toFixed(2)}
                </Text>

                {isSent && !isVoided ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      setItemToVoid(item);
                      setShowCancelModal(true);
                    }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={Theme.danger}
                    />
                  </TouchableOpacity>
                ) : !isSent && !isVoided ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      removeFromCartGlobal(item.lineItemId);
                      showToast({
                        type: "info",
                        message: "Removed",
                        subtitle: `${item.name} deleted`,
                      });
                    }}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color={Theme.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>

        {/* LEGACY INLINE DISCOUNT REMOVED AS PER REQUEST */}
      </View>
    );
  };

  return (
    <View style={[styles.container, { width }]}>
      {/* HEADER ACTIONS */}
      <View style={styles.header}>
        <View style={styles.tableIdentity}>
          <Text style={styles.tableIdentityText}>
            {orderContext.orderType === "TAKEAWAY"
              ? `TAKEAWAY #${orderContext.takeawayNo}`
              : `${orderContext.section} - T${orderContext.tableNo}`}
          </Text>
        </View>
      </View>

      {/* ITEMS LIST */}
      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.lineItemId}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FOOTER AREA */}
      <View style={styles.footer}>
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.payableLabel}>Subtotal</Text>
            <Text style={styles.payableValue}>${subtotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {cart.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.holdBtn}
                onPress={() => {
                  let targetOrderId = activeOrder?.orderId || getNextOrderId();
                  updateTableStatus(
                    orderContext.section!,
                    orderContext.tableNo!,
                    targetOrderId,
                    "HOLD",
                  );
                  holdOrder(targetOrderId, cart, orderContext);
                  clearCart();
                  router.replace(
                    `/(tabs)/category?section=${orderContext.section}`,
                  );
                }}
              >
                <Ionicons name="pause-circle-outline" size={20} color="#fff" />
                {!isPhone && <Text style={styles.btnText}>Hold Cart</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.proceedBtn, { backgroundColor: Theme.success }]}
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
          ) : currentTableStatus === "BILL_REQUESTED" ? (
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

      {/* CANCEL PASSWORD MODAL - Stay for admin safety */}
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
                onPress={() => {
                  if (cancelPassword === "786") {
                    if (itemToVoid && activeOrder) {
                      voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
                      setItemToVoid(null);
                      setCancelPassword("");
                      setShowCancelModal(false);
                      showToast({
                        type: "success",
                        message: "Item Voided",
                        subtitle: "Sent items updated",
                      });
                    } else {
                      clearCart();
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
    borderLeftWidth: 1,
    borderLeftColor: Theme.border,
    padding: 16,
  },
  emptySurface: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.5,
  },
  emptyText: {
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
    marginTop: 16,
    fontSize: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  tableIdentity: { flex: 1 },
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
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    overflow: "hidden",
    flexDirection: "row",
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
  statusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusTagText: { fontSize: 8, fontFamily: Fonts.extraBold },
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
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: Theme.textMuted,
    paddingLeft: 10,
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
    backgroundColor: "#F97316",
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
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
  },
  twBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.danger,
  },
  strikeThrough: {
    textDecorationLine: "line-through",
  },
});
