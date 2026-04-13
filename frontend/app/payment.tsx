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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";
import { API_URL } from "@/constants/Config";

import {
  findActiveOrder,
  useActiveOrdersStore,
} from "../stores/activeOrdersStore";
import { clearCart } from "../stores/cartStore";
import {
  clearOrderContext,
  getOrderContext,
} from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";
import { useGstStore } from "../stores/gstStore";

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
  const router = useRouter();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();

  const isMobile = width < 768;
  const isTabletPortrait = width >= 768 && width < 1024 && height > width;
  const showOrderPanel = !isMobile && !isTabletPortrait;

  const context = getOrderContext();
  const activeOrder = context ? findActiveOrder(context) : undefined;

  const cart = useMemo(
    () => (activeOrder ? activeOrder.items : []),
    [activeOrder],
  );

  const discount = activeOrder?.discount;

  const [method, setMethod] = useState("CAS");
  const [cashInput, setCashInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [time, setTime] = useState(new Date());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<PaymentMethod | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { enabled: gstEnabled, percentage: gstPercentage, registrationNumber: gstRegNo, taxMode, loadSettings: loadGst } = useGstStore();

  useEffect(() => {
    loadGst();
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payment-methods`);
      if (!res.ok) throw new Error("Failed to load");
      const data: any[] = await res.json();
      const mapped: PaymentMethod[] = data.map((d) => ({
        payMode:         d.payMode        || "",
        description:     d.description    || d.payMode || "",
        icon:            getPaymodeIcon(d.payMode || ""),
        commission:      parseFloat(d.Commission)    || 0,
        serviceCharge:   parseFloat(d.ServiceCharge) || 0,
        isEntertainment: d.isEntertainment === 1 || d.isEntertainment === true,
        isVoucher:       d.isVoucher       === 1 || d.isVoucher       === true,
        position:        d.Position || 0,
      }));

      // Frontend deduplication: group all cash variants into one entry
      const seen = new Set<string>();
      const deduped = mapped.filter((m) => {
        const key = isCashMethod(m.payMode) ? "__CASH__" : m.payMode.toUpperCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setPaymentMethods(deduped);
      if (deduped.length > 0) {
        setMethod(deduped[0].payMode);
        fetchPaymentDetail(deduped[0].payMode, deduped[0]);
      }
    } catch {
      const fallback = [
        { payMode: "CAS",    description: "CASH",   icon: "money-bill-wave", commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 1 },
        { payMode: "NETS",   description: "NETS",   icon: "exchange-alt",   commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 2 },
        { payMode: "MASTER", description: "MASTER", icon: "cc-mastercard",  commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 3 },
        { payMode: "PAYNOW", description: "PayNow", icon: "qrcode",         commission: 0, serviceCharge: 0, isEntertainment: false, isVoucher: false, position: 4 },
      ];
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
      const res = await fetch(`${API_URL}/api/payment-detail/${encodeURIComponent(payMode)}`);
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
      cart.reduce((sum, item) => {
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
  
  const tax = useMemo(() => {
    if (!gstEnabled) return 0;
    const rate = gstPercentage / 100;
    if (taxMode === "inclusive") {
      return parseFloat((discSubtotal - discSubtotal / (1 + rate)).toFixed(2));
    }
    return parseFloat((discSubtotal * rate).toFixed(2));
  }, [gstEnabled, gstPercentage, taxMode, discSubtotal]);

  const displaySubtotal = taxMode === "inclusive" ? subtotal - tax : subtotal;
  const total = taxMode === "inclusive" ? discSubtotal : discSubtotal + tax;

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
      if (!activeOrder?.orderId || !/^\d{8}-\d{4}$/.test(activeOrder.orderId)) {
        showToast({ type: "error", message: "Invalid Order ID", subtitle: "Order ID format is invalid" });
        return false;
      }
      
      const saleData = {
        orderId: activeOrder?.orderId,
        orderType: context?.orderType === "DINE_IN" ? "DINE-IN" : context?.orderType || "DINE-IN",
        tableNo: context?.orderType === "TAKEAWAY" ? context?.takeawayNo : context?.tableNo,
        section: context?.section,
        items: cart
          .filter((item) => (item as any).status !== "VOIDED")
          .map((item) => ({
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
        cashierId: "FFA46DDA-2871-42BB-BE6D-A547AE9C1B88"
      };
      
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
        return true;
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
      return false;
    }
  };

  /* ================= PAYMENT ================= */

  const confirmPayment = async () => {
    if (isCashMethod(method) && (paidNum < total && Math.abs(paidNum - total) > 0.01)) {
      showToast({ type: "warning", message: "Insufficient Payment", subtitle: `Please enter at least $${total.toFixed(2)}` });
      return;
    }

    setProcessing(true);

    const saved = await saveSaleToDatabase();
    if (!saved) {
      setProcessing(false);
      return;
    }

    const printBill = () => {
      const dateStr = new Date().toLocaleString();
      let itemsHtml = "";
      cart.forEach((i) => {
        const nameLine = `${i.qty}x ${i.name}`;
        const priceLine = `$${((i.price || 0) * i.qty).toFixed(2)}`;
        itemsHtml += `<div><span style="float:left">${nameLine}</span><span style="float:right">${priceLine}</span><div style="clear:both"></div></div>`;
        const mods = i.modifiers as any[];
        if (mods && mods.length > 0) {
          mods.forEach((mod: any) => {
            itemsHtml += `<div style="color: #444; font-size: 11px; padding-left: 15px;">+ ${mod.ModifierName}</div>`;
          });
        }
      });

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt</title>
            <style>
              body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 10px; color: #000; font-size: 12px; line-height: 1.4; }
              .text-center { text-align: center; }
              .bold { font-weight: bold; }
              .title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
              .divider { border-top: 1px dashed #000; margin: 8px 0; }
              .flex-row { display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            <div class="text-center">
              <div class="title">SMART CAFE POS</div>
              <div>Tel: +65 1234 5678</div>
              ${gstRegNo ? `<div>GST Reg No: ${gstRegNo}</div>` : ''}
            </div>
            <div class="divider"></div>
            <div>
              <div>Date: ${dateStr}</div>
              <div>Order #: ${activeOrder?.orderId || 'N/A'}</div>
              <div>Method: ${method}</div>
            </div>
            <div class="divider"></div>
            ${itemsHtml}
            <div class="divider"></div>
            <div class="flex-row"><span>Subtotal:</span><span>$${displaySubtotal.toFixed(2)}</span></div>
            ${discountAmount > 0 ? `<div class="flex-row"><span>${discount?.label || 'Discount'}:</span><span>-$${discountAmount.toFixed(2)}</span></div>` : ''}
            ${gstEnabled ? `<div class="flex-row"><span>GST (${gstPercentage}%):</span><span>$${tax.toFixed(2)}</span></div>` : ''}
            <div class="flex-row bold" style="font-size: 14px; margin-top: 5px;"><span>TOTAL:</span><span>$${total.toFixed(2)}</span></div>
            <div class="divider"></div>
            <div class="flex-row"><span>Paid:</span><span>$${paidNum.toFixed(2)}</span></div>
            <div class="flex-row"><span>Change:</span><span>$${change.toFixed(2)}</span></div>
            <div class="divider"></div>
            <div class="text-center" style="margin-top: 15px;"><div>Thank you!</div></div>
          </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const win = window.open("", "", "width=300,height=600");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
      }
    };

    printBill();

    setTimeout(() => {
      router.replace({
        pathname: "/payment_success",
        params: {
          total: total.toFixed(2),
          paidNum: paidNum.toFixed(2),
          change: change.toFixed(2),
          method,
          orderId: activeOrder?.orderId ?? "",
          tableNo: context?.tableNo ?? "",
          section: context?.section ?? "",
          orderType: context?.orderType ?? "",
        },
      });

      if (activeOrder) closeActiveOrder(activeOrder.orderId);
      if (context) {
        if (context.orderType === "DINE_IN" && context.section && context.tableNo) {
          clearTable(context.section, context.tableNo);
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
          ${(item.price * item.qty).toFixed(2)}
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
            <Text style={styles.backText}>Back to Summary</Text>
          </TouchableOpacity>

          <View style={styles.orderInfo}>
            <Text style={styles.orderTitle}>Order #{activeOrder?.orderId}</Text>
            <Text style={styles.orderSub}>
              {context?.orderType === "DINE_IN"
                ? `Table ${context?.tableNo} • ${context?.section}`
                : `Takeaway • ${context?.section}`}
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
                <View style={[styles.leftPane, !showOrderPanel && { flex: 0 }]}>
                  <Text style={styles.sectionLabel}>Amount Due</Text>
                  <Text style={styles.grandTotal}>${total.toFixed(2)}</Text>

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
                      <Text style={styles.breakLabel}>GST ({gstPercentage}%)</Text>
                      <Text style={styles.breakValue}>${tax.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>

                {/* CENTER: PAYMENT METHOD & CASH INPUT */}
                <View style={styles.centerPane}>
                  <Text style={styles.sectionLabel}>Select Payment Method</Text>

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
                        for (let i = 0; i < paymentMethods.length; i += 2) {
                          rows.push(paymentMethods.slice(i, i + 2));
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
                                  size={20}
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
                            {/* Pad last row if odd number of items */}
                            {row.length === 1 && <View style={styles.methodCardEmpty} />}
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
                      isCashMethod(method) && paidNum < total && Math.abs(paidNum - total) > 0.01 && styles.disabled
                    ]}
                    disabled={processing || (isCashMethod(method) && paidNum < total && Math.abs(paidNum - total) > 0.01)}
                    onPress={confirmPayment}
                    activeOpacity={0.8}
                  >
                    {processing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={24} color="#fff" />
                        <Text style={styles.confirmText}>Complete Settlement</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.bgMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    padding: 16,
    borderRadius: 18,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowMd,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  centerPane: {
    flex: 2,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  rightPane: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
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
    fontSize: 32,
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
    fontSize: 16,
    fontFamily: Fonts.medium,
  },
  breakValue: {
    color: Theme.textPrimary,
    fontSize: 18,
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
    height: 70,
    borderRadius: 14,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Theme.border,
    gap: 6,
    paddingHorizontal: 8,
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
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 15,
    marginBottom: 12,
    overflow: "hidden", // Prevent outline/input escape
  },
  currency: {
    color: Theme.primary,
    fontSize: 24,
    fontFamily: Fonts.black,
    marginRight: 8,
  },
  cashInput: {
    flex: 1,
    color: Theme.textPrimary,
    fontSize: 28,
    fontFamily: Fonts.black,
    paddingLeft: 8, // Space from the $ symbol
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
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    minWidth: "22%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  quickText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },

  changeBox: {
    marginBottom: 20,
    backgroundColor: Theme.primaryLight,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  changeLabel: {
    color: Theme.primaryDark,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  changeValue: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },

  confirmBtn: {
    backgroundColor: Theme.primary,
    height: 56,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...Theme.shadowMd,
    marginTop: "auto",
  },
  confirmText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 18,
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
});