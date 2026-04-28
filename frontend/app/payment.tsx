import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from "react-native";
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";
import { API_URL } from "@/constants/Config";

import {
  findActiveOrder,
  useActiveOrdersStore,
} from "../stores/activeOrdersStore";
import {
  clearCart,
  useCartStore,
} from "../stores/cartStore";
import {
  clearOrderContext,
  getOrderContext,
} from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { useCompanySettingsStore } from "../stores/companySettingsStore";
import { usePaymentSettingsStore } from "../stores/paymentSettingsStore";
import { useAuthStore } from "../stores/authStore";
import UPIPaymentModal from "../components/payment/UPIPaymentModal";
import PayNowPaymentModal from "../components/payment/PayNowPaymentModal";

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

/* ================= PAYMENT METHOD ICON MAP ================= */
type PaymentMethod = {
  payMode: string;
  description: string;
  icon: string;
  commission: number;
  serviceCharge: number;
  isEntertainment: boolean;
  isVoucher: boolean;
  position: number;
};

const PAYMODE_ICON_MAP: Record<string, string> = {
  CAS:        "money-bill-wave",
  CASH:       "money-bill-wave",
  NETS:       "exchange-alt",
  AMEX:       "cc-amex",
  MASTER:     "cc-mastercard",
  VISA:       "cc-visa",
  PAYNOW:     "qrcode",
  GRAB:       "mobile-alt",
  FOODPANDA:  "mobile-alt",
  DINERS:     "credit-card",
  CHQ:        "university",
  LEDGER:     "book",
  VOUCHER:    "ticket-alt",
  DEAL:       "ticket-alt",
  UPI:        "mobile-alt",
  GPAY:       "google-pay",
};

function getPaymodeIcon(payMode: string): string {
  const key = payMode.toUpperCase().replace(/[^A-Z]/g, "");
  // Try exact match first, then prefix match
  if (PAYMODE_ICON_MAP[key]) return PAYMODE_ICON_MAP[key];
  for (const [k, v] of Object.entries(PAYMODE_ICON_MAP)) {
    if (key.startsWith(k) || k.startsWith(key)) return v;
  }
  return "credit-card"; // fallback
}

const isCashMethod = (payMode: string) =>
  /^(CAS|CASH)$/i.test(payMode.trim());

export default function PaymentScreen() {
  const closeActiveOrder = useActiveOrdersStore((s) => s.closeActiveOrder);
  const clearTable = useTableStatusStore((s) => s.clearTable);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isMobile = !isTablet;
  const isTabletPortrait = isTablet && !isLandscape && width < 1024;
  const showOrderPanel = (isTablet && (isLandscape || width >= 1024)) || (isMobile && isLandscape);

  const context = getOrderContext();
  const hasHydrated = useActiveOrdersStore((s) => s._hasHydrated);
  const activeOrder = context ? findActiveOrder(context) : undefined;

  if (!hasHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Theme.bgMain }}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

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

  const discount = useCartStore((s: any) => {
    const id = s.currentContextId;
    return id ? s.discounts[id] : null;
  });

  const [method, setMethod] = useState("CAS");
  const [cashInput, setCashInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [time, setTime] = useState(new Date());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<PaymentMethod | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isUPIVisible, setIsUPIVisible] = useState(false);
  const [isPayNowVisible, setIsPayNowVisible] = useState(false);
  const settingsStore = useCompanySettingsStore((state) => state.settings);
  const currencySymbol = settingsStore.currencySymbol || "$";
  const gstRate = (settingsStore.gstPercentage || 0) / 100;
  const { settings } = usePaymentSettingsStore();

  useEffect(() => {
    const init = async () => {
      // loadGst() removed
      await usePaymentSettingsStore.getState().fetchSettings();
      await fetchPaymentMethods();
      
      // ✅ Fetch official Order ID from DB to avoid "#NEW" bug
      if (context?.tableId) {
        try {
          const res = await fetch(`${API_URL}/api/tables/${context.tableId}`);
          const data = await res.json();
          if (data.success && data.table?.CurrentOrderId) {
             useCartStore.getState().setTableOrderId(context.tableId, data.table.CurrentOrderId);
          }
        } catch (err) {
          console.error("Failed to sync official Order ID:", err);
        }
      }
    };
    init();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-methods`);
      if (!res.ok) throw new Error("Failed to load");
      const data: any[] = await res.json();
      const mapped: PaymentMethod[] = data.map((d) => {
        const payMode = d.payMode || "";
        let description = d.description || payMode || "";
        const upperDesc = description.toUpperCase();
        
        // Group all UPI variants under "UPI" label for UI
        let icon = getPaymodeIcon(payMode);
        if (upperDesc.includes("UPI") || upperDesc.includes("GPAY") || upperDesc.includes("PHONEPE") || upperDesc.includes("PAYTM")) {
          description = "UPI";
          icon = "mobile-alt";
        }

        return {
          payMode,
          description,
          icon,
          commission:      parseFloat(d.Commission)    || 0,
          serviceCharge:   parseFloat(d.ServiceCharge) || 0,
          isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
          isVoucher:       d.isVoucher       === 1 || d.isVoucher       === true,
          position:        d.Position || 0,
        };
      });

      // Frontend deduplication: group all cash variants into one entry
      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        const key = isCashMethod(m.payMode) ? "__CASH__" : m.payMode.toUpperCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // 1. Get settings for filtering
      const { settings } = usePaymentSettingsStore.getState();
      const hasUPI = settings.upiId && settings.upiId.trim().length > 0;
      const hasPayNow = settings.payNowQrUrl && settings.payNowQrUrl.trim().length > 0;

      // 2. Filter list based on configuration
      const filtered = deduped.filter(m => {
        const mUpper = m.payMode.toUpperCase().trim();
        const isUPI = mUpper.includes("UPI") || mUpper.includes("GPAY") || mUpper.includes("PHONE") || mUpper.includes("PAYTM");
        const isPayNow = mUpper.includes("PAYNOW") || mUpper.includes("QR") || mUpper.includes("PAY-NOW");

        if (isUPI && !hasUPI) return false;
        if (isPayNow && !hasPayNow) return false;
        return true;
      });

      setPaymentMethods(filtered);
      if (filtered.length > 0) {
        setMethod(filtered[0].payMode);
        fetchPaymentDetail(filtered[0].payMode, filtered[0]);
      }
    } catch {
      const { settings } = usePaymentSettingsStore.getState();
      const hasUPI = settings.upiId && settings.upiId.trim().length > 0;
      const hasPayNow = settings.payNowQrUrl && settings.payNowQrUrl.trim().length > 0;

      const fallback = [
        { payMode: "CAS",    description: "CASH",   icon: "money-bill-wave", commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 1 },
        { payMode: "NETS",   description: "NETS",   icon: "exchange-alt",   commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 2 },
        { payMode: "MASTER", description: "MASTER", icon: "cc-mastercard",  commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 3 },
      ];
      
      if (hasPayNow) {
        fallback.push({ payMode: "PAYNOW", description: "PayNow", icon: "qrcode", commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 4 });
      }

      setPaymentMethods(fallback);
      setSelectedDetail(fallback[0]);
    } finally {
      setLoadingMethods(false);
    }
  };

  // Fetch live detail for a selected pay mode from the DB
  const fetchPaymentDetail = async (payMode: string, fallback?: PaymentMethod) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_URL}/api/sales/payment-detail/${encodeURIComponent(payMode)}`);
      if (!res.ok) throw new Error("Not found");
      const d = await res.json();
      setSelectedDetail({
        payMode:         d.payMode        || payMode,
        description:     d.description    || payMode,
        icon:            getPaymodeIcon(d.payMode || payMode),
        commission:      parseFloat(d.commission)    || 0,
        serviceCharge:   parseFloat(d.serviceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher:       d.isVoucher       === 1 || d.isVoucher       === true,
        position:        d.position || 0,
      });
    } catch {
      // Fallback to the card data if API call fails
      setSelectedDetail(fallback || paymentMethods.find((m) => m.payMode === payMode) || null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Called when user taps a payment method card
  const handleSelectMethod = (m: PaymentMethod) => {
    setMethod(m.payMode);
    fetchPaymentDetail(m.payMode, m);
  };

  /* ================= CALCULATIONS ================= */

  const subtotal = useMemo(
    () =>
      cart.reduce((sum: number, item: any) => {
        const isVoided = "status" in item && (item as any).status === "VOIDED";
        if (isVoided) return sum;
        return sum + (item.price || 0) * item.qty;
      }, 0),
    [cart],
  );

  const discountAmount = useMemo(() => {
    if (!discount?.applied) return 0;
    if (discount.type === "percentage") return (subtotal * discount.value) / 100;
    return discount.value;
  }, [discount, subtotal]);

  const discSubtotal = Math.max(0, subtotal - discountAmount);
  
  const tax = subtotal * gstRate;
  const total = subtotal - discountAmount + tax;
  const displaySubtotal = subtotal;

  const paidNum = parseFloat(cashInput) || 0;
  const change = Math.max(0, paidNum - total);

  const quickCash = [20, 50, 100, 200, 500, 1000];

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  /* ================= SAVE SALE TO DATABASE ================= */

  const saveSaleToDatabase = async () => {
    try {
      if (!activeOrder?.orderId) {
        showToast({ type: "error", message: "Invalid Order Context", subtitle: "Order reference is missing" });
        return false;
      }

      if (!user?.userId) {
        showToast({ type: "error", message: "User Missing", subtitle: "Logged in user ID not found" });
        return false;
      }
      
      const saleData = {
        orderId: activeOrder?.orderId,
        orderType: context?.orderType === "DINE_IN" ? "DINE-IN" : context?.orderType || "DINE-IN",
        tableNo: context?.orderType === "TAKEAWAY" ? context?.takeawayNo : context?.tableNo,
        section: context?.section,
        items: cart
          .filter((item: any) => (item as any).status !== "VOIDED")
          .map((item: any) => ({
            dishId: item.id,
            name: item.name,
            qty: item.qty,
            price: item.price,
          })),
        subTotal: subtotal,
        taxAmount: tax,
        discountAmount: discountAmount,
        discountType: discount?.type || "fixed",
        totalAmount: total,
        paymentMethod: method,
        cashierId: user.userId,
        tableId: context?.tableId
      };
      
      let generatedOrderId = null;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(`${API_URL}/api/sales/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const result = await response.json();
      
      if (response.status === 409) {
        showToast({ type: "error", message: "Duplicate Order ID", subtitle: "This order ID already exists. Please try again." });
        return false;
      }

      if (response.status === 400) {
        showToast({ type: "error", message: "Invalid Order", subtitle: result.error || "Order validation failed" });
        return false;
      }

      if (result.success) {
        generatedOrderId = result.orderId;
        return { success: true, orderId: result.orderId };
      } else {
        showToast({ type: "error", message: "Payment Failed", subtitle: result.error || "Unable to process payment" });
        return false;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast({ type: "error", message: "Request Timeout", subtitle: "Server took too long to respond" });
      } else {
        showToast({ type: "error", message: "Payment Error", subtitle: error.message });
      }
      return { success: false };
    }
  };

  /* ================= PAYMENT ================= */

  const confirmPayment = async () => {
    if (processing) return;

    if (total > 0 && isCashMethod(method) && (paidNum < total && Math.abs(paidNum - total) > 0.01)) {
      showToast({ type: "warning", message: "Insufficient Payment", subtitle: `Please enter at least ${currencySymbol}${total.toFixed(2)}` });
      return;
    }

    // --- QR PAYMENT CHECK ---
    const { settings } = usePaymentSettingsStore.getState();
    const upiId = settings.upiId;
    const payNowUrl = settings.payNowQrUrl;
    
    const mUpper = method.toUpperCase().trim();
    // Broad match for UPI/QR variants
    const isUPI = mUpper.includes("UPI") || mUpper.includes("GPAY") || mUpper.includes("PHONE") || mUpper.includes("PAYTM");
    const isPayNow = mUpper.includes("PAYNOW") || mUpper.includes("QR") || mUpper.includes("PAY-NOW");

    // Only show QR modal if the ID/URL actually exists
    if (isUPI && upiId && upiId.trim().length > 0) {
      setIsUPIVisible(true);
      return;
    }

    if (isPayNow && payNowUrl && payNowUrl.trim().length > 0) {
      setIsPayNowVisible(true);
      return;
    }

    executeFinalPayment();
  };

  const executeFinalPayment = async () => {
    setProcessing(true);

    const saveResult: any = await saveSaleToDatabase();
    if (!saveResult.success) {
      setProcessing(false);
      return;
    }

    const realOrderId = saveResult.orderId;





    setTimeout(() => {
      router.replace({
        pathname: "/payment_success",
        params: {
          total: total.toFixed(2),
          paidNum: paidNum.toFixed(2),
          change: change.toFixed(2),
          method,
          orderId: realOrderId || activeOrder?.orderId || "",
          tableNo: context?.tableNo ?? "",
          section: context?.section ?? "",
          orderType: context?.orderType ?? "",
          discountInfo: JSON.stringify(discount || {}),
          items: JSON.stringify(cart || []),
        },
      });

      if (context) {
        if (context.orderType === "DINE_IN" && context.section && context.tableNo) {
          clearTable(context.section, context.tableNo);
          if (context.tableId) {
            fetch(`${API_URL}/api/orders/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tableId: context.tableId }),
            }).catch(err => console.error("Sync Error:", err));
          }
        } else if (context.orderType === "TAKEAWAY" && context.takeawayNo) {
          clearTable("TAKEAWAY", context.takeawayNo);
        }
      }
      clearCart();
      clearOrderContext();
      setProcessing(false);
    }, 800);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isVoided = item.status === "VOIDED";
    return (
      <View style={styles.itemRow}>
        <Text style={[styles.itemQty, isVoided && styles.textVoided]}>
          {item.qty}x
        </Text>
        <Text
          style={[styles.itemName, isVoided && styles.textVoided]}
          numberOfLines={1}
        >
          {item.name}
          {isVoided && " (VOIDED)"}
        </Text>
        <Text style={[styles.itemPrice, isVoided && styles.textVoided]}>
          {currencySymbol}{(item.price * item.qty).toFixed(2)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>

          <View style={styles.orderInfo}>
            <Text style={styles.orderTitle}>Order #{displayOrderId || activeOrder?.orderId}</Text>
            <Text style={styles.orderSub}>
              {context?.orderType === "DINE_IN"
                ? `Table ${context?.tableNo} • ${formatSection(context?.section || "")}`
                : `Takeaway • ${formatSection(context?.section || "")}`}
            </Text>
            {context?.tableNo && useTableStatusStore.getState().getLockedName(context.tableNo, context.section) && (
              <View style={{ marginTop: 4, backgroundColor: Theme.tableLocked.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Theme.tableLocked.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="lock-closed" size={12} color={Theme.tableLocked.border} />
                <Text style={{ color: Theme.tableLocked.border, fontSize: 11, fontFamily: Fonts.black, textTransform: 'uppercase' }}>
                  RESERVED: {useTableStatusStore.getState().getLockedName(context.tableNo, context.section)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.rightHeader}>
            <Text style={styles.dateTime}>
              {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* MAIN */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView 
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.mainLayout, !showOrderPanel && styles.mobileLayout]}>
                {/* LEFT: TOTALS */}
                <View style={[
                  styles.leftPane, 
                  !showOrderPanel && { flex: 0 },
                  isMobile && isLandscape && { padding: 10, flex: 0.6 }
                ]}>
                  <Text style={[styles.sectionLabel, isMobile && isLandscape && { fontSize: 10, marginBottom: 4 }]}>Amount Due</Text>
                  <Text style={[styles.grandTotal, isMobile && isLandscape && { fontSize: 24 }]}>${total.toFixed(2)}</Text>

                  <View style={styles.breakdown}>
                    <View style={styles.breakRow}>
                      <Text style={styles.breakLabel}>Subtotal</Text>
                      <Text style={styles.breakValue}>${displaySubtotal.toFixed(2)}</Text>
                    </View>

                    {discount?.applied && (
                      <View style={styles.breakRow}>
                        <Text style={[styles.breakLabel, { color: Theme.danger }]}>
                          {discount.label || "Discount"}
                        </Text>
                        <Text style={[styles.breakValue, { color: Theme.danger }]}>-${discountAmount.toFixed(2)}</Text>
                      </View>
                    )}

                    <View style={styles.breakRow}>
                      <Text style={styles.breakLabel}>GST ({settingsStore.gstPercentage || 0}%)</Text>
                      <Text style={styles.breakValue}>${tax.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>

                {/* CENTER: PAYMENT METHOD & CASH INPUT */}
                <View style={[styles.centerPane, isMobile && isLandscape && { padding: 10, flex: 1.5 }]}>
                  <Text style={[styles.sectionLabel, isMobile && isLandscape && { fontSize: 10, marginBottom: 4 }]}>Select Payment Method</Text>

                  {loadingMethods ? (
                    <View style={styles.methodsLoading}>
                      <ActivityIndicator color={Theme.primary} />
                      <Text style={styles.methodsLoadingText}>Loading...</Text>
                    </View>
                  ) : (
                    /* 
                     * NOTE: We use View + map() instead of FlatList here.
                     * FlatList inside TouchableWithoutFeedback swallows onPress
                     * events from child TouchableOpacity items — making them
                     * appear non-clickable. View + map() has no such issue.
                     */
                    <View style={styles.methodGrid}>
                      {(() => {
                        const rows: PaymentMethod[][] = [];
                        for (let i = 0; i < paymentMethods.length; i += 3) {
                          rows.push(paymentMethods.slice(i, i + 3));
                        }
                        return rows.map((row, rowIdx) => (
                          <View key={rowIdx} style={styles.methodColumnWrapper}>
                            {row.map((m) => (
                              <TouchableOpacity
                                key={m.payMode}
                                style={[
                                  styles.methodCard,
                                  method === m.payMode && styles.activeMethod,
                                ]}
                                onPress={() => handleSelectMethod(m)}
                                activeOpacity={0.7}
                              >
                                <FontAwesome5
                                  name={m.icon}
                                  size={16}
                                  color={method === m.payMode ? "#fff" : Theme.textMuted}
                                />
                                <Text
                                  style={[styles.methodText, method === m.payMode && { color: "#fff" }]}
                                  numberOfLines={1}
                                >
                                  {m.description}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {/* Pad last row if needed for 3-column alignment */}
                            {row.length === 1 && (
                              <>
                                <View style={styles.methodCardEmpty} />
                                <View style={styles.methodCardEmpty} />
                              </>
                            )}
                            {row.length === 2 && <View style={styles.methodCardEmpty} />}
                          </View>
                        ));
                      })()}
                    </View>
                  )}

                  {/* ─── PAYMENT METHOD DETAIL PANEL ─── */}
                  {(() => {
                    // Use live fetched detail, fallback to selected in list
                    const sel = selectedDetail || paymentMethods.find((m) => m.payMode === method);
                    if (!sel) return null;

                    if (isCashMethod(method)) {
                      // Cash: show cash input + quick amounts + change
                      return (
                        <View style={styles.cashSection}>
                          <Text style={styles.sectionLabel}>Cash Received</Text>
                          <View style={styles.cashInputBox}>
                            <Text style={styles.currency}>$</Text>
                            <TextInput
                              style={styles.cashInput as any}
                              keyboardType="numeric"
                              value={cashInput}
                              onChangeText={setCashInput}
                              placeholder={`${total.toFixed(2)}`}
                              placeholderTextColor={Theme.textMuted}
                              autoFocus={!isMobile}
                            />
                          </View>

                          <View style={styles.quickGrid}>
                            {quickCash.map((v) => {
                              const isSelected = Math.abs(paidNum - v) < 0.01;
                              return (
                                <TouchableOpacity
                                  key={v}
                                  style={[styles.quickBtn, isSelected && { backgroundColor: Theme.primary, borderColor: Theme.primary }]}
                                  onPress={() => setCashInput(v.toFixed(2))}
                                >
                                  <Text style={[styles.quickText, isSelected && { color: "#fff" }]}>${v}</Text>
                                </TouchableOpacity>
                              );
                            })}
                            {(() => {
                              const isExact = Math.abs(paidNum - total) < 0.01;
                              return (
                                <TouchableOpacity
                                  style={[styles.quickBtn, isExact && { backgroundColor: Theme.primary, borderColor: Theme.primary }]}
                                  onPress={() => setCashInput(total.toFixed(2))}
                                >
                                  <Text style={[styles.quickText, isExact && { color: "#fff" }]}>Exact</Text>
                                </TouchableOpacity>
                              );
                            })()}
                          </View>

                          <View style={styles.changeBox}>
                            <Text style={styles.changeLabel}>Change to Return</Text>
                            <Text style={styles.changeValue}>${change.toFixed(2)}</Text>
                          </View>
                        </View>
                      );
                    }

                    // Non-cash: show live DB-fetched detail panel
                    if (loadingDetail) {
                      return (
                        <View style={styles.methodsLoading}>
                          <ActivityIndicator color={Theme.primary} />
                          <Text style={styles.methodsLoadingText}>Loading details...</Text>
                        </View>
                      );
                    }

                    const detailRows = [
                      { label: "Payment Mode",   value: sel.payMode        || "—" },
                      { label: "Description",    value: sel.description    || "—" },
                      { label: "Commission",      value: `${(sel.commission    ?? 0).toFixed(2)}%` },
                      { label: "Service Charge",  value: `${(sel.serviceCharge ?? 0).toFixed(2)}%` },
                      { label: "Type",            value: sel.isEntertainment ? "Entertainment" : sel.isVoucher ? "Voucher" : "Standard" },
                      { label: "Amount Due",      value: `$${total.toFixed(2)}`, highlight: true },
                    ];

                    return (
                      <View style={styles.methodDetailPanel}>
                        {/* Header row */}
                        <View style={styles.methodDetailHeader}>
                          <FontAwesome5 name={sel.icon} size={22} color={Theme.primary} />
                          <Text style={styles.methodDetailTitle}>{sel.description}</Text>
                          <View style={[styles.methodDetailBadge, { backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder }]}>
                            <Text style={[styles.methodDetailBadgeText, { color: Theme.primary }]}>ACTIVE</Text>
                          </View>
                        </View>

                        {/* Column header row */}
                        <View style={styles.detailTableHeader}>
                          <Text style={[styles.detailCol, styles.detailColHeader]}>FIELD</Text>
                          <Text style={[styles.detailColValue, styles.detailColHeader]}>VALUE</Text>
                        </View>

                        {/* Data rows */}
                        {detailRows.map((row, i) => (
                          <View
                            key={row.label}
                            style={[
                              styles.detailTableRow,
                              i % 2 === 0 && styles.detailTableRowAlt,
                              row.highlight && styles.detailTableRowHighlight,
                            ]}
                          >
                            <Text style={[styles.detailCol, row.highlight && styles.detailHighlightLabel]}>
                              {row.label}
                            </Text>
                            <Text style={[styles.detailColValue, row.highlight && styles.detailHighlightValue]}>
                              {row.value}
                            </Text>
                          </View>
                        ))}

                        {/* Confirm note */}
                        <View style={styles.methodConfirmNote}>
                          <Ionicons name="information-circle-outline" size={14} color={Theme.textMuted} />
                          <Text style={styles.methodConfirmNoteText}>
                            Press "Complete Settlement" to confirm payment via {sel.description}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      isMobile && isLandscape && { height: 44, marginTop: 10 },
                      isCashMethod(method) && total > 0 && paidNum < total && Math.abs(paidNum - total) > 0.01 && styles.disabled
                    ]}
                    disabled={processing || (isCashMethod(method) && total > 0 && paidNum < total && Math.abs(paidNum - total) > 0.01)}
                    onPress={confirmPayment}
                    activeOpacity={0.8}
                  >
                    {processing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={isMobile && isLandscape ? 18 : 24} color="#fff" />
                        <Text style={[styles.confirmText, isMobile && isLandscape && { fontSize: 14 }]}>Complete Settlement</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* RIGHT: ORDER SUMMARY (Tablet/Desktop) */}
                {showOrderPanel && (
                  <View style={styles.rightPane}>
                    <View style={styles.summaryHeader}>
                      <Ionicons name="list-outline" size={18} color={Theme.textSecondary} />
                      <Text style={styles.receiptTitle}>Order Items</Text>
                    </View>

                    <FlatList
                      data={cart}
                      keyExtractor={(_item: any, index: number) => index.toString()}
                      renderItem={renderItem}
                      showsVerticalScrollIndicator={false}
                      style={styles.itemsList}
                      scrollEnabled={false}
                    />

                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptTotalRow}>
                      <Text style={styles.receiptTotalLabel}>Total</Text>
                      <Text style={styles.receiptTotalValue}>${total.toFixed(2)}</Text>
                    </View>
                  </View>
                )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

      </View>
      <UPIPaymentModal
        visible={isUPIVisible}
        onClose={() => setIsUPIVisible(false)}
        amount={total}
        onSuccess={() => executeFinalPayment()}
      />

      <PayNowPaymentModal
        visible={isPayNowVisible}
        onClose={() => setIsPayNowVisible(false)}
        amount={total}
        onSuccess={() => executeFinalPayment()}
      />
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
    padding: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  backText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  orderInfo: {
    alignItems: "center",
  },
  orderTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 18,
  },
  orderSub: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontFamily: Fonts.medium,
    marginTop: 2,
  },
  rightHeader: {
    minWidth: 80,
    alignItems: "flex-end",
  },
  dateTime: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
  },

  mainLayout: {
    flex: 1,
    flexDirection: "row",
    gap: 20,
  },
  mobileLayout: {
    flexDirection: "column",
  },

  leftPane: {
    flex: 0.8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  centerPane: {
    flex: 2,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  rightPane: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.border,
  },

  sectionLabel: {
    color: Theme.textSecondary,
    marginBottom: 10,
    fontFamily: Fonts.bold,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grandTotal: {
    fontSize: 26,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },

  breakdown: {
    marginTop: 20,
    gap: 12,
  },
  breakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakLabel: {
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  breakValue: {
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.extraBold,
  },

  methodGrid: {
    marginBottom: 16,
  },
  methodColumnWrapper: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  methodCard: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 4,
    paddingHorizontal: 4,
  },
  methodsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 70,
    marginBottom: 16,
  },
  methodsLoadingText: {
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  activeMethod: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  methodCardEmpty: {
    flex: 1,
    // Invisible placeholder to keep the last row aligned in a 2-column grid
  },
  methodText: {
    marginTop: 6,
    fontFamily: Fonts.black,
    fontSize: 11,
    color: Theme.textSecondary,
  },

  /* ── Method Detail Panel (DB-driven, non-cash) ── */
  methodDetailPanel: {
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  methodDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: Theme.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.primaryBorder,
  },
  methodDetailTitle: {
    flex: 1,
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  methodDetailBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  methodDetailBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
  },

  /* Table: column header */
  detailTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  detailColHeader: {
    fontFamily: Fonts.extraBold,
    fontSize: 11,
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  /* Table: data rows */
  detailTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  detailTableRowAlt: {
    backgroundColor: Theme.bgMain,
  },
  detailTableRowHighlight: {
    backgroundColor: Theme.primaryLight,
    borderBottomColor: Theme.primaryBorder,
  },

  /* Table: columns */
  detailCol: {
    flex: 1,
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  detailColValue: {
    flex: 1,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 14,
    textAlign: "right",
  },
  detailHighlightLabel: {
    color: Theme.primary,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  detailHighlightValue: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 20,
  },

  /* Confirm note */
  methodConfirmNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 12,
    backgroundColor: Theme.bgMuted,
  },
  methodConfirmNoteText: {
    flex: 1,
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
    fontSize: 12,
    fontStyle: "italic",
  },

  cashSection: {
    marginTop: 10,
  },

  cashInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgInput,
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 10,
    overflow: "hidden", 
  },
  currency: {
    color: Theme.primary,
    fontSize: 20,
    fontFamily: Fonts.black,
    marginRight: 6,
  },
  cashInput: {
    flex: 1,
    color: Theme.textPrimary,
    fontSize: 24,
    fontFamily: Fonts.black,
    paddingLeft: 6, 
    margin: 0,
    height: "100%",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  quickBtn: {
    backgroundColor: Theme.bgMuted,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: "22%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  quickText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 14,
  },

  changeBox: {
    marginBottom: 15,
    backgroundColor: Theme.primaryLight,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  changeLabel: {
    color: Theme.primaryDark,
    fontFamily: Fonts.bold,
    fontSize: 11,
  },
  changeValue: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },

  confirmBtn: {
    backgroundColor: Theme.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Theme.shadowMd,
    marginTop: "auto",
  },
  confirmText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  disabled: {
    backgroundColor: Theme.textMuted,
    opacity: 0.6,
  },

  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 15,
  },
  receiptTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  itemsList: {
    flex: 1,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  itemQty: {
    width: 35,
    color: Theme.primary,
    fontFamily: Fonts.black,
  },
  itemName: {
    flex: 1,
    color: Theme.textPrimary,
    fontFamily: Fonts.medium,
  },
  itemPrice: {
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
  },
  textVoided: {
    textDecorationLine: "line-through",
    color: Theme.textMuted,
    opacity: 0.6,
  },

  receiptDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 15,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptTotalLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 18,
  },
  receiptTotalValue: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 24,
  },
  qrContainerInline: {
    alignItems: "center",
    padding: 15,
    backgroundColor: "#fff",
  },
  qrBoxInline: {
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  qrImageInline: {
    width: 180,
    height: 180,
  },
  qrSubtextInline: {
    marginTop: 10,
    fontSize: 12,
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
  },
  qrAmountInline: {
    marginTop: 4,
    fontSize: 16,
    color: Theme.primary,
    fontFamily: Fonts.black,
  },
});
