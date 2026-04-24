import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  TouchableOpacity,
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
  fresh:    { primary: Theme.success, label: "ON TRACK",     icon: "checkmark-circle-outline" },
  warn:     { primary: Theme.warning, label: "RUNNING LONG", icon: "time-outline" },
  critical: { primary: Theme.danger,  label: "OVERDUE",      icon: "alert-circle-outline" },
};

// Per-card component so each card can track its own scroll state
function OrderCard({ item, cardHeight, ui, time, pulseAnim, groups }: any) {
  const [hasMore, setHasMore] = useState(false);
  const contentH = useRef(0);
  const viewH = useRef(0);
  const timerOpacity = ui.urgency === "critical" ? pulseAnim : 1;

  const checkMore = () => {
    setHasMore(contentH.current > viewH.current + 5);
  };

  const urgency = ui.urgency;
  const minutes = ui.minutes;
  const seconds = ui.seconds;

  return (
    <View style={[styles.cardContainer, { height: cardHeight }]}>
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
          style={styles.itemsScroll}
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
                <View key={i.lineItemId} style={[styles.itemRow, (time - (i.sentAt || item.createdAt) < 15000) && styles.itemFlash]}>
                  <View style={styles.qtyPill}>
                    <Text style={styles.itemQtyPrefix}>{i.qty}x</Text>
                  </View>
                  
                  <View style={[styles.itemTextWrap, { marginLeft: 10 }]}>
                    <View style={styles.itemTitleRow}>
                      <Text style={[styles.itemName, i.status === "VOIDED" && styles.itemVoided]}>{i.name}</Text>
                      {(i.status === "VOIDED" || time - (i.sentAt || item.createdAt) < 150000) && (
                        <View style={[styles.itemStatusBadge, { backgroundColor: Theme.danger }]}>
                          <Text style={styles.itemStatusText}>{i.status === "VOIDED" ? "VOID" : "NEW"}</Text>
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

        {/* MORE BELOW FLOATING INDICATOR */}
        {hasMore && (
          <View style={styles.floatingMore} pointerEvents="none">
            <Ionicons name="chevron-down" size={16} color={Theme.primary} />
          </View>
        )}
      </View>
    </View>
  );
}

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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const kitchenOrders = useMemo(() => {
    return activeOrders
      .map((order) => {
        const sentItems = order.items.filter((i: any) => i.status === "SENT" || i.status === "VOIDED");
        if (sentItems.length === 0) return null;
        return { ...order, items: sentItems };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
  }, [activeOrders]);

  const numColumns = width > 1400 ? 4 : width > 1000 ? 3 : 2;
  const cardHeight = height * 0.55;

  const stats = useMemo(() => {
    let fresh = 0, warn = 0, critical = 0;
    kitchenOrders.forEach((order: any) => {
      const latestSent = Math.max(...order.items.map((i: any) => i.sentAt || order.createdAt));
      const mins = Math.floor((time - latestSent) / 60000);
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
    const latestSent = Math.max(...item.items.map((i: any) => i.sentAt || item.createdAt));
    const elapsed  = time - latestSent;
    const minutes  = Math.floor(elapsed / 60000);
    const seconds  = Math.floor((elapsed % 60000) / 1000);
    const urgency  = getUrgency(minutes);
    const ui       = URGENCY_UI[urgency];

    const groups: Record<string, OrderItem[]> = {};
    item.items.forEach((i: OrderItem) => {
      const cat = (i.categoryName || "Others").toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(i);
    });

    return (
      <OrderCard
        item={item}
        cardHeight={cardHeight}
        ui={{ ...ui, urgency, minutes, seconds }}
        time={time}
        pulseAnim={pulseAnim}
        groups={groups}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={styles.container}>

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
            contentContainerStyle={styles.listContainer}
            columnWrapperStyle={styles.columnWrapper}
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
          <View style={styles.sideScrollArea}>
            <Pressable style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]} onPress={() => scrollStep("up")}>
              <Ionicons name="chevron-up" size={24} color={Theme.textPrimary} />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]} onPress={() => scrollStep("down")}>
              <Ionicons name="chevron-down" size={24} color={Theme.textPrimary} />
            </Pressable>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: Theme.bgMain },
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
  logoAndTitle:    { flexDirection: "row", alignItems: "center", gap: 10 },
  screenTitle:     { fontSize: 24, fontFamily: Fonts.black, color: Theme.textPrimary },
  totalOrdersCount:{ fontSize: 14, fontFamily: Fonts.bold, color: Theme.textSecondary },

  legendBar: {
    flexDirection: "row", justifyContent: "space-around", alignItems: "center",
    paddingHorizontal: 25, paddingVertical: 6,
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1, borderBottomColor: Theme.border,
  },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 8 },
  legendText:  { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textSecondary },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFF", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  statDot:     { width: 9, height: 9, borderRadius: 5 },
  statChipText:{ fontSize: 15, fontFamily: Fonts.black, color: Theme.textPrimary },

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

  gridRow: { flex: 1, flexDirection: "row" },

  listContainer: { padding: 15, paddingBottom: 80 },
  columnWrapper: { gap: 15 },

  cardContainer: {
    flex: 1, backgroundColor: Theme.bgCard, borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Theme.border, marginBottom: 20, ...Theme.shadowMd,
  },
  urgencyBar:   { height: 6, width: "100%" },
  cardHeader:   { padding: 15, paddingBottom: 10 },
  headerRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  tableInfo:    { fontSize: 20, fontFamily: Fonts.black, color: Theme.textPrimary, flex: 1 },
  timer:        { fontSize: 22, fontFamily: Fonts.black },
  orderIdText:  { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 9, fontFamily: Fonts.black },
  divider:      { height: 1, backgroundColor: Theme.border, marginHorizontal: 15 },

  itemsScroll:   { flex: 1, paddingHorizontal: 15 },
  categorySection:{ marginTop: 6 },
  categoryHeader: { fontSize: 10, fontFamily: Fonts.black, color: Theme.primary, marginBottom: 2, letterSpacing: 1 },
  itemRow:       { flexDirection: "row", marginBottom: 6, paddingVertical: 2 },
  itemFlash:     { backgroundColor: Theme.success + "12", borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  itemTextWrap:  { flex: 1 },
  itemTitleRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemStatusBadge:{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  itemStatusText: { color: "#FFF", fontSize: 9, fontFamily: Fonts.black },
  itemName:      { fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, lineHeight: 22 },
  itemVoided:    { color: Theme.danger, textDecorationLine: "line-through", opacity: 0.6 },
  modifierText:  { fontSize: 13, fontFamily: Fonts.medium, color: Theme.textSecondary, marginTop: 1 },
  
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
  qtyPill:       { backgroundColor: Theme.primary + "12", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, justifyContent: "center", alignItems: "center" },

  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 150, gap: 20 },
  emptyText:     { fontSize: 32, fontFamily: Fonts.black, color: Theme.textPrimary },
  emptySub:      { fontSize: 16, fontFamily: Fonts.bold, color: Theme.textMuted },

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
});
