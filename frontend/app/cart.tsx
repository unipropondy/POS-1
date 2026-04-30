import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";

import { API_URL } from "../constants/Config";
import { useActiveOrdersStore, voidOrderItem } from "../stores/activeOrdersStore";
import { CartItem, useCartStore } from "../stores/cartStore";
import { useOrderContextStore } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { useAuthStore } from "@/stores/authStore";
import { holdOrder } from "../stores/heldOrdersStore";
import EditDishModal from "../components/EditDishModal";
import { socket } from "../constants/socket";
import { useCompanySettingsStore } from "../stores/companySettingsStore";

const isItemSent = (item: any) => {
  return item.sent === 1 || !!item.sentDate || (item.status && item.status !== 'NEW');
};

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
    const isSent = isItemSent(item);
    const isVoided = item.status === "VOIDED";

    return (
      <TouchableOpacity 
        activeOpacity={0.7} 
        onPress={() => onEdit(item)}
        style={[styles.cartItem, isVoided && styles.voidedItem]}
      >
        <View style={styles.itemTop}>
          <View style={styles.itemImageContainer}>
            <Ionicons name="fast-food-outline" size={32} color={Theme.primary} />
          </View>
          
          <View style={styles.itemInfo}>
            <View style={styles.itemNameRow}>
              <Text style={[styles.itemName, isVoided && styles.voidedText]} numberOfLines={1}>
                {item.name}
              </Text>
              {isVoided && <View style={styles.voidTag}><Text style={styles.voidTagText}>VOID</Text></View>}
            </View>

            {(item.modifiers?.length > 0 || item.note || item.notes || item.isTakeaway) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                {(item.modifiers?.length > 0 || item.note || item.notes) && (
                  <View style={styles.customizationPill}>
                    <Text style={styles.customText} numberOfLines={1}>
                      • {item.modifiers?.map((m: any) => m.ModifierName).join(", ") || (item.note || item.notes)}
                    </Text>
                  </View>
                )}
                {item.isTakeaway && (
                  <View style={[styles.twBadge, { backgroundColor: Theme.danger + '15', borderColor: Theme.danger + '30' }]}>
                    <Text style={[styles.twBadgeText, { color: Theme.danger }]}>TW</Text>
                  </View>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {item.discount > 0 ? (
                <>
                  <Text style={[styles.itemPrice, { color: "#10b981" }, isVoided && styles.voidedText]}>
                    ${((item.price || 0) * item.qty * (1 - (item.discount || 0) / 100)).toFixed(2)}
                  </Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>-{item.discount}%</Text>
                  </View>
                  <Text style={[styles.itemPrice, { fontSize: 13, textDecorationLine: 'line-through', color: Theme.textMuted }]}>
                    ${((item.price || 0) * item.qty).toFixed(2)}
                  </Text>
                </>
              ) : (
                <Text style={[styles.itemPrice, isVoided && styles.voidedText]}>
                  ${((item.price || 0) * item.qty).toFixed(2)}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.itemControls}>
          {isVoided ? (
            <View style={styles.sentStatusPill}>
              <Ionicons name="close-circle" size={14} color={Theme.danger} />
              <Text style={[styles.sentStatusText, { color: Theme.danger }]}>
                {item.qty}x VOIDED
              </Text>
            </View>
          ) : isSent ? (
            <View style={[styles.sentStatusPill, { backgroundColor: Theme.success + '10', borderColor: Theme.success + '30', borderWidth: 1 }]}>
              <Ionicons name="checkmark-circle" size={14} color={Theme.success} />
              <Text style={[styles.sentStatusText, { color: Theme.success, fontFamily: Fonts.black }]}>
                QTY: {item.qty} (SENT)
              </Text>
            </View>
          ) : (
            <View style={styles.quantityControls}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onMinus?.(item.lineItemId); }} style={styles.qtyBtn}>
                <Feather name="minus" size={16} color="#1a1a1a" />
              </TouchableOpacity>
              <Text style={styles.qtyDisplay}>{item.qty}</Text>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onPlus?.(item.lineItemId); }} style={styles.qtyBtn}>
                <Feather name="plus" size={16} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actionButtons}>
            {isSent && !isVoided && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onVoid?.(item); }} style={styles.deleteBtnIcon}>
                <Feather name="trash-2" size={18} color={Theme.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }
);

export default function CartScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuthStore();

  const isTablet = width > 768;
  const isDesktop = width > 1200;
  const isLandscape = width > height;

  const numColumns = useMemo(() => {
    if (isDesktop) return 4;
    if (isTablet) return isLandscape ? 3 : 2;
    if (isLandscape) return 2;
    return 1;
  }, [width, height, isTablet, isDesktop, isLandscape]);

  const horizontalPadding = 20; // 10 from listContent + 10 from gridRow
  const gap = 12;
  const itemWidth = useMemo(() => {
    if (numColumns === 1) return '100%';
    const totalGaps = (numColumns - 1) * gap;
    const totalPadding = horizontalPadding * 2;
    return (width - totalPadding - totalGaps) / numColumns;
  }, [width, numColumns]);

  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [cancelPassword, setCancelPassword] = React.useState("");
  const [voidQty, setVoidQty] = React.useState("1");
  const [editingItem, setEditingItem] = React.useState<CartItem | null>(null);

  const orderContext = useOrderContextStore((state: any) => state.currentOrder);
  const carts = useCartStore((state: any) => state.carts);
  const currentContextId = useCartStore((state: any) => state.currentContextId);
  const removeFromCartGlobal = useCartStore((state: any) => state.removeFromCartGlobal);
  const addToCartGlobal = useCartStore((state: any) => state.addToCartGlobal);
  const clearCart = useCartStore((state: any) => state.clearCart);
  const pendingSync = useCartStore((state: any) => state.pendingSync);

  const settings = useCompanySettingsStore((state: any) => state.settings);
  const currencySymbol = settings?.currencySymbol || "$";
  const gstRate = (settings?.gstPercentage || 0) / 100;

  const activeOrders = useActiveOrdersStore((state: any) => state.activeOrders);
  const appendOrder = useActiveOrdersStore((state: any) => state.appendOrder);
  const markItemsSent = useActiveOrdersStore((state: any) => state.markItemsSent);
  const closeActiveOrder = useActiveOrdersStore((state: any) => state.closeActiveOrder);

  const tables = useTableStatusStore((s: any) => s.tables);
  const updateTableStatus = useTableStatusStore((s: any) => s.updateTableStatus);

  const cart = useMemo(() => (currentContextId && carts[currentContextId]) || [], [carts, currentContextId]);

  const activeOrder = useMemo(() => {
    if (!orderContext) return undefined;
    return activeOrders.find((o: any) => {
      if (orderContext.orderType === "DINE_IN") {
        return o.context.orderType === "DINE_IN" && o.context.section === orderContext.section && o.context.tableNo === orderContext.tableNo;
      }
      return o.context.orderType === "TAKEAWAY" && o.context.takeawayNo === orderContext.takeawayNo;
    });
  }, [activeOrders, orderContext]);

  const displayItems = useMemo(() => [...cart].sort((a, b) => new Date(a.DateCreated || 0).getTime() - new Date(b.DateCreated || 0).getTime()), [cart]);

  const sections = useMemo(() => {
    const newItems = displayItems.filter(i => !isItemSent(i));
    const sentItems = displayItems.filter(i => isItemSent(i));
    const chunk = (arr: any[], size: number) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) { chunks.push(arr.slice(i, i + size)); }
      return chunks;
    };
    const finalSections = [];
    if (newItems.length > 0) finalSections.push({ title: 'NEW ITEMS', count: newItems.reduce((acc, i) => acc + i.qty, 0), data: chunk(newItems, numColumns) });
    if (sentItems.length > 0) finalSections.push({ title: 'SENT ITEMS', count: sentItems.reduce((acc, i) => acc + i.qty, 0), data: chunk(sentItems, numColumns) });
    return finalSections;
  }, [displayItems, numColumns]);

  const unsentCount = useMemo(() => cart.filter((i: any) => !isItemSent(i)).length, [cart]);

  const { grossTotal, totalDiscount } = useMemo(() => {
    return displayItems.reduce(
      (acc, item) => {
        if (!item || item.status === "VOIDED") return acc;
        const baseTotal = (item.price || 0) * item.qty;
        return { grossTotal: acc.grossTotal + baseTotal, totalDiscount: acc.totalDiscount + (baseTotal * ((item.discount || 0) / 100)) };
      },
      { grossTotal: 0, totalDiscount: 0 },
    );
  }, [displayItems]);

  const subtotal = grossTotal - totalDiscount;
  const taxAmount = subtotal * gstRate;
  const payableAmount = subtotal + taxAmount;

  const currentTableData = useMemo(() => {
    if (orderContext?.orderType !== "DINE_IN") return undefined;
    return tables.find((t: any) => t.section === orderContext.section && t.tableNo === orderContext.tableNo);
  }, [orderContext, tables]);

  const currentTableStatus = useMemo(() => {
    if (!currentTableData) return "EMPTY";
    const s = currentTableData.status;
    if (typeof s === "number" || typeof (currentTableData as any).Status === "number") {
      const val = typeof s === "number" ? s : (currentTableData as any).Status;
      const statusMap: Record<number, string> = {
        0: "EMPTY", 1: "SENT", 2: "BILL_REQUESTED", 3: "HOLD", 4: "LOCKED", 5: "SENT"
      };
      return statusMap[val] || "EMPTY";
    }
    return s || "EMPTY";
  }, [currentTableData]);

  React.useEffect(() => {
    const tableId = orderContext?.tableId || currentTableData?.tableId;
    if (tableId) useCartStore.getState().fetchCartFromDB(tableId);
  }, [orderContext?.tableId, currentTableData?.tableId, currentContextId]);

  React.useEffect(() => {
    const tableId = orderContext?.tableId || currentTableData?.tableId;
    if (!tableId) return;
    const handleCartUpdate = (data: { tableId: string }) => {
      if (String(data.tableId) === String(tableId)) useCartStore.getState().fetchCartFromDB(tableId);
    };
    socket.on("cart_updated", handleCartUpdate);
    return () => { socket.off("cart_updated", handleCartUpdate); };
  }, [orderContext?.tableId, currentTableData?.tableId]);

  // ✅ Sync official Order ID from DB whenever table changes (Same as Sidebar)
  React.useEffect(() => {
    const tableId = orderContext?.tableId || currentTableData?.tableId;
    if (tableId) {
      fetch(`${API_URL}/api/tables/${tableId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.table?.CurrentOrderId) {
            useCartStore.getState().setTableOrderId(tableId, data.table.CurrentOrderId);
          }
        })
        .catch(err => console.error("Cart ID sync error:", err));
    }
  }, [orderContext?.tableId, currentTableData?.tableId]);

  const tableOrderIds = useCartStore((state: any) => state.tableOrderIds);

  if (!orderContext) return <View style={styles.center}><Text style={styles.emptyText}>No Active Order Context</Text></View>;

  const [itemToVoid, setItemToVoid] = React.useState<any>(null);

  const handleCancelOrder = async () => {
    const verifyRes = await fetch(`${API_URL}/api/auth/verify`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ password: cancelPassword }) 
    });
    const verifyData = await verifyRes.json();
    
    if (!verifyData.success) { 
      showToast({ type: "error", message: "Incorrect Password" }); 
      return; 
    }

    if (itemToVoid && orderContext?.tableId) {
      try {
        const res = await fetch(`${API_URL}/api/orders/remove-item`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: orderContext.tableId,
            itemId: itemToVoid.lineItemId,
            qtyToVoid: parseInt(voidQty) || itemToVoid.qty,
            userId: user?.userId
          })
        });

        if (res.ok) {
          // Sync stores
          if (activeOrder) voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
          await useCartStore.getState().fetchCartFromDB(orderContext.tableId);
          
          showToast({ 
            type: "success", 
            message: "Item Voided",
            subtitle: "Database and totals updated" 
          });
        }
      } catch (err) {
        console.error("Void Error:", err);
        showToast({ type: "error", message: "Failed to void item" });
      }
    } else {
      if (activeOrder) closeActiveOrder(activeOrder.orderId);
      clearCart(); 
      router.replace("/(tabs)/category");
    }
    
    setShowCancelModal(false); 
    setCancelPassword(""); 
    setVoidQty("1");
    setItemToVoid(null);
  };

  const handleHoldOrder = async () => {
    if (!orderContext || cart.length === 0) return;
    const targetOrderId = activeOrder?.orderId || "HOLD";
    const tableId = orderContext.tableId;
    if (tableId) {
      try {
        await fetch(`${API_URL}/api/orders/save-cart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableId, orderId: targetOrderId === "HOLD" ? null : targetOrderId, items: cart }) });
        const holdRes = await fetch(`${API_URL}/api/orders/hold`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableId }) });
        const holdData = await holdRes.json();
        updateTableStatus(tableId, orderContext.section || "TAKEAWAY", orderContext.orderType === "DINE_IN" ? orderContext.tableNo! : orderContext.takeawayNo!, targetOrderId, "HOLD", holdData.StartTime, undefined, payableAmount);
      } catch (err) { console.error(err); }
    }
    holdOrder(targetOrderId, cart, orderContext);
    showToast({ type: 'success', message: 'Order Held' });
    router.replace(`/(tabs)/category?section=${orderContext.section || "TAKEAWAY"}`);
  };

  const handlePlus = (lineItemId: string) => { const item = cart.find((i: any) => i.lineItemId === lineItemId); if (item) addToCartGlobal(item); };
  const handleMinus = (lineItemId: string) => removeFromCartGlobal(lineItemId);
  const handleEdit = (item: any) => setEditingItem(item);
  const handleVoidItem = (item: any) => { 
    setCancelPassword(""); 
    setVoidQty(String(item.qty || 1));
    setItemToVoid(item); 
    setShowCancelModal(true); 
  };

  const handleCheckout = async () => {
    if (!orderContext) return;
    if (orderContext.orderType === "DINE_IN") {
      const tableId = orderContext.tableId || currentTableData?.tableId;
      if (!tableId) return;

      const checkRes = await fetch(`${API_URL}/api/orders/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId }),
      });
      const checkData = await checkRes.json();
      const serverStartTime = checkData.StartTime || checkData.startTime;

      updateTableStatus(
        tableId,
        orderContext.section!,
        orderContext.tableNo!,
        activeOrder?.orderId || "PAYMENT",
        "BILL_REQUESTED",
        serverStartTime,
        undefined,
        payableAmount,
      );

      socket.emit("order_status_update", {
        orderId: activeOrder?.orderId || "PAYMENT",
        action: "CLOSE",
      });

      router.replace(`/(tabs)/category?section=${orderContext.section}`);
    } else {
      router.push("/summary");
    }
  };

  const sendOrder = async () => {
    const context = orderContext;
    if (!context || cart.length === 0) return;
    
    let targetOrderId = activeOrder?.orderId;
    
    // 🟢 OPTIMISTIC UI: Update status and notify kitchen immediately
    appendOrder(targetOrderId || "NEW", context, cart);
    markItemsSent(targetOrderId || "NEW");

    if (context.orderType === "DINE_IN") {
      const tableId = context.tableId || currentTableData?.tableId;
      if (tableId) {
        try {
          const sendRes = await (await fetch(`${API_URL}/api/orders/send`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ tableId, userId: user?.userId }) 
          })).json();

          if (sendRes.success) {
            const officialOrderId = sendRes.currentOrderId || sendRes.CurrentOrderId || targetOrderId;
            
            if (officialOrderId) {
              useCartStore.getState().setTableOrderId(tableId, officialOrderId);
              useActiveOrdersStore.getState().updateOrderId(targetOrderId || "NEW", officialOrderId);
              
              updateTableStatus(tableId, context.section!, context.tableNo!, officialOrderId, 'SENT', sendRes.StartTime, undefined, payableAmount);
              socket.emit("new_order", { orderId: officialOrderId, context, items: cart, createdAt: Date.now() });
              
              showToast({
                type: "success",
                message: "Order Sent",
                subtitle: `Kitchen notified. Order #${officialOrderId}`,
              });
              
              await useCartStore.getState().fetchCartFromDB(tableId);
            }
          }
          router.replace(`/(tabs)/category?section=${context.section}`);
        } catch (err) {
          console.error("Send Order Error:", err);
        }
      }
    } else {
      try {
        const sendRes = await (await fetch(`${API_URL}/api/orders/send`, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ orderType: "TAKEAWAY", userId: user?.userId }) 
        })).json();

        if (sendRes.success) {
          const officialOrderId = sendRes.currentOrderId || sendRes.CurrentOrderId;
          if (officialOrderId) {
            useActiveOrdersStore.getState().updateOrderId("NEW_TAKEAWAY", officialOrderId);
            updateTableStatus("", "TAKEAWAY", context.takeawayNo!, officialOrderId, 'SENT', sendRes.StartTime, undefined, payableAmount);
            socket.emit("new_order", { orderId: officialOrderId, context, items: cart, createdAt: Date.now() });
            
            showToast({
              type: "success",
              message: "Order Sent",
              subtitle: `Takeaway notified. Order #${officialOrderId}`,
            });
          }
        }
        clearCart();
        router.replace(`/(tabs)/category?section=TAKEAWAY`);
      } catch (err) {
        console.error("Takeaway Send Error:", err);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.container}>
        <LinearGradient colors={["#1a1a1a", "#2d2d2d"]} style={[styles.header, isLandscape && !isTablet && { paddingVertical: 6, paddingHorizontal: 12 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, isLandscape && !isTablet && { width: 32, height: 32 }]}><Ionicons name="chevron-back" size={isLandscape && !isTablet ? 18 : 22} color="#FFF" /></TouchableOpacity>
            <View>
              <Text style={[styles.headerTitle, isTablet && { fontSize: 24 }, isLandscape && !isTablet && { fontSize: 18 }]}>{orderContext.orderType === "DINE_IN" ? `Table ${orderContext.tableNo}` : `Takeaway #${orderContext.takeawayNo}`}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.headerSub, isLandscape && !isTablet && { fontSize: 10 }]}>{orderContext.orderType === "DINE_IN" ? orderContext.section?.replace("_", "-") : "Standard Queue"}</Text>
                {orderContext.tableId && tableOrderIds[orderContext.tableId] && (
                  <Text style={[styles.headerSub, { color: '#fbbf24' }, isLandscape && !isTablet && { fontSize: 10 }]}>
                    • ID: {tableOrderIds[orderContext.tableId]}
                  </Text>
                )}
                {pendingSync && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ActivityIndicator size="small" color="#fbbf24" />
                    <Text style={{ fontSize: 10, color: '#fbbf24', fontFamily: Fonts.bold }}>Syncing...</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {unsentCount > 0 && (
            <TouchableOpacity style={[styles.clearBtn, isLandscape && !isTablet && { padding: 6 }]} onPress={() => clearCart()}><Text style={[styles.clearText, isLandscape && !isTablet && { fontSize: 10 }]}>Clear Unsent</Text></TouchableOpacity>
          )}
        </LinearGradient>

        <SectionList
          sections={sections}
          keyExtractor={(item, index) => (item[0] as any)?.lineItemId || index.toString()}
          contentContainerStyle={[styles.listContent, { paddingBottom: isLandscape && !isTablet ? 140 : 220 }]}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title, count } }) => (
            <View style={styles.batchHeader}><Text style={styles.batchHeaderText}>{title} ({count})</Text><View style={styles.batchHeaderLine} /></View>
          )}
          renderItem={({ item: rowItems }) => (
            <View style={styles.gridRow}>
              {rowItems.map((item: any) => (
                <View key={item.lineItemId} style={{ width: itemWidth }}>
                  <CartItemCard item={item} onPlus={handlePlus} onMinus={handleMinus} onEdit={handleEdit} onVoid={handleVoidItem} />
                </View>
              ))}
            </View>
          )}
        />

        <View style={[styles.footer, isLandscape && !isTablet && styles.footerCompact]}>
          <View style={[styles.footerMain, isLandscape && !isTablet && styles.footerMainCompact]}>
            <View style={isLandscape && !isTablet ? { flexDirection: 'row', alignItems: 'baseline', gap: 8 } : {}}>
              <Text style={styles.totalLabel}>Total Payable</Text>
              <Text style={[styles.totalValue, isLandscape && !isTablet && { fontSize: 24 }]}>{currencySymbol}{payableAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.footerActions}>
              {unsentCount > 0 ? (
                <>
                  <TouchableOpacity onPress={handleHoldOrder} style={[styles.holdBtn, isLandscape && !isTablet && { paddingVertical: 8 }]}><Ionicons name="pause" size={16} color="#FFF" /><Text style={styles.btnText}>HOLD</Text></TouchableOpacity>
                  <TouchableOpacity onPress={sendOrder} style={styles.sendBtn}><LinearGradient colors={["#10b981", "#059669"]} style={[styles.btnGradient, isLandscape && !isTablet && { paddingVertical: 8 }]}><Ionicons name="send" size={18} color="#FFF" /><Text style={styles.btnText}>SEND ORDER</Text></LinearGradient></TouchableOpacity>
                </>
              ) : currentTableStatus === "SENT" ? (
                <TouchableOpacity onPress={handleCheckout} style={styles.sendBtn}><LinearGradient colors={["#f59e0b", "#f97316"]} style={[styles.btnGradient, isLandscape && !isTablet && { paddingVertical: 8 }]}><Ionicons name="receipt" size={18} color="#FFF" /><Text style={styles.btnText}>CHECKOUT</Text></LinearGradient></TouchableOpacity>
              ) : currentTableStatus === "HOLD" || currentTableStatus === "BILL_REQUESTED" ? (
                <TouchableOpacity onPress={() => router.push("/summary")} style={styles.sendBtn}><LinearGradient colors={[Theme.primary, Theme.primary]} style={[styles.btnGradient, isLandscape && !isTablet && { paddingVertical: 8 }]}><Ionicons name="card-outline" size={18} color="#FFF" /><Text style={styles.btnText}>PROCEED TO PAY</Text></LinearGradient></TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => router.push("/summary")} style={styles.sendBtn}><LinearGradient colors={["#f59e0b", "#f97316"]} style={[styles.btnGradient, isLandscape && !isTablet && { paddingVertical: 8 }]}><Ionicons name="receipt" size={18} color="#FFF" /><Text style={styles.btnText}>CHECKOUT</Text></LinearGradient></TouchableOpacity>
              )}
            </View>
          </View>
          <View style={[styles.breakdown, isLandscape && !isTablet && { paddingTop: 8, marginTop: 8 }]}>
            <Text style={styles.breakdownText}>Gross: {currencySymbol}{grossTotal.toFixed(2)}</Text>
            {totalDiscount > 0 && <Text style={[styles.breakdownText, { color: "#10b981" }]}> • Disc: -{currencySymbol}{totalDiscount.toFixed(2)}</Text>}
            {taxAmount > 0 && <Text style={styles.breakdownText}> • Tax: {currencySymbol}{taxAmount.toFixed(2)}</Text>}
          </View>
        </View>
      </View>

      <Modal transparent visible={showCancelModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{itemToVoid ? "Void Item?" : "Cancel Order?"}</Text>
            <Text style={{ fontSize: 13, color: Theme.textMuted, marginBottom: 12 }}>
              This action requires administrator privileges.
            </Text>

            {itemToVoid && itemToVoid.qty > 1 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: Theme.textSecondary, marginBottom: 6 }}>
                  Qty to Void (max {itemToVoid.qty}):
                </Text>
                <TextInput 
                  style={[styles.modalInput, { marginBottom: 0 }]} 
                  keyboardType="numeric"
                  value={voidQty} 
                  onChangeText={setVoidQty}
                  placeholder="Quantity" 
                />
              </View>
            )}

            <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: Theme.textSecondary, marginBottom: 6 }}>
              Admin Password:
            </Text>
            <TextInput 
              style={styles.modalInput} 
              secureTextEntry 
              autoFocus 
              value={cancelPassword} 
              onChangeText={setCancelPassword} 
              placeholder="Admin Password" 
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCancelModal(false)} style={[styles.modalBtn, { backgroundColor: '#f3f4f6' }]}>
                <Text style={[styles.modalBtnText, { color: Theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCancelOrder} style={[styles.modalBtn, { backgroundColor: Theme.danger }]}>
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <EditDishModal visible={!!editingItem} onClose={() => setEditingItem(null)} item={editingItem} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fdf8f3" },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontFamily: Fonts.black, color: "#FFF" },
  headerSub: { fontSize: 12, fontFamily: Fonts.bold, color: "rgba(255,255,255,0.7)" },
  clearBtn: { padding: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)" },
  clearText: { fontSize: 12, fontFamily: Fonts.bold, color: "#FFF" },
  listContent: { paddingHorizontal: 10, paddingBottom: 220 },
  gridRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 10, marginBottom: 12 },
  batchHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, backgroundColor: "#fdf8f3" },
  batchHeaderText: { fontSize: 11, fontFamily: Fonts.black, color: Theme.textMuted, letterSpacing: 1.2 },
  batchHeaderLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb", opacity: 0.5 },
  footer: { backgroundColor: "#FFF", padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, ...Theme.shadowLg },
  footerCompact: { padding: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  footerMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  footerMainCompact: { marginBottom: 4 },
  totalLabel: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted, textTransform: 'uppercase' },
  totalValue: { fontSize: 32, fontFamily: Fonts.black, color: "#1a1a1a" },
  footerActions: { flexDirection: 'row', gap: 12 },
  holdBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, gap: 8, backgroundColor: '#2563eb' },
  sendBtn: { borderRadius: 12, overflow: 'hidden' },
  btnGradient: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  btnText: { fontSize: 15, fontFamily: Fonts.black, color: "#FFF" },
  breakdown: { flexDirection: 'row', justifyContent: 'center', gap: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 12 },
  breakdownText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted },
  cartItem: { backgroundColor: "#FFF", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#f3f4f6", ...Theme.shadowSm },
  voidedItem: { opacity: 0.6 },
  itemTop: { flexDirection: 'row', gap: 12 },
  itemImageContainer: { width: 60, height: 60, borderRadius: 12, backgroundColor: "#fff7ed", justifyContent: "center", alignItems: "center" },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontFamily: Fonts.black, color: "#1a1a1a" },
  voidedText: { textDecorationLine: 'line-through' },
  voidTag: { backgroundColor: Theme.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  voidTagText: { fontSize: 10, fontFamily: Fonts.black, color: "#FFF" },
  customizationPill: { backgroundColor: "#fff7ed", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 2, alignSelf: 'flex-start' },
  customText: { fontSize: 11, fontFamily: Fonts.bold, color: "#92400e" },
  twBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginTop: 2 },
  twBadgeText: { fontSize: 10, fontFamily: Fonts.black },
  discountBadge: { backgroundColor: "#10b98120", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: "#10b98140" },
  discountBadgeText: { fontSize: 10, fontFamily: Fonts.black, color: "#10b981" },
  itemPrice: { fontSize: 18, fontFamily: Fonts.black, color: "#f59e0b" },
  itemControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: "#f9fafb", padding: 4, borderRadius: 12 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", ...Theme.shadowSm },
  qtyDisplay: { fontSize: 16, fontFamily: Fonts.black, color: "#1a1a1a", minWidth: 24, textAlign: 'center' },
  sentStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f0fdf4" },
  sentStatusText: { fontSize: 12, fontFamily: Fonts.bold, color: "#16a34a" },
  actionButtons: { flexDirection: 'row', gap: 8 },
  deleteBtnIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#fee2e2", justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: '90%', maxWidth: 400, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontFamily: Fonts.black, marginBottom: 8 },
  modalInput: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, fontSize: 18, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  modalBtnText: { fontSize: 16, fontFamily: Fonts.bold },
  emptyText: { fontSize: 16, color: Theme.textMuted },
});
