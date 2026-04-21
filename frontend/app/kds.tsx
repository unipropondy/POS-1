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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useKdsSocket } from "../hooks/useKdsSocket";
import { OrderItem, useActiveOrdersStore } from "../stores/activeOrdersStore";

// ─── Urgency thresholds (minutes) ───────────────────────────────────────────
const URGENCY_FRESH = 15; // 0–15 min  → green
const URGENCY_WARN = 30; // 15–30 min → amber
// > 30 min → red (critical)

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

const URGENCY_UI: Record<
  UrgencyLevel,
  {
    primary: string;
    bg: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  fresh: {
    primary: Theme.success,
    bg: Theme.success + "10",
    label: "ON TRACK",
    icon: "checkmark-circle-outline",
  },
  warn: {
    primary: Theme.warning,
    bg: Theme.warning + "10",
    label: "RUNNING LONG",
    icon: "time-outline",
  },
  critical: {
    primary: Theme.danger,
    bg: Theme.danger + "15",
    label: "OVERDUE",
    icon: "alert-circle-outline",
  },
};

export default function KDSScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);

  // Connect to backend Socket.IO for real-time order updates
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
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const kitchenOrders = useMemo(() => {
    return activeOrders
      .map((order) => {
        const sentItems = order.items.filter(
          (i: any) => i.status === "SENT" || i.status === "VOIDED",
        );
        if (sentItems.length === 0) return null;
        return { ...order, items: sentItems };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
  }, [activeOrders]);

  const numColumns = width > 1400 ? 4 : width > 1000 ? 3 : 2;
  const cardHeight = height * 0.55; // Increased fixed height for better visibility

  const stats = useMemo(() => {
    let fresh = 0,
      warn = 0,
      critical = 0;
    kitchenOrders.forEach((order: any) => {
      const latestSent = Math.max(
        ...order.items.map((i: any) => i.sentAt || order.createdAt),
      );
      const mins = Math.floor((time - latestSent) / 60000);
      const u = getUrgency(mins);
      if (u === "fresh") fresh++;
      else if (u === "warn") warn++;
      else critical++;
    });
    return { fresh, warn, critical, total: kitchenOrders.length };
  }, [kitchenOrders, time]);

  const renderOrder = ({ item }: any) => {
    const latestSent = Math.max(
      ...item.items.map((i: any) => i.sentAt || item.createdAt),
    );
    const elapsed = time - latestSent;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const urgency = getUrgency(minutes);
    const ui = URGENCY_UI[urgency];

    const timerOpacity = urgency === "critical" ? pulseAnim : 1;

    // Group items by categoryName
    const groups: Record<string, OrderItem[]> = {};
    item.items.forEach((i: OrderItem) => {
      const cat = (i.categoryName || "Others").toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(i);
    });

    return (
      <View style={[styles.cardContainer, { height: cardHeight }]}>
        {/* Top Accent Bar */}
        <View style={[styles.urgencyBar, { backgroundColor: ui.primary }]} />

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerRow}>
            <Text style={styles.tableInfo} numberOfLines={1}>
              {item.context.orderType === "DINE_IN"
                ? `${formatSection(item.context.section)} • Table ${item.context.tableNo}`
                : `Takeaway • #${item.context.takeawayNo}`}
            </Text>
            <Animated.Text
              style={[
                styles.timer,
                { color: ui.primary, opacity: timerOpacity },
              ]}
            >
              {minutes}:{seconds.toString().padStart(2, "0")}
            </Animated.Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.orderIdText}>#{item.orderId}</Text>
            <View
              style={[styles.statusBadge, { borderColor: ui.primary + "40" }]}
            >
              <Ionicons name={ui.icon} size={10} color={ui.primary} />
              <Text style={[styles.statusBadgeText, { color: ui.primary }]}>
                {ui.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Scrollable Items */}
        <ScrollView
          style={styles.itemsScroll}
          showsVerticalScrollIndicator={false}
        >
          {Object.entries(groups).map(([catName, items]) => (
            <View key={catName} style={styles.categorySection}>
              <Text style={styles.categoryHeader}>{catName}</Text>
              {items.map((i: any) => {
                const sentTime = i.sentAt || item.createdAt;
                const isFlash = time - sentTime < 15000; // 15s flash for new arrivals

                return (
                  <View
                    key={i.lineItemId}
                    style={[styles.itemRow, isFlash && styles.itemFlash]}
                  >
                    <View style={styles.itemTextWrap}>
                      <View style={styles.itemTitleRow}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flex: 1,
                            gap: 10,
                          }}
                        >
                          <View style={styles.qtyPill}>
                            <Text style={styles.itemQtyPrefix}>{i.qty}x</Text>
                          </View>
                          <Text
                            style={[
                              styles.itemName,
                              i.status === "VOIDED" && styles.itemVoided,
                            ]}
                          >
                            {i.name}
                          </Text>
                        </View>
                        {i.status === "VOIDED" ||
                        time - (i.sentAt || item.createdAt) < 150000 ? (
                          <View
                            style={[
                              styles.itemStatusBadge,
                              { backgroundColor: Theme.danger },
                            ]}
                          >
                            <Text style={styles.itemStatusText}>
                              {i.status === "VOIDED" ? "VOID" : "NEW"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {i.modifiers &&
                        i.modifiers.length > 0 &&
                        i.modifiers.map((mod: any, idx: number) => (
                          <Text key={idx} style={styles.modifierText}>
                            • {mod.ModifierName}
                          </Text>
                        ))}
                      {(i.note || i.notes) && (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>
                            📝 {i.note || i.notes}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={styles.container}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Theme.textPrimary} />
          </Pressable>

          <View style={styles.logoAndTitle}>
            <Text style={styles.screenTitle}>KDS</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.success }]}
              />
              <Text style={styles.statChipText}>{stats.fresh}</Text>
            </View>
            <View style={styles.statChip}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.warning }]}
              />
              <Text style={styles.statChipText}>{stats.warn}</Text>
            </View>
            <View style={styles.statChip}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.danger }]}
              />
              <Text style={styles.statChipText}>{stats.critical}</Text>
            </View>
            <Text style={styles.totalOrdersCount}>{stats.total} orders</Text>
          </View>
        </View>

        {/* LEGEND BAR */}
        <View style={styles.legendBar}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.success }]}
            />
            <Text style={styles.legendText}>0–15m Fresh</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.warning }]}
            />
            <Text style={styles.legendText}>15–30m Running Long</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.danger }]}
            />
            <Text style={styles.legendText}>30m+ Overdue</Text>
          </View>
        </View>

        <FlatList
          data={kitchenOrders}
          renderItem={renderOrder}
          keyExtractor={(item: any) => item.orderId}
          numColumns={numColumns}
          key={numColumns}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="checkmark-circle-outline"
                size={100}
                color={Theme.success + "40"}
              />
              <Text style={styles.emptyText}>All Clear!</Text>
              <Text style={styles.emptySub}>No pending kitchen orders</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1 },

  // TOP BAR
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 25,
    paddingVertical: 15,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  logoAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
  },
  screenTitle: {
    fontSize: 24,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.bgMuted,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statDot: { width: 10, height: 10, borderRadius: 5 },
  statChipText: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  totalOrdersCount: {
    marginLeft: 10,
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },

  // LEGEND BAR
  legendBar: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },

  // LIST
  listContainer: { padding: 15, paddingBottom: 50 },
  columnWrapper: { gap: 15 },

  // CARD
  cardContainer: {
    flex: 1,
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.border,
    marginBottom: 20, // Added vertical space between rows
    ...Theme.shadowMd,
  },
  urgencyBar: {
    height: 6,
    width: "100%",
  },
  cardHeader: {
    padding: 15,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  tableInfo: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    flex: 1,
  },
  timer: {
    fontSize: 24,
    fontFamily: Fonts.black,
  },
  orderIdText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.black,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.border,
    marginHorizontal: 15,
  },

  // ITEMS
  itemsScroll: {
    flex: 1,
    paddingHorizontal: 15,
  },
  categorySection: {
    marginTop: 4,
    marginBottom: 0,
  },
  categoryHeader: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginBottom: 2,
    letterSpacing: 1,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    borderRadius: 8,
  },
  itemFlash: {
    backgroundColor: Theme.success + "15",
    padding: 4,
    marginHorizontal: -4,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  itemStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemStatusText: {
    color: "#FFF",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  itemName: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    lineHeight: 22,
  },
  itemVoided: {
    color: Theme.danger,
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  modifierText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginTop: 2,
    marginLeft: 0,
  },
  noteBox: {
    marginTop: 6,
    padding: 6,
    borderRadius: 6,
    backgroundColor: Theme.primary + "08",
    borderLeftWidth: 2,
    borderLeftColor: Theme.primary,
  },
  noteText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    fontStyle: "italic",
  },
  itemQtyPrefix: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  qtyPill: {
    backgroundColor: Theme.primary + "12",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  // EMPTY
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 150,
    gap: 20,
  },
  emptyText: {
    fontSize: 32,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  emptySub: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
});
