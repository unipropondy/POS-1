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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";
import { API_URL } from "@/constants/Config";

import DiscountModal from "../components/DiscountModal";
import GstSettingsModal from "../components/GstSettingsModal";
import { findActiveOrder, useActiveOrdersStore } from "../stores/activeOrdersStore";
import { useCartStore } from "../stores/cartStore";
import { useGstStore } from "../stores/gstStore"; 
import { getOrderContext } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";

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

  const { enabled: gstEnabled, percentage: gstPercentage, taxMode, isConfigured: gstConfigured, setEnabled: setGstEnabled, loadSettings: loadGst } = useGstStore();

  useEffect(() => {
    loadGst();
  }, []);

  const cart = useMemo(() => {
    return activeOrder ? activeOrder.items : [];
  }, [activeOrder]);

  const discountInfo = useCartStore((s) => {
    const id = s.currentContextId;
    return id ? s.discounts[id] : null;
  });

  const applyDiscount = useCartStore((s) => s.applyDiscount);
  const clearCart = useCartStore((s) => s.clearCart);
  const updateOrderDiscount = useActiveOrdersStore((s) => s.updateOrderDiscount);
  const closeActiveOrder = useActiveOrdersStore((s) => s.closeActiveOrder);
  const updateTableStatus = useTableStatusStore((s) => s.updateTableStatus);

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

  const fetchCancelReasons = async () => {
    try {
      setLoadingReasons(true);
      const res = await fetch(`${API_URL}/api/cancel-reasons`);
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
    if (!selectedCancelReason && !customCancelReason.trim()) {
      showToast({
        type: "error",
        message: "Please select or enter a cancellation reason",
      });
      return;
    }

    const reason = customCancelReason.trim() || selectedCancelReason || "No reason provided";

    setIsCancellingOrder(true);

    try {
      if (context && activeOrder) {
        closeActiveOrder(activeOrder.orderId);
        clearCart();
        if (context.orderType === "DINE_IN" && context.section && context.tableNo) {
          updateTableStatus(context.section, context.tableNo, "", "EMPTY");
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

  const totalItems = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const isVoided = "status" in item && (item as any).status === "VOIDED";
        if (isVoided) return sum;
        return sum + item.qty;
      }, 0),
    [cart],
  );

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
    if (!discountInfo?.applied) return 0;
    if (discountInfo.type === "percentage") return (subtotal * discountInfo.value) / 100;
    return discountInfo.value;
  }, [discountInfo, subtotal]);

  const discSubtotal = Math.max(0, subtotal - discountAmount);
  
  const gstAmount = useMemo(() => {
    if (!gstEnabled) return 0;
    const rate = gstPercentage / 100;
    if (taxMode === "inclusive") {
      // Extract tax from price: Total - (Total / (1 + rate))
      return parseFloat((discSubtotal - discSubtotal / (1 + rate)).toFixed(2));
    }
    // Add tax on top
    return parseFloat((discSubtotal * rate).toFixed(2));
  }, [gstEnabled, gstPercentage, taxMode, discSubtotal]);

  const displaySubtotal = taxMode === "inclusive" ? discSubtotal - gstAmount : subtotal;
  const grandTotal = taxMode === "inclusive" ? discSubtotal : discSubtotal + gstAmount;

  if (!context) return null;

  if (!activeOrder) {
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
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </Pressable>

            <View style={styles.headerTitleContainer}>
              <Text style={[styles.title, !isLandscape && { fontSize: 18 }]} numberOfLines={1}>Order Summary</Text>
              {context.orderType === "DINE_IN" ? (
                <Text style={[styles.contextText, !isLandscape && { fontSize: 11 }]} numberOfLines={1}>
                  Dine-In • {context.section} • Table {context.tableNo}
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
              style={[styles.actionBtn, { backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder, borderWidth: 1 }]}
              onPress={async () => {
                await fetchCancelReasons();
                setShowCancelModal(true);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={Theme.danger} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.danger }]}>Cancel</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.infoBg, borderColor: Theme.infoBorder, borderWidth: 1 }]}
              onPress={() => router.push("/kds")}
            >
              <Ionicons name="tv-outline" size={18} color={Theme.info} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.info }]}>KDS</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.primaryLight, borderColor: Theme.primaryBorder, borderWidth: 1 }]}
              onPress={() => setShowDiscount(true)}
            >
              <Ionicons name="pricetag-outline" size={18} color={Theme.primary} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.primary }]}>Discount</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Theme.warningBg, borderColor: Theme.warningBorder, borderWidth: 1 }]}
              onPress={handleFOC}
            >
              <Ionicons name="gift-outline" size={18} color={Theme.warning} />
              {isLandscape && <Text style={[styles.actionBtnText, { color: Theme.warning }]}>FOC</Text>}
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
              renderItem={({ item }) => (
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
                      ${((item.price || 0) * item.qty).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>

          {/* TOTALS RECEIPT CARD */}
          <View style={[styles.receiptContainer, isLandscape && styles.receiptContainerLandscape]}>
            <View style={styles.receiptCard}>
              <View style={styles.receiptHeader}>
                <Ionicons name="receipt-outline" size={18} color={Theme.primary} />
                <Text style={styles.receiptHeaderText}>Bill Summary</Text>
                <View style={styles.itemCountChip}>
                  <Text style={styles.itemCountChipText}>{totalItems} items</Text>
                </View>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${displaySubtotal.toFixed(2)}</Text>
              </View>

              {discountInfo?.applied && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Theme.danger }]}>
                    {discountInfo.label || "Discount"}
                  </Text>
                  <Text style={[styles.summaryValue, { color: Theme.danger }]}>-${discountAmount.toFixed(2)}</Text>
                </View>
              )}

              {gstEnabled ? (
                <View style={styles.summaryRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.summaryLabel}>GST ({gstPercentage}%)</Text>
                    <TouchableOpacity onPress={() => setShowGstModal(true)}>
                      <Ionicons name="settings-outline" size={12} color={Theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.summaryValue}>${gstAmount.toFixed(2)}</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.gstBtn} 
                  onPress={() => gstConfigured ? setGstEnabled(true) : setShowGstModal(true)}
                >
                  <Ionicons name="add-circle-outline" size={14} color={Theme.primary} />
                  <Text style={styles.gstBtnText}>Enable GST</Text>
                </TouchableOpacity>
              )}

              <View style={styles.dashedDivider}>
                <View style={[styles.dashLine, { borderColor: Theme.border }]} />
              </View>

              <View style={styles.grandRow}>
                <View>
                  <Text style={styles.grandLabel}>Total Amount</Text>
                  <Text style={styles.grandSub}>Including all taxes</Text>
                </View>
                <Text style={styles.grandValue}>${grandTotal.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={styles.proceedBtn}
                onPress={() => router.push("/payment")}
                activeOpacity={0.8}
              >
                <Ionicons name="card-outline" size={22} color="#fff" />
                <Text style={styles.proceedText}>Proceed to Payment</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <GstSettingsModal
        visible={showGstModal}
        onClose={() => setShowGstModal(false)}
        previewSubtotal={subtotal}
      />

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
});
