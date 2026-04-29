import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState, useEffect } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  TextInput,
  View,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Alert,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";
import { API_URL } from "@/constants/Config";

import DiscountModal from "../components/DiscountModal";
import GstSettingsModal from "../components/GstSettingsModal";
import { findActiveOrder, useActiveOrdersStore, voidOrderItem } from "../stores/activeOrdersStore";
import { useCartStore } from "../stores/cartStore";
import { useCompanySettingsStore } from "../stores/companySettingsStore";
import { getOrderContext, setOrderContext } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import UniversalPrinter from "../components/UniversalPrinter";

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

export default function SummaryScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const context = getOrderContext();
  const activeOrder = context ? findActiveOrder(context) : undefined;

  const [showDiscount, setShowDiscount] = useState(false);
  const [showGstModal, setShowGstModal] = useState(false); 
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasons, setCancelReasons] = useState<Array<{ CRCode: string; CRName: string }>>([]);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string | null>(null);
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [itemToVoid, setItemToVoid] = useState<any | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidPassword, setVoidPassword] = useState("");

  const [showServerModal, setShowServerModal] = useState(false);
  const [servers, setServers] = useState<Array<{ SER_ID: number; SER_NAME: string }>>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [showBillOptions, setShowBillOptions] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState<Record<string, number>>({});
  const [allDishes, setAllDishes] = useState<any[]>([]);
  const [searchDishText, setSearchDishText] = useState("");
  const [extraSplitItems, setExtraSplitItems] = useState<any[]>([]);

  const settings = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settings.currencySymbol || "$";
  const gstRate = (settings.gstPercentage || 0) / 100;

  const carts = useCartStore((s: any) => s.carts);
  const currentContextId = useCartStore((s: any) => s.currentContextId);
  const tableOrderIds = useCartStore((s: any) => s.tableOrderIds);

  const cart = useMemo(() => {
    return (currentContextId && carts[currentContextId]) || [];
  }, [carts, currentContextId]);

  const displayOrderId = useMemo(() => {
    if (context?.tableId) {
      return tableOrderIds[context.tableId] || activeOrder?.orderId;
    }
    return activeOrder?.orderId;
  }, [context, tableOrderIds, activeOrder]);

  const hasHydrated = useActiveOrdersStore((s: any) => s._hasHydrated);

  const [orderLoadTimeout, setOrderLoadTimeout] = useState(true);

  useEffect(() => {
    // Only show loading briefly — don't block forever
    const t = setTimeout(() => setOrderLoadTimeout(false), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // 1. Sync official Order ID from DB
    if (context?.tableId) {
      fetch(`${API_URL}/api/tables/${context.tableId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.table?.CurrentOrderId) {
            useCartStore.getState().setTableOrderId(context.tableId!, data.table.CurrentOrderId);
          }
        })
        .catch(err => console.error("Summary ID sync error:", err));
    }

    // 2. If activeOrder is missing, try fetching from kitchen (but don't block on it)
    if (!activeOrder) {
      console.log("🔍 [Summary] Active order missing, fetching from kitchen...");
      useActiveOrdersStore.getState().fetchActiveKitchenOrders();
    }

    // 3. Fetch servers
    fetchServers();

    // 4. Fetch all dishes for split search
    fetch(`${API_URL}/api/menu/dishes/all`)
      .then(res => res.json())
      .then(data => setAllDishes(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching all dishes:", err));
  }, [activeOrder]);

  const fetchServers = async () => {
    try {
      setLoadingServers(true);
      const res = await fetch(`${API_URL}/api/servers`);
      const data = await res.json();
      setServers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching servers:", err);
    } finally {
      setLoadingServers(false);
    }
  };

  const discountInfo = useCartStore((s: any) => {
    const id = s.currentContextId;
    return id ? s.discounts[id] : null;
  });

  const applyDiscount = useCartStore((s: any) => s.applyDiscount);
  const clearCart = useCartStore((s: any) => s.clearCart);
  const updateOrderDiscount = useActiveOrdersStore((s: any) => s.updateOrderDiscount);
  const closeActiveOrder = useActiveOrdersStore((s: any) => s.closeActiveOrder);
  const updateTableStatus = useTableStatusStore((s: any) => s.updateTableStatus);

  const handleFOC = () => {
    const discountData = {
      applied: true,
      type: "percentage" as const,
      value: 100,
    };
    applyDiscount(discountData);

    const currentContext = getOrderContext();
    if (currentContext) {
      updateOrderDiscount(currentContext, discountData);
    }
  };

  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const isLandscape = SCREEN_W > SCREEN_H;
  const isTablet = Math.min(SCREEN_W, SCREEN_H) >= 500;
  const isPhone = !isTablet;

  const fetchCancelReasons = async () => {
    try {
      setLoadingReasons(true);
      const res = await fetch(`${API_URL}/api/admin/cancel-reasons`);
      const data = await res.json();
      setCancelReasons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching cancel reasons:", err);
      showToast({ type: "error", message: "Failed to load cancellation reasons" });
    } finally {
      setLoadingReasons(false);
    }
  };

  const handleCancelOrder = async () => {
    // Securely verify password with backend - checks for any Admin/Manager password
    const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        password: cancelPassword 
      })
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      showToast({ type: "error", message: "Incorrect Password", subtitle: "Admin password required to cancel order" });
      return;
    }

    const reason = customCancelReason.trim() || selectedCancelReason || "No reason provided";

    setIsCancellingOrder(true);

    try {
      if (context && activeOrder) {
        closeActiveOrder(activeOrder.orderId);
        clearCart();
        if (context.orderType === "DINE_IN" && context.section && context.tableNo) {
          updateTableStatus(context.tableId || "", context.section, context.tableNo, "", "EMPTY");
          
          if (context.tableId) {
            fetch(`${API_URL}/api/tables/${context.tableId}/status`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: 0 }),
            });
          }
        }
      }

      showToast({
        type: "success",
        message: "Order Cancelled",
        subtitle: `Reason: ${reason}`,
      });

      setShowCancelModal(false);
      setSelectedCancelReason(null);
      setCustomCancelReason("");
      setCancelPassword("");

      setTimeout(() => {
        router.replace("/(tabs)/category");
      }, 500);
    } catch (error) {
      console.error("Cancel error:", error);
      showToast({ type: "error", message: "Error cancelling order" });
    } finally {
      setIsCancellingOrder(false);
    }
  };


  const handleSplitBill = () => {
    // Reset split quantities to 0 for all items in cart
    const initialSplit: Record<string, number> = {};
    cart.forEach((item: any) => {
      initialSplit[item.lineItemId] = 0;
    });
    setSplitQuantities(initialSplit);
    setExtraSplitItems([]);
    setSearchDishText("");
    setShowSplitModal(true);
    setShowBillOptions(false);
  };

  const handleMergeBill = () => {
    setShowMergeModal(true);
    setShowBillOptions(false);
  };

  const handleManualBill = () => {
    setOrderContext({
      orderType: "MANUAL",
      takeawayNo: "M-" + Date.now().toString().slice(-4),
    });
    setShowBillOptions(false);
    router.push("/menu" as any);
  };

  const totalItems = useMemo(
    () =>
      cart.reduce((sum: number, item: any) => {
        const isVoided = "status" in item && (item as any).status === "VOIDED";
        if (isVoided) return sum;
        return sum + item.qty;
      }, 0),
    [cart],
  );

  const subtotal = useMemo(() => {
    return cart.reduce((sum: number, item: any) => {
      const isVoided = (item as any).status === "VOIDED";
      if (isVoided) return sum;
      return sum + (item.price || 0) * item.qty;
    }, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (!discountInfo?.applied) return 0;
    if (discountInfo.type === "percentage") return (subtotal * discountInfo.value) / 100;
    return discountInfo.value;
  }, [discountInfo, subtotal]);

  const discSubtotal = Math.max(0, subtotal - discountAmount);
  
  const gstAmount = subtotal * gstRate;
  const grandTotal = subtotal - discountAmount + gstAmount;
  const displaySubtotal = subtotal;

  if (!context) return null;

  if (!activeOrder && orderLoadTimeout) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Theme.bgMain }}>
        <ActivityIndicator color={Theme.primary} />
        <Text style={{ color: Theme.textSecondary, marginTop: 10 }}>Loading order...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
      <View style={styles.container}>
        {/* HEADER */}
        <View style={[styles.headerBar, isPhone && isLandscape && { height: 50, marginBottom: 5 }]}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.iconBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/category')}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </Pressable>

            <View style={styles.headerTitleContainer}>
              <Text style={[styles.title, !isLandscape && { fontSize: 18 }]} numberOfLines={1}>Order #{displayOrderId || activeOrder?.orderId}</Text>
              {context.orderType === "DINE_IN" ? (
                <Text style={[styles.contextText, !isLandscape && { fontSize: 11 }]} numberOfLines={1}>
                  Dine-In • {formatSection(context.section || "")} • Table {context.tableNo}
                </Text>
              ) : (
                <Text style={[styles.contextText, !isLandscape && { fontSize: 11 }]} numberOfLines={1}>
                  Takeaway • {context.takeawayNo}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.headerRight}>


            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.infoBg, borderColor: Theme.infoBorder, borderWidth: 1 }, !isTablet && isLandscape && { height: 32, paddingHorizontal: 8 }]}
              onPress={() => router.push("/kds")}
            >
              <Ionicons name="tv-outline" size={!isTablet && isLandscape ? 16 : 18} color={Theme.info} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.info }, !isTablet && isLandscape && { fontSize: 10 }]}>KDS</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder, borderWidth: 1 }, !isTablet && isLandscape && { height: 32, paddingHorizontal: 8 }]}
              onPress={() => setShowDiscount(true)}
            >
              <Ionicons name="pricetag-outline" size={!isTablet && isLandscape ? 16 : 18} color={Theme.primary} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.primary }, !isTablet && isLandscape && { fontSize: 10 }]}>Discount</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.warningBg, borderColor: Theme.warningBorder, borderWidth: 1 }, !isTablet && isLandscape && { height: 32, paddingHorizontal: 8 }]}
              onPress={handleFOC}
            >
              <Ionicons name="gift-outline" size={!isTablet && isLandscape ? 16 : 18} color={Theme.warning} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.warning }, !isTablet && isLandscape && { fontSize: 10 }]}>FOC</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* MAIN CONTENT AREA */}
        <View style={[styles.mainContent, isLandscape && styles.mainContentLandscape]}>
          {/* LIST */}
          <View style={[styles.listContainer, isLandscape && styles.listContainerLandscape]}>
            <FlatList
              data={cart}
              showsVerticalScrollIndicator={false}
              keyExtractor={(item, index) => item.id + index}
              contentContainerStyle={{ paddingBottom: 20 }}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              renderItem={({ item }: { item: any }) => (
                <View style={styles.row}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyBadgeText}>{item.qty}</Text>
                  </View>

                  <View style={styles.rowContent}>
                    <Text
                      style={[
                        styles.name,
                        (item as any).status === "VOIDED" && styles.textVoided,
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                      {(item as any).status === "VOIDED" && " (VOIDED)"}
                    </Text>
                    {(item.spicy && item.spicy !== "Medium") ||
                    (item.oil && item.oil !== "Normal") ||
                    (item.salt && item.salt !== "Normal") ||
                    (item.sugar && item.sugar !== "Normal") ||
                    item.note ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {[
                          item.spicy && item.spicy !== "Medium" ? `🌶 ${item.spicy}` : "",
                          item.oil && item.oil !== "Normal" ? `Oil: ${item.oil}` : "",
                          item.salt && item.salt !== "Normal" ? `Salt: ${item.salt}` : "",
                          item.sugar && item.sugar !== "Normal" ? `Sugar: ${item.sugar}` : "",
                          item.note ? `📝 ${item.note}` : "",
                        ].filter(Boolean).join("  ·  ")}
                      </Text>
                    ) : null}
                    {item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <Text style={styles.sub} numberOfLines={1}>
                        {item.modifiers.map((m: any) => `+ ${m.ModifierName}`).join("  ·  ")}
                      </Text>
                    )}
                  </View>

                  <View style={styles.priceBlock}>
                    <Text
                      style={[
                        styles.price,
                        (item as any).status === "VOIDED" && styles.textVoided,
                      ]}
                    >
                      {currencySymbol}{((item.price || 0) * item.qty).toFixed(2)}
                    </Text>
                  </View>

                  {/* BIN BUTTON (VOID) */}
                  {((item as any).status !== "VOIDED") && (
                    <TouchableOpacity 
                      style={styles.itemTrashBtn}
                      onPress={() => {
                        setItemToVoid(item);
                        setVoidPassword("");
                        setShowVoidModal(true);
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          </View>

          {/* TOTALS RECEIPT CARD */}
          <View style={[styles.receiptContainer, isLandscape && styles.receiptContainerLandscape, isPhone && isLandscape && { width: 320 }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isLandscape && !isTablet && { paddingBottom: 20 }}>
              <View style={[styles.receiptCard, isLandscape && !isTablet && { padding: 16 }]}>
                <View style={[styles.receiptHeader, isLandscape && !isTablet && { marginBottom: 10 }]}>
                  <View style={{ backgroundColor: Theme.primaryLight, padding: 5, borderRadius: 8 }}>
                    <Ionicons name="receipt" size={24} color={Theme.primary} />
                  </View>
                  <Text style={styles.receiptHeaderText}>Bill Summary</Text>
                  <View style={styles.itemCountChip}>
                    <Text style={styles.itemCountChipText}>{totalItems} items</Text>
                  </View>
                </View>


                <View style={[styles.receiptDivider, isLandscape && !isTablet && { marginBottom: 10 }]} />

                <View style={[styles.summaryRow, isLandscape && !isTablet && { marginBottom: 8 }]}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{currencySymbol}{displaySubtotal.toFixed(2)}</Text>
                </View>

                {discountInfo?.applied && (
                  <View style={[styles.summaryRow, isLandscape && !isTablet && { marginBottom: 8 }]}>
                    <Text style={[styles.summaryLabel, { color: Theme.danger }]}>
                      {discountInfo.label || "Discount"}
                    </Text>
                    <Text style={[styles.summaryValue, { color: Theme.danger }]}>-{currencySymbol}{discountAmount.toFixed(2)}</Text>
                  </View>
                )}

                {gstRate > 0 && (
                  <View style={[styles.summaryRow, isLandscape && !isTablet && { marginBottom: 8 }]}>
                    <Text style={styles.summaryLabel}>GST ({settings.gstPercentage}%)</Text>
                    <Text style={styles.summaryValue}>{currencySymbol}{gstAmount.toFixed(2)}</Text>
                  </View>
                )}

                <TouchableOpacity 
                   style={styles.gstBtn} 
                   onPress={() => setShowGstModal(true)}
                >
                   <Ionicons name="options-outline" size={14} color={Theme.primary} />
                   <Text style={styles.gstBtnText}>GST Alter</Text>
                </TouchableOpacity>

                <View style={[styles.dashedDivider, isLandscape && !isTablet && { marginVertical: 10 }]}>
                  <View style={[styles.dashLine, { borderColor: Theme.border }]} />
                </View>

                {/* SERVER SELECTION & BILL BUTTON */}
                <View style={{ marginBottom: 15 }}>
                  <Text style={[styles.grandLabel, { fontSize: 11, marginBottom: 8, opacity: 0.7 }]}>Assigned Waiter</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity 
                      style={[
                        styles.serverSelector,
                        { flex: 1 },
                        (!context.serverId && settings.waiterRequired) && { borderColor: Theme.danger, borderStyle: 'dashed' }
                      ]}
                      onPress={() => setShowServerModal(true)}
                    >
                      <View style={styles.serverInfoRow}>
                        <View style={[styles.serverIcon, { backgroundColor: context.serverId ? Theme.primaryLight : (settings.waiterRequired ? Theme.dangerBg : Theme.bgMuted) }]}>
                          <Ionicons name="person" size={16} color={context.serverId ? Theme.primary : (settings.waiterRequired ? Theme.danger : Theme.textMuted)} />
                        </View>
                        <Text style={[styles.serverNameText, (!context.serverId && settings.waiterRequired) && { color: Theme.danger }]} numberOfLines={1}>
                          {context.serverName || (settings.waiterRequired ? "Select Waiter" : "Select Waiter (Optional)")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Theme.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.billBtn}
                      onPress={() => setShowBillOptions(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="receipt-outline" size={20} color={Theme.primary} />
                      <Text style={styles.billBtnText}>Bill</Text>
                    </TouchableOpacity>
                  </View>
                  {!context.serverId && settings.waiterRequired && (
                    <Text style={{ color: Theme.danger, fontSize: 10, marginTop: 4, fontFamily: Fonts.bold }}>
                      * Required to proceed
                    </Text>
                  )}
                </View>

                <View style={[styles.grandRow, isLandscape && !isTablet && { marginBottom: 15 }]}>
                  <View>
                    <Text style={[styles.grandLabel, isLandscape && !isTablet && { fontSize: 12 }]}>Total Amount</Text>
                    <Text style={styles.grandSub}>Including all taxes</Text>
                  </View>
                  <Text style={[styles.grandValue, isLandscape && !isTablet && { fontSize: 24 }]}>{currencySymbol}{grandTotal.toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.proceedBtn, 
                    isLandscape && !isTablet && { height: 48, borderRadius: 12 },
                    (!context.serverId && settings.waiterRequired) && { opacity: 0.5, backgroundColor: Theme.textMuted }
                  ]}
                  onPress={() => {
                    if (!context.serverId && settings.waiterRequired) {
                      showToast({ type: "warning", message: "Select Waiter", subtitle: "Please assign a waiter before proceeding" });
                      setShowServerModal(true);
                      return;
                    }
                    router.push("/payment");
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="card-outline" size={22} color="#fff" />
                  <Text style={[styles.proceedText, isLandscape && !isTablet && { fontSize: 16 }]}>Proceed to Payment</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </View>


      <DiscountModal
        visible={showDiscount}
        onClose={() => setShowDiscount(false)}
        currentTotal={subtotal}
      />

      {/* CANCEL MODAL */}
      <Modal transparent visible={showCancelModal} animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Cancel Order?</Text>
              <Text style={styles.modalDesc}>Please select a cancellation reason.</Text>

              {loadingReasons ? (
                <View style={{ paddingVertical: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color={Theme.primary} />
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {cancelReasons.map((reason) => (
                    <TouchableOpacity
                      key={reason.CRCode}
                      style={[
                        styles.reasonRow,
                        selectedCancelReason === reason.CRName && styles.reasonRowSelected,
                      ]}
                      onPress={() => {
                        setSelectedCancelReason(reason.CRName);
                        setCustomCancelReason("");
                      }}
                    >
                      <View style={[styles.reasonRadio, selectedCancelReason === reason.CRName && { borderColor: Theme.primary }]}>
                        {selectedCancelReason === reason.CRName && (
                          <View style={[styles.reasonRadioSelected, { backgroundColor: Theme.primary }]} />
                        )}
                      </View>
                      <Text style={[styles.reasonName, selectedCancelReason === reason.CRName && { color: Theme.primary, fontFamily: Fonts.bold }]}>
                        {reason.CRName}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[
                      styles.reasonRow,
                      selectedCancelReason === "OTHER" && styles.reasonRowSelected,
                    ]}
                    onPress={() => setSelectedCancelReason("OTHER")}
                  >
                    <View style={[styles.reasonRadio, selectedCancelReason === "OTHER" && { borderColor: Theme.primary }]}>
                      {selectedCancelReason === "OTHER" && (
                        <View style={[styles.reasonRadioSelected, { backgroundColor: Theme.primary }]} />
                      )}
                    </View>
                    <Text style={[styles.reasonName, selectedCancelReason === "OTHER" && { color: Theme.primary, fontFamily: Fonts.bold }]}>
                      Other (Custom)
                    </Text>
                  </TouchableOpacity>

                  {selectedCancelReason === "OTHER" && (
                    <TextInput
                      style={styles.customReasonInput}
                      placeholder="Enter cancellation reason..."
                      placeholderTextColor={Theme.textMuted}
                      value={customCancelReason}
                      onChangeText={setCustomCancelReason}
                      multiline
                    />
                  )}

                  <View style={{ height: 20 }} />
                  <Text style={[styles.modalDesc, { marginBottom: 10, fontWeight: 'bold', color: Theme.textPrimary }]}>Enter Admin Password</Text>
                  <TextInput
                    style={[styles.customReasonInput, { minHeight: 50, marginTop: 0 }]}
                    placeholder="Admin Password"
                    placeholderTextColor={Theme.textMuted}
                    value={cancelPassword}
                    onChangeText={setCancelPassword}
                    secureTextEntry
                    keyboardType="number-pad"
                  />
                </ScrollView>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => {
                    setShowCancelModal(false);
                    setSelectedCancelReason(null);
                    setCustomCancelReason("");
                  }}
                >
                  <Text style={styles.modalBtnTextCancel}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnConfirm, { backgroundColor: Theme.danger }]}
                  disabled={isCancellingOrder}
                  onPress={() => {
                    if (!loadingReasons) {
                      handleCancelOrder();
                    }
                  }}
                >
                  {isCancellingOrder ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnTextConfirm}>Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* VOID ITEM MODAL */}
      <Modal transparent visible={showVoidModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 350 }]}>
            <Text style={styles.modalTitle}>Void Item?</Text>
            <Text style={styles.modalDesc}>
              Enter password to void "{itemToVoid?.name}". This will mark the item as cancelled.
            </Text>
            
            <TextInput
              style={[styles.customReasonInput, { minHeight: 50, marginTop: 0 }]}
              placeholder="Admin Password"
              placeholderTextColor={Theme.textMuted}
              value={voidPassword}
              onChangeText={setVoidPassword}
              secureTextEntry
              keyboardType="number-pad"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setShowVoidModal(false);
                  setItemToVoid(null);
                  setVoidPassword("");
                }}
              >
                <Text style={styles.modalBtnTextCancel}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: Theme.danger }]}
                onPress={async () => {
                  // Securely verify password with backend - checks for any Admin/Manager password
                  const verifyRes = await fetch(`${API_URL}/api/auth/verify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      password: voidPassword 
                    })
                  });
                  const verifyData = await verifyRes.json();

                  if (verifyData.success) {
                    if (activeOrder && itemToVoid) {
                      voidOrderItem(activeOrder.orderId, itemToVoid.lineItemId);
                      showToast({ type: "success", message: "Item Voided" });
                      setShowVoidModal(false);
                      setItemToVoid(null);
                      setVoidPassword("");
                    }
                  } else {
                    showToast({ type: "error", message: "Incorrect Password" });
                  }
                }}
              >
                <Text style={styles.modalBtnTextConfirm}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <GstSettingsModal 
        visible={showGstModal} 
        onClose={() => setShowGstModal(false)} 
      />

      {/* SERVER SELECTION MODAL */}
      <Modal transparent visible={showServerModal} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Waiter</Text>
              <TouchableOpacity onPress={() => setShowServerModal(false)}>
                <Ionicons name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalDesc}>Who is serving this table?</Text>

            {loadingServers ? (
              <ActivityIndicator color={Theme.primary} style={{ margin: 20 }} />
            ) : (
              <FlatList
                data={servers}
                keyExtractor={(item) => item.SER_ID.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.serverItem,
                      context.serverId === item.SER_ID && styles.serverItemSelected
                    ]}
                    onPress={() => {
                      setOrderContext({
                        ...context,
                        serverId: item.SER_ID,
                        serverName: item.SER_NAME
                      });
                      setShowServerModal(false);
                    }}
                  >
                    <View style={[styles.serverAvatar, { backgroundColor: context.serverId === item.SER_ID ? Theme.primary : Theme.bgMuted }]}>
                      <Text style={[styles.serverAvatarText, { color: context.serverId === item.SER_ID ? '#fff' : Theme.textPrimary }]}>
                        {item.SER_NAME.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.serverItemName, context.serverId === item.SER_ID && { color: Theme.primary, fontFamily: Fonts.bold }]}>
                      {item.SER_NAME}
                    </Text>
                    {context.serverId === item.SER_ID && (
                      <Ionicons name="checkmark-circle" size={22} color={Theme.primary} />
                    )}
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* BILL OPTIONS MODAL */}
      <Modal transparent visible={showBillOptions} animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowBillOptions(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { maxWidth: 350 }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Bill Options</Text>
                  <TouchableOpacity onPress={() => setShowBillOptions(false)}>
                    <Ionicons name="close" size={24} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.modalDesc}>Select an action for this bill</Text>


                <TouchableOpacity style={styles.billOptionItem} onPress={handleSplitBill}>
                  <View style={[styles.billOptionIcon, { backgroundColor: Theme.infoBg }]}>
                    <Ionicons name="git-branch-outline" size={20} color={Theme.info} />
                  </View>
                  <Text style={styles.billOptionText}>Split Bill</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.billOptionItem} onPress={handleMergeBill}>
                  <View style={[styles.billOptionIcon, { backgroundColor: Theme.warningBg }]}>
                    <Ionicons name="layers-outline" size={20} color={Theme.warning} />
                  </View>
                  <Text style={styles.billOptionText}>Merge Bill</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.billOptionItem} onPress={handleManualBill}>
                  <View style={[styles.billOptionIcon, { backgroundColor: Theme.dangerBg }]}>
                    <Ionicons name="add-circle-outline" size={20} color={Theme.danger} />
                  </View>
                  <Text style={styles.billOptionText}>Manual Bill</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* SPLIT BILL MODAL */}
      <Modal transparent visible={showSplitModal} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '95%', maxWidth: 600, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Split Bill</Text>
                <Text style={styles.modalSubTitle}>
                  Order #{displayOrderId} • {context.orderType === 'DINE_IN' ? `Table ${context.tableNo}` : `Takeaway ${context.takeawayNo}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                <Ionicons name="close" size={28} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={{ flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Select Items from Cart</Text>
                {cart.filter((i: any) => i.status !== "VOIDED").map((item: any) => (
                  <View key={item.lineItemId} style={styles.splitItemRow}>
                    <View style={styles.splitItemInfo}>
                      <Text style={styles.splitItemName}>{item.name}</Text>
                      <Text style={[styles.splitItemPrice, { color: Theme.primary, fontFamily: Fonts.bold }]}>
                        {currencySymbol}{item.price?.toFixed(2)}
                      </Text>
                    </View>
                    
                    <View style={styles.splitQtyControls}>
                      <TouchableOpacity 
                        style={styles.splitQtyBtn}
                        onPress={() => {
                          const current = splitQuantities[item.lineItemId] || 0;
                          if (current > 0) {
                            setSplitQuantities(prev => ({ ...prev, [item.lineItemId]: current - 1 }));
                          }
                        }}
                      >
                        <Ionicons name="remove" size={16} color={Theme.primary} />
                      </TouchableOpacity>
                      
                      <Text style={styles.splitQtyText}>{splitQuantities[item.lineItemId] || 0}</Text>
                      
                      <TouchableOpacity 
                        style={styles.splitQtyBtn}
                        onPress={() => {
                          const current = splitQuantities[item.lineItemId] || 0;
                          if (current < item.qty) {
                            setSplitQuantities(prev => ({ ...prev, [item.lineItemId]: current + 1 }));
                          }
                        }}
                      >
                        <Ionicons name="add" size={16} color={Theme.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {extraSplitItems.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 20, marginBottom: 10 }]}>Extra Items Added</Text>
                    {extraSplitItems.map((item, idx) => (
                      <View key={`extra-${idx}`} style={[styles.splitItemRow, { borderColor: Theme.success }]}>
                        <View style={styles.splitItemInfo}>
                          <Text style={styles.splitItemName}>{item.name}</Text>
                          <Text style={[styles.splitItemPrice, { color: Theme.success, fontFamily: Fonts.bold }]}>
                            {currencySymbol}{item.price?.toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.splitQtyControls}>
                          <TouchableOpacity 
                            style={styles.splitQtyBtn}
                            onPress={() => {
                              const newExtras = [...extraSplitItems];
                              if (newExtras[idx].qty > 1) {
                                newExtras[idx].qty -= 1;
                                setExtraSplitItems(newExtras);
                              } else {
                                newExtras.splice(idx, 1);
                                setExtraSplitItems(newExtras);
                              }
                            }}
                          >
                            <Ionicons name="remove" size={16} color={Theme.danger} />
                          </TouchableOpacity>
                          <Text style={styles.splitQtyText}>{item.qty}</Text>
                          <TouchableOpacity 
                            style={styles.splitQtyBtn}
                            onPress={() => {
                              const newExtras = [...extraSplitItems];
                              newExtras[idx].qty += 1;
                              setExtraSplitItems(newExtras);
                            }}
                          >
                            <Ionicons name="add" size={16} color={Theme.success} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: Theme.border }}>
                  <Text style={styles.sectionLabel}>Add Extra Items</Text>
                  <View style={[styles.searchWrap, { marginTop: 10 }]}>
                    <Ionicons name="search" size={20} color={Theme.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search dish to add..."
                      value={searchDishText}
                      onChangeText={setSearchDishText}
                    />
                    {searchDishText.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchDishText("")}>
                        <Ionicons name="close-circle" size={20} color={Theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {searchDishText.length > 0 && (
                    <View style={styles.searchResults}>
                      {allDishes
                        .filter(d => (d.Name || d.DishName || "").toLowerCase().includes(searchDishText.toLowerCase()))
                        .slice(0, 5)
                        .map(dish => (
                          <TouchableOpacity 
                            key={dish.DishId} 
                            style={styles.searchResultItem}
                            onPress={() => {
                              const existingIdx = extraSplitItems.findIndex(i => i.id === dish.DishId);
                              if (existingIdx > -1) {
                                const newExtras = [...extraSplitItems];
                                newExtras[existingIdx].qty += 1;
                                setExtraSplitItems(newExtras);
                              } else {
                                setExtraSplitItems([...extraSplitItems, {
                                  lineItemId: `extra-${Date.now()}`,
                                  id: dish.DishId,
                                  name: dish.Name || dish.DishName,
                                  price: dish.Price || 0,
                                  qty: 1
                                }]);
                              }
                              setSearchDishText("");
                              Keyboard.dismiss();
                            }}
                          >
                            <Text style={styles.searchResultName}>{dish.Name || dish.DishName}</Text>
                            <Text style={styles.searchResultPrice}>{currencySymbol}{dish.Price?.toFixed(2)}</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            <View style={styles.splitFooter}>
              <View style={styles.splitTotalRow}>
                <View>
                  <Text style={styles.splitTotalLabel}>Selected Total</Text>
                  <Text style={styles.grandSub}>Dish + Price Summary</Text>
                </View>
                <Text style={styles.splitTotalValue}>
                  {currencySymbol}
                  {(
                    Object.entries(splitQuantities).reduce((sum, [lineItemId, qty]: [string, any]) => {
                      const item = cart.find((i: any) => i.lineItemId === lineItemId);
                      return sum + (item?.price || 0) * qty;
                    }, 0) +
                    extraSplitItems.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0)
                  ).toFixed(2)}
                </Text>
              </View>

              <TouchableOpacity 
                style={[
                  styles.proceedBtn,
                  (Object.values(splitQuantities).every(q => q === 0) && extraSplitItems.length === 0) && { opacity: 0.5 }
                ]}
                disabled={Object.values(splitQuantities).every(q => q === 0) && extraSplitItems.length === 0}
                onPress={() => {
                  const selectedItems = [
                    ...cart.map((item: any) => ({
                      ...item,
                      qty: splitQuantities[item.lineItemId] || 0
                    })).filter((i: any) => i.qty > 0),
                    ...extraSplitItems
                  ];
                  
                  setShowSplitModal(false);
                  router.push({
                    pathname: "/payment",
                    params: { splitItems: JSON.stringify(selectedItems) }
                  });
                }}
              >
                <Ionicons name="card-outline" size={22} color="#fff" />
                <Text style={styles.proceedText}>Pay Separate Amount</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MERGE BILL MODAL */}
      <Modal transparent visible={showMergeModal} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Merge Bills</Text>
              <TouchableOpacity onPress={() => setShowMergeModal(false)}>
                <Ionicons name="close" size={24} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalDesc}>Select orders to merge into current bill</Text>

            <FlatList
              data={useActiveOrdersStore.getState().activeOrders.filter(o => o.orderId !== (displayOrderId || activeOrder?.orderId))}
              keyExtractor={(item) => item.orderId}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.mergeItem}
                  onPress={() => {
                    Alert.alert(
                      "Confirm Merge",
                      `Merge Order #${item.orderId} into this bill?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        { 
                          text: "Merge", 
                          onPress: async () => {
                            try {
                              const otherItems = item.items;
                              const currentCart = [...cart];
                              const mergedItems = [...currentCart];
                              otherItems.forEach(oi => {
                                const existing = mergedItems.find(mi => mi.id === oi.id && mi.status === "NEW" && oi.status === "NEW");
                                if (existing) {
                                  existing.qty += oi.qty;
                                } else {
                                  mergedItems.push(oi);
                                }
                              });
                              useCartStore.getState().setCartItems(currentContextId!, mergedItems);
                              useActiveOrdersStore.getState().closeActiveOrder(item.orderId);
                              if (item.context.tableId) {
                                await fetch(`${API_URL}/api/orders/complete`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ tableId: item.context.tableId }),
                                });
                              }
                              showToast({ type: "success", message: "Bills Merged" });
                              setShowMergeModal(false);
                            } catch (err) {
                              console.error("Merge failed:", err);
                              showToast({ type: "error", message: "Merge Failed" });
                            }
                          }
                        }
                      ]
                    );
                  }}
                >
                  <View style={[styles.mergeIcon, { backgroundColor: Theme.primaryLight }]}>
                    <Ionicons name="receipt-outline" size={20} color={Theme.primary} />
                  </View>
                  <View style={styles.mergeInfo}>
                    <Text style={styles.mergeTitle}>Order #{item.orderId}</Text>
                    <Text style={styles.mergeSub}>
                      {item.context.orderType === "DINE_IN" ? `Table ${item.context.tableNo}` : "Takeaway"} • {item.items.length} items
                    </Text>
                  </View>
                  <Text style={styles.mergePrice}>
                    {currencySymbol}{item.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: Theme.textMuted, fontFamily: Fonts.medium }}>No other active orders found</Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 70,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    backgroundColor: Theme.bgMuted,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    marginRight: 15,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  headerTitleContainer: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  contextText: {
    color: Theme.primaryDark,
    fontFamily: Fonts.bold,
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    color: Theme.textPrimary,
    fontSize: 22,
    fontFamily: Fonts.black,
  },
  mainContent: {
    flex: 1,
  },
  mainContentLandscape: {
    flexDirection: "row",
    marginTop: 10,
  },
  listContainer: {
    flex: 1,
    marginTop: 10,
  },
  listContainerLandscape: {
    marginRight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    borderLeftWidth: 4,
    borderLeftColor: Theme.primary,
    gap: 15,
    ...Theme.shadowSm,
  },
  qtyBadge: {
    backgroundColor: Theme.primaryLight,
    borderRadius: 10,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  qtyBadgeText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  rowContent: {
    flex: 1,
  },
  name: {
    color: Theme.textPrimary,
    fontFamily: Fonts.extraBold,
    fontSize: 16,
    marginBottom: 4,
  },
  sub: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontFamily: Fonts.medium,
  },
  textVoided: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
    opacity: 0.7,
  },
  priceBlock: {
    alignItems: "flex-end",
  },
  price: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 17,
  },
  itemTrashBtn: {
    padding: 8,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    marginLeft: 10,
  },
  receiptContainer: {
    width: "100%",
  },
  receiptContainerLandscape: {
    width: 380,
  },
  receiptCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 24,
    padding: 24,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowLg,
  },
  receiptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
  },
  receiptHeaderText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
    flex: 1,
  },
  itemCountChip: {
    backgroundColor: Theme.bgMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  itemCountChipText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  summaryValue: {
    color: Theme.textPrimary,
    fontFamily: Fonts.extraBold,
    fontSize: 15,
  },
  dashedDivider: {
    height: 1,
    width: "100%",
    overflow: "hidden",
    marginVertical: 15,
  },
  dashLine: {
    borderStyle: "dashed",
    borderWidth: 1,
    margin: -1,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 25,
  },
  grandLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  grandSub: {
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
  grandValue: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 32,
  },
  gstBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    alignSelf: "flex-end", 
    paddingVertical: 8, 
    paddingHorizontal: 15, 
    backgroundColor: Theme.primaryLight, 
    borderRadius: 10, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  gstBtnText: { color: Theme.primary, fontSize: 13, fontFamily: Fonts.bold },
  proceedBtn: {
    flexDirection: "row",
    backgroundColor: Theme.primary,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    gap: 12,
    ...Theme.shadowMd,
  },
  proceedText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Theme.bgCard,
    padding: 24,
    borderRadius: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowLg,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontSize: 22,
    fontFamily: Fonts.black,
    marginBottom: 8,
  },
  modalDesc: {
    color: Theme.textSecondary,
    fontSize: 14,
    marginBottom: 20,
    fontFamily: Fonts.regular,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: Theme.bgMuted,
    gap: 12,
  },
  reasonRowSelected: {
    backgroundColor: Theme.primaryLight,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  reasonRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  reasonRadioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  reasonName: {
    color: Theme.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.medium,
  },
  customReasonInput: {
    backgroundColor: Theme.bgInput,
    borderRadius: 12,
    padding: 15,
    color: Theme.textPrimary,
    fontSize: 15,
    marginTop: 10,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Theme.border,
    fontFamily: Fonts.regular,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 15,
    marginTop: 25,
  },
  modalBtnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalBtnTextCancel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
  },
  modalBtnConfirm: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 12,
    minWidth: 100,
    alignItems: "center",
  },
  modalBtnTextConfirm: {
    color: "#fff",
    fontFamily: Fonts.bold,
  },
  serverSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.bgMuted,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  serverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serverIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverNameText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: Theme.bgCard,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 15,
  },
  serverItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  serverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverAvatarText: {
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  serverItemName: {
    flex: 1,
    fontSize: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.medium,
  },
  billBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    gap: 8,
  },
  billBtnText: {
    color: Theme.primary,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  billOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Theme.bgMuted,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 16,
  },
  billOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  billOptionText: {
    fontSize: 16,
    color: Theme.textPrimary,
    fontFamily: Fonts.extraBold,
  },
  splitItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Theme.bgCard,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  splitItemInfo: {
    flex: 1,
  },
  splitItemName: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  splitItemPrice: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  splitQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.bgMuted,
    padding: 6,
    borderRadius: 10,
  },
  splitQtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  splitQtyText: {
    fontFamily: Fonts.black,
    fontSize: 14,
    minWidth: 20,
    textAlign: 'center',
  },
  splitFooter: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  splitTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  splitTotalLabel: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Theme.textSecondary,
  },
  splitTotalValue: {
    fontFamily: Fonts.black,
    fontSize: 20,
    color: Theme.primary,
  },
  mergeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: Theme.bgCard,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 15,
  },
  mergeItemSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  mergeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mergeInfo: {
    flex: 1,
  },
  mergeTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  mergeSub: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  mergePrice: {
    fontFamily: Fonts.black,
    fontSize: 16,
    color: Theme.primary,
  },
  modalSubTitle: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: Theme.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  searchResultName: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Theme.textPrimary,
  },
  searchResultPrice: {
    fontFamily: Fonts.black,
    fontSize: 14,
    color: Theme.primary,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
