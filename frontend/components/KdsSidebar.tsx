import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Animated,
} from "react-native";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useActiveOrdersStore } from "../stores/activeOrdersStore";

const URGENCY_FRESH = 15;
const URGENCY_WARN = 30;

type UrgencyLevel = "fresh" | "warn" | "critical";

function getUrgency(minutes: number): UrgencyLevel {
  if (minutes < URGENCY_FRESH) return "fresh";
  if (minutes < URGENCY_WARN) return "warn";
  return "critical";
}

const URGENCY_UI: Record<UrgencyLevel, { primary: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  fresh: { primary: Theme.success, label: "ON TRACK", icon: "checkmark-circle-outline" },
  warn: { primary: Theme.warning, label: "RUNNING LONG", icon: "time-outline" },
  critical: { primary: Theme.danger, label: "OVERDUE", icon: "alert-circle-outline" },
};

function OrderCard({ item, ui, time }: any) {
  return (
    <View style={styles.cardContainer}>
      <View style={[styles.urgencyBar, { backgroundColor: ui.primary }]} />
      <View style={styles.cardHeader}>
        <View style={styles.headerRow}>
          <Text style={styles.tableInfo} numberOfLines={1}>
             Table {item.context.tableNo}
          </Text>
          <Text style={[styles.timer, { color: ui.primary }]}>
            {ui.minutes}:{ui.seconds.toString().padStart(2, "0")}
          </Text>
        </View>
        <Text style={styles.orderIdText}>#{item.orderId}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.itemsList}>
        {item.items.map((it: any, idx: number) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemQty}>{it.qty}x</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
              {it.modifiers && it.modifiers.length > 0 && (
                <Text style={styles.itemMods} numberOfLines={1}>
                  {it.modifiers.map((m: any) => `+ ${m.ModifierName}`).join(", ")}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function KdsSidebar({ width, currentTableNo }: { width: number, currentTableNo?: string }) {
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ordersWithTime = useMemo(() => {
    // Filter orders if currentTableNo is provided, otherwise show all active
    const filtered = currentTableNo 
      ? activeOrders.filter(o => o.context.tableNo === currentTableNo)
      : activeOrders;

    return filtered.map((order) => {
      const elapsedMs = now - order.createdAt;
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const urgency = getUrgency(minutes);

      return {
        ...order,
        ui: {
          ...URGENCY_UI[urgency],
          urgency,
          minutes,
          seconds,
        },
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [activeOrders, now, currentTableNo]);

  return (
    <View style={[styles.container, { width }]}>
      <View style={styles.header}>
        <Ionicons name="restaurant-outline" size={20} color={Theme.primary} />
        <Text style={styles.headerTitle}>Kitchen Status</Text>
      </View>
      
      {ordersWithTime.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={40} color={Theme.textMuted} />
          <Text style={styles.emptyText}>No active orders for this table</Text>
        </View>
      ) : (
        <FlatList
          data={ordersWithTime}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => (
            <OrderCard item={item} ui={item.ui} />
          )}
          contentContainerStyle={styles.listPadding}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "100%",
    backgroundColor: "#F8FAFC",
    borderRightWidth: 1,
    borderRightColor: Theme.border,
  },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: "#fff",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  listPadding: {
    padding: 12,
    gap: 12,
  },
  cardContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  urgencyBar: {
    height: 4,
    width: "100%",
  },
  cardHeader: {
    padding: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tableInfo: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  timer: {
    fontSize: 13,
    fontFamily: Fonts.black,
  },
  orderIdText: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.border,
  },
  itemsList: {
    padding: 10,
    gap: 6,
  },
  itemRow: {
    flexDirection: "row",
    gap: 8,
  },
  itemQty: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.primary,
    minWidth: 20,
  },
  itemName: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  itemMods: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 14,
    color: Theme.textMuted,
    fontFamily: Fonts.medium,
  },
});
