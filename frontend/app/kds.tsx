import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";

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

const URGENCY_COLORS: Record<
  UrgencyLevel,
  {
    timer: string;
    border: string;
    bg: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  fresh: {
    timer: Theme.success,
    border: Theme.success + "40",
    bg: Theme.success + "10",
    label: "On Track",
    icon: "checkmark-circle-outline",
  },
  warn: {
    timer: Theme.warning,
    border: Theme.warning + "40",
    bg: Theme.warning + "10",
    label: "Running Long",
    icon: "time-outline",
  },
  critical: {
    timer: Theme.danger,
    border: Theme.danger + "50",
    bg: Theme.danger + "15",
    label: "Overdue!",
    icon: "alert-circle-outline",
  },
};

export default function KDSScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 500;
  const isMobile = !isTablet;
  const router = useRouter();
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);

  const [time, setTime] = useState(Date.now());
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.15,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
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

  const numColumns = isTablet 
    ? (width > 1400 ? 4 : width > 1000 ? 3 : 2)
    : (isLandscape ? 2 : 1);

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
    const uc = URGENCY_COLORS[urgency];

    const timerOpacity = urgency === "critical" ? pulseAnim : 1;

    return (
      <View
        style={[
          styles.cardOuter,
          { borderColor: uc.border, backgroundColor: Theme.bgCard },
        ]}
      >
        <View style={[styles.urgencyBar, { backgroundColor: uc.timer }, isMobile && isLandscape && { height: 4 }]} />
        <View style={[styles.cardInner, isMobile && isLandscape && { padding: 12 }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={[styles.table, isMobile && isLandscape && { fontSize: 18 }]}>
                {item.context.orderType === "DINE_IN"
                  ? `${formatSection(item.context.section || "T1")} • Table ${item.context.tableNo}`
                  : `Takeaway • #${item.context.takeawayNo}`}
              </Text>
              <Text style={[styles.orderId, isMobile && isLandscape && { fontSize: 11, marginTop: 2 }]}>#{item.orderId}</Text>
            </View>

            <View style={styles.timerBlock}>
              <Animated.Text
                style={[
                  styles.timer,
                  { color: uc.timer, opacity: timerOpacity },
                ]}
              >
                {minutes}:{seconds.toString().padStart(2, "0")}
              </Animated.Text>
              <View style={[styles.urgencyPill, { borderColor: uc.border }, isMobile && isLandscape && { paddingVertical: 1, paddingHorizontal: 6 }]}>
                <Ionicons name={uc.icon} size={isMobile && isLandscape ? 10 : 11} color={uc.timer} />
                <Text style={[styles.urgencyLabel, { color: uc.timer }, isMobile && isLandscape && { fontSize: 9 }]}>
                  {uc.label}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {item.items.map((i: any) => {
            const sentTime = i.sentAt || item.createdAt;
            const elapsedItem = time - sentTime;
            const isNew = i.sentAt && elapsedItem < 300000;

            return (
              <View key={i.lineItemId} style={[styles.itemBlock, isMobile && isLandscape && { marginBottom: 6 }]}>
                <View style={styles.itemRow}>
                  <View style={[styles.itemQtyWrap, isMobile && isLandscape && { paddingVertical: 2, paddingHorizontal: 6 }]}>
                    <Text style={[styles.itemQty, isMobile && isLandscape && { fontSize: 12 }]}>{i.qty}×</Text>
                  </View>
                  <Text
                    style={[
                      styles.itemText,
                      i.status === "VOIDED" && styles.itemVoidedText,
                      isMobile && isLandscape && { fontSize: 14 }
                    ]}
                    numberOfLines={2}
                  >
                    {i.name}
                  </Text>
                  {i.status === "VOIDED" && (
                    <View style={styles.voidBadge}>
                      <Text style={styles.voidBadgeText}>CANCELLED</Text>
                    </View>
                  )}
                  {i.isTakeaway && i.status !== "VOIDED" && (
                    <View style={styles.twBadge}>
                      <Text style={styles.twBadgeText}>TAKE AWAY</Text>
                    </View>
                  )}
                  {isNew && (
                    <Animated.View
                      style={[styles.newBadge, { opacity: blinkAnim }]}
                    >
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </Animated.View>
                  )}
                </View>

                {i.spicy && i.spicy !== "Medium" && (
                  <Text style={styles.modifier}>🌶 Spicy: {i.spicy}</Text>
                )}
                {i.oil && i.oil !== "Normal" && (
                  <Text style={styles.modifier}>🫙 Oil: {i.oil}</Text>
                )}
                {i.salt && i.salt !== "Normal" && (
                  <Text style={styles.modifier}>🧂 Salt: {i.salt}</Text>
                )}
                {i.sugar && i.sugar !== "Normal" && (
                  <Text style={styles.modifier}>🍬 Sugar: {i.sugar}</Text>
                )}
                {(i.note || i.notes) && (
                  <Text style={styles.noteTextKDS}>📝 {i.note || i.notes}</Text>
                )}
                {i.modifiers &&
                  Array.isArray(i.modifiers) &&
                  i.modifiers.map((mod: any, idx: number) => (
                    <Text key={`mod-${idx}`} style={styles.modifier}>
                      + {mod.ModifierName}
                    </Text>
                  ))}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        {/* TOP BAR */}
        <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
          <Pressable 
            style={[styles.backBtn, isMobile && styles.backBtnMobile]} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={Theme.textPrimary} />
          </Pressable>

          <View style={[styles.titleBlock, isMobile && styles.titleBlockMobile]}>
            <Ionicons
              name="fast-food-outline"
              size={isMobile ? 18 : 22}
              color={Theme.primary}
            />
            <Text style={[styles.screenTitle, isMobile && styles.screenTitleMobile]}>
              KDS
            </Text>
          </View>

          <View style={[styles.statsRow, isMobile && styles.statsRowMobile]}>
            <View style={[styles.statChip, isMobile && styles.statChipMobile]}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.success }]}
              />
              <Text style={styles.statText}>{stats.fresh}</Text>
            </View>
            <View style={[styles.statChip, isMobile && styles.statChipMobile]}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.warning }]}
              />
              <Text style={styles.statText}>{stats.warn}</Text>
            </View>
            <View style={[styles.statChip, isMobile && styles.statChipMobile]}>
              <View
                style={[styles.statDot, { backgroundColor: Theme.danger }]}
              />
              <Text style={styles.statText}>{stats.critical}</Text>
            </View>
            {!isMobile && <Text style={styles.statTotal}>{stats.total} orders</Text>}
          </View>
        </View>

        {/* LEGEND */}
        <View style={[styles.legend, isMobile && styles.legendMobile]}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.success }]}
            />
            <Text style={styles.legendText}>0–{URGENCY_FRESH}m Fresh</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.warning }]}
            />
            <Text style={styles.legendText}>
              {URGENCY_FRESH}–{URGENCY_WARN}m{isMobile ? "" : " Running Long"}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Theme.danger }]}
            />
            <Text style={styles.legendText}>{URGENCY_WARN}m+ Overdue</Text>
          </View>
        </View>

        <FlatList
          key={numColumns}
          data={kitchenOrders}
          renderItem={renderOrder}
          keyExtractor={(item: any) => item.orderId}
          numColumns={numColumns}
          contentContainerStyle={styles.list}
          columnWrapperStyle={numColumns > 1 ? { gap: 0 } : undefined}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="checkmark-circle-outline"
                size={80}
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
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 18,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    minHeight: 80,
    ...Theme.shadowSm,
  },
  backBtn: {
    position: "absolute",
    left: 25,
    backgroundColor: Theme.bgMuted,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backText: { color: Theme.textPrimary, fontSize: 14, fontFamily: Fonts.bold },
  titleBlock: { flexDirection: "row", alignItems: "center", gap: 10 },
  screenTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 22,
  },
  statsRow: {
    position: "absolute",
    right: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 14 },
  statTotal: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 13,
    marginLeft: 5,
  },
  legend: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.bgMain,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 11,
  },
  topBarMobile: {
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 12,
    minHeight: 64,
  },
  backBtnMobile: {
    position: "relative",
    left: 0,
    width: 38,
    height: 38,
  },
  titleBlockMobile: {
    gap: 6,
  },
  screenTitleMobile: {
    fontSize: 18,
  },
  statsRowMobile: {
    position: "relative",
    right: 0,
    gap: 4,
  },
  statChipMobile: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  legendMobile: {
    paddingHorizontal: 15,
    gap: 12,
    flexWrap: "wrap",
  },
  list: { padding: 15, paddingBottom: 50 },
  cardOuter: {
    flex: 1,
    margin: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: "hidden",
    minHeight: 220,
    ...Theme.shadowMd,
  },
  urgencyBar: { height: 8, width: "100%" },
  cardInner: { flex: 1, padding: 20 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  cardHeaderLeft: { flex: 1 },
  table: { color: Theme.textPrimary, fontSize: 24, fontFamily: Fonts.black },
  orderId: {
    color: Theme.textMuted,
    marginTop: 4,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  timerBlock: { alignItems: "flex-end", gap: 6 },
  timer: { fontSize: 24, fontFamily: Fonts.black, letterSpacing: 1 },
  urgencyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.bgMuted,
  },
  urgencyLabel: {
    fontFamily: Fonts.black,
    fontSize: 10,
    textTransform: "uppercase",
  },
  divider: { height: 1.5, backgroundColor: Theme.border, marginVertical: 15 },
  itemBlock: { marginBottom: 12 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemQtyWrap: {
    backgroundColor: Theme.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemQty: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 14 },
  itemText: {
    color: Theme.textPrimary,
    fontSize: 18,
    fontFamily: Fonts.black,
    flex: 1,
  },
  newBadge: {
    backgroundColor: Theme.danger,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: { color: "#fff", fontFamily: Fonts.black, fontSize: 10 },
  modifier: {
    color: Theme.textSecondary,
    fontSize: 14,
    marginLeft: 32,
    marginTop: 4,
    fontFamily: Fonts.medium,
  },
  noteTextKDS: {
    color: Theme.primary,
    fontSize: 15,
    marginLeft: 32,
    marginTop: 6,
    fontFamily: Fonts.black,
    fontStyle: 'italic',
  },
  emptyContainer: { alignItems: "center", marginTop: 200, gap: 15 },
  emptyText: {
    color: Theme.textPrimary,
    fontSize: 32,
    fontFamily: Fonts.black,
  },
  emptySub: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 16 },
  twBadge: {
    backgroundColor: Theme.danger + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: Theme.danger + "30",
  },
  twBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.danger,
  },
  itemVoidedText: {
    color: Theme.danger,
    textDecorationLine: "line-through",
    opacity: 0.8,
  },
  voidBadge: {
    backgroundColor: Theme.danger,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  voidBadgeText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 10,
    textTransform: "uppercase",
  },
});
