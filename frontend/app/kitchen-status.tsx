import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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

  useKdsSocket();

  React.useEffect(() => {
    useActiveOrdersStore.getState().fetchActiveKitchenOrders();
  }, []);

  const groupedOrders = useMemo(() => {
    return activeOrders
      .map((order) => {
        const relevantItems = order.items.filter(
          (i: any) => i.status === "SENT" || i.status === "READY"
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
            <Text style={styles.itemName}>{item.name}</Text>
            {item.isTakeaway && (
              <View style={styles.takeawayBadge}>
                <Text style={styles.takeawayBadgeText}>TAKEAWAY</Text>
              </View>
            )}
          </View>
          {item.modifiers?.map((m: any, idx: number) => (
            <Text key={idx} style={styles.modifierText}>• {m.ModifierName}</Text>
          ))}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={[styles.statusBadge, isReady ? styles.statusBadgeReady : styles.statusBadgePrep]}>
            <Ionicons 
              name={isReady ? "checkmark-circle" : "time-outline"} 
              size={14} 
              color="#FFF" 
            />
            <Text style={styles.statusBadgeText}>
              {isReady ? "READY" : "PREPARING"}
            </Text>
          </View>

          {isReady && (
            <Pressable 
              style={styles.servedBtn}
              onPress={() => markItemServed(orderId, item.lineItemId)}
            >
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

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.tableNumber}>
              {item.context.orderType === "DINE_IN"
                ? `Table ${item.context.tableNo}`
                : `Takeaway #${item.context.takeawayNo}`}
            </Text>
            <Text style={styles.orderId}>Order #{item.orderId}</Text>
          </View>
          <View style={styles.orderStats}>
            <Text style={styles.statsText}>{readyCount}/{totalCount} Ready</Text>
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
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Kitchen Status</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={groupedOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item: any) => item?.orderId || Math.random().toString()}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={80} color={Theme.border} />
            <Text style={styles.emptyText}>No orders in kitchen</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  backBtn: {
    padding: 8,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  list: { padding: 10, paddingBottom: 40 },
  columnWrapper: { gap: 15 },
  orderCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: "hidden",
    ...Theme.shadowSm,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  tableNumber: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  orderId: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
  orderStats: {
    backgroundColor: Theme.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statsText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  itemsContainer: { padding: 15 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border + "50",
  },
  itemReadyRow: {
    backgroundColor: Theme.success + "05",
  },
  itemMain: { flex: 1, marginRight: 10 },
  itemTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemQty: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  itemName: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  modifierText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginLeft: 32,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: "center",
  },
  statusBadgePrep: { backgroundColor: Theme.info },
  statusBadgeReady: { backgroundColor: Theme.success },
  statusBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontFamily: Fonts.black,
  },
  servedBtn: {
    backgroundColor: Theme.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  servedBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: Fonts.black,
  },
  takeawayBadge: {
    backgroundColor: Theme.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  takeawayBadgeText: {
    color: "#FFF",
    fontSize: 8,
    fontFamily: Fonts.black,
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: "center",
    gap: 20,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Theme.textMuted,
  },
});
