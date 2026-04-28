import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useKdsSocket } from "../hooks/useKdsSocket";
import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";
import { useAuthStore } from "../stores/authStore";

const URGENCY_FRESH = 15;
const URGENCY_WARN = 30;

type UrgencyLevel = "fresh" | "warn" | "critical";

function getUrgency(minutes: number): UrgencyLevel {
  if (minutes < URGENCY_FRESH) return "fresh";
  if (minutes < URGENCY_WARN) return "warn";
  return "critical";
}

const formatSection = (sec: string) => {
  if (!sec) return "";
  if (sec === "TAKEAWAY") return "Takeaway";
  return sec.replace("_", "-").replace("SECTION", "Section");
};

const URGENCY_UI: Record<UrgencyLevel, { primary: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  fresh: { primary: Theme.success, label: "ON TRACK", icon: "checkmark-circle-outline" },
  warn: { primary: Theme.warning, label: "RUNNING LONG", icon: "time-outline" },
  critical: { primary: Theme.danger, label: "OVERDUE", icon: "alert-circle-outline" },
};

// Per-card component so each card can track its own scroll state
const OrderCard = React.memo(function OrderCard({ item, cardHeight, pulseAnim, groups }: any) {
  const [now, setNow] = useState(Date.now());
  const [hasMore, setHasMore] = useState(false);
  const contentH = useRef(0);
  const viewH = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getTs = (val: any) => {
    if (!val) return 0;
    const ts = typeof val === 'number' ? val : new Date(val).getTime();
    return isNaN(ts) ? 0 : ts;
  };

  const latestSent = Math.max(...item.items.map((i: any) => getTs(i.sentAt || item.createdAt)));
  const elapsed = Math.max(0, now - latestSent);
  const safeElapsed = isNaN(elapsed) ? 0 : elapsed;
  const minutes = Math.floor(safeElapsed / 60000);
  const seconds = Math.floor((safeElapsed % 60000) / 1000);
  const urgency = getUrgency(minutes);
  const ui = URGENCY_UI[urgency];
  const timerOpacity = urgency === "critical" ? pulseAnim : 1;

  const checkMore = () => {
    setHasMore(contentH.current > viewH.current + 5);
  };

  return (
    <Pressable
      style={[styles.cardContainer, { height: cardHeight }]}
      onPress={() => item.onPress?.(item)}
    >
      <View style={[styles.urgencyBar, { backgroundColor: ui.primary }]} />
      <View style={styles.cardHeader}>
        <View style={styles.headerRow}>
          <Text style={styles.tableInfo} numberOfLines={1}>
            {item.context.orderType === "DINE_IN"
              ? `${formatSection(item.context.section)} • Table ${item.context.tableNo}`
              : `Takeaway • #${item.context.takeawayNo}`}
          </Text>
          <Animated.Text style={[styles.timer, { color: ui.primary, opacity: timerOpacity }]}>
            {minutes}:{seconds.toString().padStart(2, "0")}
          </Animated.Text>
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.orderIdText}>#{item.orderId}</Text>
          <View style={[styles.statusBadge, { borderColor: ui.primary + "40" }]}>
            <Ionicons name={ui.icon} size={10} color={ui.primary} />
            <Text style={[styles.statusBadgeText, { color: ui.primary }]}>{ui.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={{ flex: 1 }}>
        <ScrollView
          style={[styles.itemsScroll, !cardHeight && { maxHeight: 400 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={(_, h) => { contentH.current = h; checkMore(); }}
          onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; checkMore(); }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            setHasMore(contentOffset.y + layoutMeasurement.height < contentSize.height - 10);
          }}
          scrollEventThrottle={16}
        >
          {Object.entries(groups).map(([catName, items]: any) => (
            <View key={catName} style={styles.categorySection}>
              <Text style={styles.categoryHeader}>{catName}</Text>
              {items.map((i: any) => (
                <View
                  key={i.lineItemId}
                  style={[
                    styles.itemRow,
                    (now - (i.sentAt || item.createdAt) < 15000) && styles.itemFlash,
                    i.status === "READY" && styles.itemReadyFlash
                  ]}
                >
                  <View style={styles.qtyPill}>
                    <Text style={styles.itemQtyPrefix}>{i.qty}x</Text>
                  </View>

                  <View style={[styles.itemTextWrap, { marginLeft: 10 }]}>
                    <View style={styles.itemTitleRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                        <Text style={[styles.itemName, i.status === "VOIDED" && styles.itemVoided]} numberOfLines={2}>{i.name}</Text>
                        {i.isTakeaway && (
                          <View style={styles.takeawayBadge}>
                            <Ionicons name="bag-handle" size={10} color="#FFF" />
                            <Text style={styles.takeawayBadgeText}>TAKEAWAY</Text>
                          </View>
                        )}
                      </View>
                      {(i.status === "VOIDED" || i.status === "READY" || now - (i.sentAt || item.createdAt) < 150000) && (
                        <View style={[
                          styles.itemStatusBadge,
                          { backgroundColor: i.status === "READY" ? Theme.success : Theme.danger }
                        ]}>
                          <Text style={styles.itemStatusText}>
                            {i.status === "VOIDED" ? "VOID" : i.status === "READY" ? "READY" : "NEW"}
                          </Text>
                        </View>
                      )}
                    </View>

                    {i.modifiers?.map((mod: any, idx: number) => (
                      <Text key={idx} style={styles.modifierText}>• {mod.ModifierName}</Text>
                    ))}

                    {(i.note || i.notes) && (
                      <View style={styles.noteWrapper}>
                        <Ionicons name="pencil" size={10} color={Theme.primary} />
                        <Text style={styles.simpleNoteText}>{i.note || i.notes}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        {hasMore && (
          <View style={styles.floatingMore} pointerEvents="none">
            <Ionicons name="chevron-down" size={16} color={Theme.primary} />
          </View>
        )}
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return (
    prev.item.orderId === next.item.orderId &&
    JSON.stringify(prev.item.items) === JSON.stringify(next.item.items) &&
    prev.groups === next.groups
  );
});

export default function KDSScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isKDSUser = user?.userName?.toUpperCase() === "KDS";

  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);
  useKdsSocket();

  const [time, setTime] = useState(Date.now());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const markItemReady = useActiveOrdersStore((s) => s.markItemReady);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    useActiveOrdersStore.getState().fetchActiveKitchenOrders();
    const interval = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const kitchenOrders = useMemo(() => {
    return activeOrders
      .map((order) => {
        const displayItems = order.items.filter((i: any) => {
          if (i.status === "SENT" || i.status === "VOIDED") return true;
          if (i.status === "READY" && i.readyAt) {
            return time - i.readyAt < 20000; // Stay for 20 seconds
          }
          return false;
        });
        if (displayItems.length === 0) return null;
        return { ...order, items: displayItems };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
  }, [activeOrders, time]);

  const selectedOrder = useMemo(() => {
    return kitchenOrders.find((o: any) => o.orderId === selectedOrderId);
  }, [kitchenOrders, selectedOrderId]);

  const isWeb = Platform.OS === "web";
  const numColumns = width > 900 ? 3 : width > 600 ? 2 : 1;
  // Use fixed height only for multi-column grid; let mobile cards be dynamic
  const cardHeight = numColumns > 1 ? height * 0.55 : undefined;

  const stats = useMemo(() => {
    let fresh = 0, warn = 0, critical = 0;
    kitchenOrders.forEach((order: any) => {
      const latestSent = Math.max(...order.items.map((i: any) => i.sentAt || order.createdAt));
      const mins = Math.floor(Math.max(0, time - latestSent) / 60000);
      const u = getUrgency(mins);
      if (u === "fresh") fresh++;
      else if (u === "warn") warn++;
      else critical++;
    });
    return { fresh, warn, critical, total: kitchenOrders.length };
  }, [kitchenOrders, time]);

  const scrollStep = (dir: "up" | "down") => {
    const step = height * 0.7;
    const next = dir === "down" ? scrollOffset.current + step : scrollOffset.current - step;
    const clamped = Math.max(0, next);
    flatListRef.current?.scrollToOffset({ offset: clamped, animated: true });
    scrollOffset.current = clamped;
  };

  const handleScroll = (e: any) => {
    scrollOffset.current = e.nativeEvent.contentOffset.y;
  };

  const renderOrder = ({ item }: any) => {
    const groups: Record<string, OrderItem[]> = {};
    item.items.forEach((i: OrderItem) => {
      // ✅ Prioritize Specific Kitchen Name (Dish Group -> Category -> Fallback)
      const cat = (i.dishGroupName || i.categoryName || "KITCHEN").toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(i);
    });

    const cardHeight = numColumns === 1 ? undefined : (height - 180) / Math.ceil(kitchenOrders.length / numColumns);

    return (
      <OrderCard
        item={{ ...item, onPress: (o: any) => setSelectedOrderId(o.orderId) }}
        cardHeight={cardHeight}
        pulseAnim={pulseAnim}
        groups={groups}
      />
    );
  };

  const handleMarkReady = (lineItemId: string) => {
    if (!selectedOrder) return;
    markItemReady(selectedOrder.orderId, lineItemId);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={styles.container}>

        {/* ITEM SELECTION MODAL */}
        <Modal
          visible={!!selectedOrderId}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedOrderId(null)}
        >
          <BlurView intensity={20} tint="dark" style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedOrderId(null)} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedOrder?.context.orderType === "DINE_IN"
                    ? `Table ${selectedOrder.context.tableNo}`
                    : `Takeaway #${selectedOrder?.context.takeawayNo}`}
                </Text>
                <Pressable onPress={() => setSelectedOrderId(null)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={Theme.textPrimary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalItemsList}>
                {selectedOrder?.items.map((i: any) => {
                  const isReady = i.status === "READY";
                  return (
                    <View key={i.lineItemId} style={[styles.modalItemRow, isReady && styles.modalItemReady]}>
                      <View style={styles.modalItemInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.modalItemQty}>{i.qty}x</Text>
                          <Text style={[styles.modalItemName, i.status === "VOIDED" && styles.itemVoided]}>{i.name}</Text>
                          {i.isTakeaway && (
                            <View style={styles.takeawayBadge}>
                              <Text style={styles.takeawayBadgeText}>TAKEAWAY</Text>
                            </View>
                          )}
                        </View>
                        {i.modifiers?.map((m: any, idx: number) => (
                          <Text key={idx} style={styles.modalModifierText}>• {m.ModifierName}</Text>
                        ))}
                      </View>

                      {i.status !== "VOIDED" && (
                        <Pressable
                          style={[styles.readyBtn, isReady && styles.readyBtnActive]}
                          onPress={() => !isReady && handleMarkReady(i.lineItemId)}
                        >
                          <Ionicons
                            name={isReady ? "checkmark-circle" : "restaurant-outline"}
                            size={18}
                            color="#FFF"
                          />
                          <Text style={styles.readyBtnText}>{isReady ? "READY" : "MARK READY"}</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <Pressable style={styles.modalDoneBtn} onPress={() => setSelectedOrderId(null)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </Pressable>
            </View>
          </BlurView>
        </Modal>

        {/* HEADER */}
        <View style={styles.topBar}>
          <View style={styles.headerLeftSection}>
            {!isKDSUser && (
              <Pressable onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={22} color={Theme.textPrimary} />
              </Pressable>
            )}
            <View style={styles.logoAndTitle}>
              <Ionicons name="fast-food" size={30} color={Theme.primary} />
              <Text style={styles.screenTitle}>KDS</Text>
            </View>
          </View>

          <View style={styles.headerRightSection}>
            <Text style={styles.totalOrdersCount}>{stats.total} orders</Text>
            {isKDSUser && (
              <TouchableOpacity
                onPress={() => {
                  logout();
                  router.replace("/(tabs)");
                }}
                style={styles.logoutBtn}
              >
                <Ionicons name="log-out-outline" size={20} color={Theme.danger} />
                <Text style={styles.logoutBtnText}>Logout</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* LEGEND BAR */}
        <View style={styles.legendBar}>
          <View style={styles.legendItem}>
            <View style={[styles.statChip, { borderColor: Theme.success + "50" }]}>
              <View style={[styles.statDot, { backgroundColor: Theme.success }]} />
              <Text style={styles.statChipText}>{stats.fresh}</Text>
            </View>
            <Text style={styles.legendText}>0–15m Fresh</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statChip, { borderColor: Theme.warning + "50" }]}>
              <View style={[styles.statDot, { backgroundColor: Theme.warning }]} />
              <Text style={styles.statChipText}>{stats.warn}</Text>
            </View>
            <Text style={styles.legendText}>15–30m Running Long</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statChip, { borderColor: Theme.danger + "50" }]}>
              <View style={[styles.statDot, { backgroundColor: Theme.danger }]} />
              <Text style={styles.statChipText}>{stats.critical}</Text>
            </View>
            <Text style={styles.legendText}>30m+ Overdue</Text>
          </View>
        </View>

        {/* GRID + SCROLL BTNS */}
        <View style={styles.gridRow}>
          <FlatList
            ref={flatListRef}
            data={kitchenOrders}
            renderItem={renderOrder}
            keyExtractor={(item: any) => item.orderId}
            numColumns={numColumns}
            key={numColumns}
            extraData={time}
            contentContainerStyle={styles.listContainer}
            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-circle-outline" size={100} color={Theme.success + "40"} />
                <Text style={styles.emptyText}>All Clear!</Text>
                <Text style={styles.emptySub}>No pending kitchen orders</Text>
              </View>
            }
          />

          {/* SIDE SCROLL BUTTONS */}
          {isWeb && (
            <View style={styles.sideScrollArea}>
              <Pressable style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]} onPress={() => scrollStep("up")}>
                <Ionicons name="chevron-up" size={24} color={Theme.textPrimary} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]} onPress={() => scrollStep("down")}>
                <Ionicons name="chevron-down" size={24} color={Theme.textPrimary} />
              </Pressable>
            </View>
          )}
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1 },

  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 25, paddingVertical: 8,
    backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center",
  },
  logoAndTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  screenTitle: { fontSize: 24, fontFamily: Fonts.black, color: Theme.textPrimary },
  totalOrdersCount: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.textSecondary },

  legendBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 15, paddingVertical: 8,
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1, borderBottomColor: Theme.border,
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textSecondary },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFF", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  statDot: { width: 9, height: 9, borderRadius: 5 },
  statChipText: { fontSize: 15, fontFamily: Fonts.black, color: Theme.textPrimary },

  headerLeftSection: { flexDirection: "row", alignItems: "center", gap: 15 },
  headerRightSection: { flexDirection: "row", alignItems: "center", gap: 20 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.danger + "10",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
  },
  logoutBtnText: {
    color: Theme.danger,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },

  gridRow: { flex: 1, flexDirection: "row", backgroundColor: Theme.bgMain },

  listContainer: { padding: 15, paddingBottom: 80 },
  columnWrapper: { gap: 15 },

  cardContainer: {
    flex: 1, backgroundColor: Theme.bgCard, borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Theme.border, marginBottom: 20, ...Theme.shadowMd,
    minHeight: 150,
  },
  urgencyBar: { height: 6, width: "100%" },
  cardHeader: { padding: 15, paddingBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  tableInfo: { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, flex: 1 },
  timer: { fontSize: 20, fontFamily: Fonts.black },
  orderIdText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 9, fontFamily: Fonts.black },
  divider: { height: 1, backgroundColor: Theme.border, marginHorizontal: 15 },

  itemsScroll: { flex: 1, paddingHorizontal: 15 },
  categorySection: { marginTop: 6 },
  categoryHeader: { fontSize: 10, fontFamily: Fonts.black, color: Theme.primary, marginBottom: 2, letterSpacing: 1 },
  itemRow: { flexDirection: "row", marginBottom: 6, paddingVertical: 2 },
  itemFlash: { backgroundColor: Theme.success + "12", borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  itemReadyFlash: { backgroundColor: Theme.success + "30", borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  itemTextWrap: { flex: 1 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  itemStatusText: { color: "#FFF", fontSize: 9, fontFamily: Fonts.black },
  itemName: { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, lineHeight: 22 },
  itemVoided: { color: Theme.danger, textDecorationLine: "line-through", opacity: 0.6 },
  modifierText: { fontSize: 13, fontFamily: Fonts.medium, color: Theme.textSecondary, marginTop: 1 },

  noteWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    paddingLeft: 4,
  },
  simpleNoteText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.primary,
    fontStyle: "italic",
    flex: 1,
  },

  itemQtyPrefix: { fontSize: 16, fontFamily: Fonts.black, color: Theme.primary },
  qtyPill: { backgroundColor: Theme.primary + "12", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, justifyContent: "center", alignItems: "center" },

  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 150, gap: 20 },
  emptyText: { fontSize: 32, fontFamily: Fonts.black, color: Theme.textPrimary },
  emptySub: { fontSize: 16, fontFamily: Fonts.bold, color: Theme.textMuted },

  sideScrollArea: {
    width: 50,
    backgroundColor: Theme.bgCard,
    borderLeftWidth: 1,
    borderLeftColor: Theme.border,
    paddingVertical: 20,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  sideBtnPressed: { backgroundColor: Theme.border },
  spacer: { flex: 1 },

  floatingMore: {
    position: "absolute",
    bottom: 5,
    alignSelf: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    ...Theme.shadowSm,
    borderWidth: 1,
    borderColor: Theme.border,
    zIndex: 10,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  modalContent: {
    width: "100%",
    maxWidth: 600,
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    ...Theme.shadowLg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 28,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  modalCloseBtn: {
    padding: 5,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
  },
  modalItemsList: {
    maxHeight: 500,
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  modalItemReady: {
    backgroundColor: Theme.success + "08",
  },
  modalItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  modalItemQty: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  modalItemName: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flexShrink: 1,
  },
  modalModifierText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginLeft: 30,
  },
  readyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    justifyContent: "center",
  },
  readyBtnActive: {
    backgroundColor: Theme.success,
  },
  readyBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: Fonts.black,
  },
  modalDoneBtn: {
    backgroundColor: Theme.textPrimary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 20,
  },
  modalDoneText: {
    color: "#FFF",
    fontSize: 18,
    fontFamily: Fonts.black,
  },

  // Takeaway Styles
  takeawayBadge: {
    backgroundColor: Theme.danger,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  takeawayBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
  },
});
