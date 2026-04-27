import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
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
import { useActiveOrdersStore } from "../stores/activeOrdersStore";
import { useKdsSocket } from "../hooks/useKdsSocket";

export default function KitchenStatusScreen() {
  const router = useRouter();
  const activeOrders = useActiveOrdersStore((s) => s.activeOrders);
  const markItemServed = useActiveOrdersStore((s) => s.markItemServed);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useKdsSocket();

  React.useEffect(() => {
    useActiveOrdersStore.getState().fetchActiveKitchenOrders();
  }, []);

  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatElapsedTime = (createdAt: any) => {
    if (!createdAt) return "0s ago";
    const start = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
    const seconds = Math.floor((now - start) / 1000);
    
    if (seconds < 0) return "0s ago"; // Handle slight clock drifts
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s ago`;
  };

  const groupedOrders = useMemo(() => {
    return activeOrders
      .map((order) => {
        const relevantItems = order.items.filter(
          (i: any) => i.status === "SENT" || i.status === "READY" || i.status === "VOIDED"
        );
        if (relevantItems.length === 0) return null;
        return { ...order, items: relevantItems };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
  }, [activeOrders]);

  const renderOrderItem = (orderId: string, item: any) => {
    const isReady = item.status === "READY";
    return (
      <View key={item.lineItemId} style={[styles.itemRow, isReady && styles.itemReadyRow]}>
        <View style={styles.itemMain}>
          <View style={styles.itemTitle}>
            <Text style={styles.itemQty}>{item.qty}x</Text>
            <Text style={[styles.itemName, item.status === "VOIDED" && styles.strikeThrough]}>{item.name}</Text>
            {item.isTakeaway && (
              <View style={styles.takeawayBadge}>
                <Ionicons name="bag-handle" size={10} color="#FFF" />
                <Text style={styles.takeawayBadgeText}>TAKEAWAY</Text>
              </View>
            )}
          </View>
          {item.modifiers?.map((m: any, idx: number) => (
            <Text key={idx} style={styles.modifierText}>• {m.ModifierName}</Text>
          ))}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.statusBadge, isReady ? styles.statusBadgeReady : styles.statusBadgePrep]}>
            <Ionicons 
              name={isReady ? "notifications" : "restaurant"} 
              size={12} 
              color="#FFF" 
            />
            <Text style={styles.statusBadgeText}>
              {isReady ? "READY" : "COOKING"}
            </Text>
          </View>

          {isReady && (
            <Pressable 
              style={({ pressed }) => [
                styles.servedBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }
              ]}
              onPress={() => markItemServed(orderId, item.lineItemId)}
            >
              <Ionicons name="checkmark-done-circle" size={16} color="#FFF" />
              <Text style={styles.servedBtnText}>SERVED</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderOrderCard = ({ item }: { item: any }) => {
    const readyCount = item.items.filter((i: any) => i.status === "READY").length;
    const totalCount = item.items.length;
    const isDineIn = item.context.orderType === "DINE_IN";

    return (
      <View style={styles.orderCard}>
        <View style={[styles.orderHeader, isDineIn ? styles.headerDineIn : styles.headerTakeaway]}>
          <View style={styles.headerInfo}>
            <View style={styles.iconCircle}>
              <Ionicons 
                name={isDineIn ? "restaurant" : "bag-handle"} 
                size={18} 
                color={isDineIn ? Theme.primary : Theme.warning} 
              />
            </View>
            <View>
              <Text style={styles.tableNumber}>
                {isDineIn ? `Table ${item.context.tableNo}` : `Order #${item.context.takeawayNo}`}
              </Text>
              <Text style={styles.orderId}>#{item.orderId.slice(-6)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.orderTime}>{formatElapsedTime(item.createdAt)}</Text>
            <View style={styles.orderStats}>
              <Text style={styles.statsText}>{readyCount}/{totalCount} READY</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemsContainer}>
          {item.items.map((i: any) => renderOrderItem(item.orderId, i))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
        </Pressable>
        <View style={styles.titleContainer}>
          <Ionicons name="clipboard" size={20} color={Theme.primary} />
          <Text style={styles.title}>Kitchen Status</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={groupedOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item: any) => item?.orderId || Math.random().toString()}
        numColumns={isLandscape ? 3 : 2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="restaurant-outline" size={60} color={Theme.textMuted} />
            </View>
            <Text style={styles.emptyText}>All orders served! 🎉</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F0EBE3" }, // Warm Stone background to match Theme.bgMuted
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bgNav,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  list: { padding: 16, paddingBottom: 60 },
  columnWrapper: { gap: 16 },
  orderCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    ...Theme.shadowMd,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "50",
  },
  headerDineIn: { backgroundColor: "#F0F9FF" }, // Soft Blue
  headerTakeaway: { backgroundColor: "#FFFBEB" }, // Soft Amber
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...Theme.shadowSm,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  tableNumber: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  orderId: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    letterSpacing: 0.5,
  },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  orderTime: {
    fontSize: 12,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  orderStats: {
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  statsText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textSecondary,
  },
  itemsContainer: { padding: 16 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "50",
  },
  itemReadyRow: {
    backgroundColor: "#F0FDF4",
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  itemMain: { flex: 1, marginRight: 12 },
  itemTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemQty: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  itemName: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
    flex: 1,
  },
  strikeThrough: {
    textDecorationLine: 'line-through',
    opacity: 0.4,
  },
  modifierText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginLeft: 34,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    minWidth: 90,
    justifyContent: "center",
  },
  statusBadgePrep: { backgroundColor: "#3B82F6" },
  statusBadgeReady: { backgroundColor: "#22C55E" },
  statusBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: Fonts.black,
    letterSpacing: 0.5,
  },
  servedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary, // Brand Orange
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...Theme.shadowSm,
  },
  servedBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: Fonts.black,
    letterSpacing: 0.5,
  },
  takeawayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  takeawayBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontFamily: Fonts.black,
  },
  emptyContainer: {
    marginTop: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    ...Theme.shadowMd,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
});
