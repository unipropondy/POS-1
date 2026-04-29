import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";
import { API_URL } from "@/constants/Config";

export default function WaiterHistoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        name: searchQuery,
      });
      // Also try to match ID if searchQuery is numeric
      if (!isNaN(Number(searchQuery)) && searchQuery !== "") {
        params.append("serId", searchQuery);
      }

      const res = await fetch(`${API_URL}/api/servers/history?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch (error) {
      console.error("Fetch history error:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderHistoryItem = ({ item }: { item: any }) => (
    <View style={styles.recordCard}>
      <View style={styles.cardHeader}>
        <View style={styles.idBadge}>
          <Text style={styles.idText}>ID: {item.SER_ID}</Text>
        </View>
        <Text style={styles.dateText}>
          {new Date(item.CreatedDate).toLocaleDateString()} {new Date(item.CreatedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      
      <View style={styles.cardBody}>
        <View style={styles.mainInfo}>
          <Text style={styles.waiterName}>{item.SER_NAME}</Text>
          <Text style={styles.orderId}>Order: #{item.OrderId}</Text>
        </View>
        
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Table</Text>
            <Text style={styles.statValue}>{item.TableNo}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Section</Text>
            <Text style={styles.statValue}>{item.Section?.replace("SECTION_", "Sec ")}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circularBack}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Waiter History</Text>
          <TouchableOpacity onPress={fetchHistory} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={20} color={Theme.primary} />
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={styles.filterSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={18} color={Theme.textMuted} />
              <TextInput
                placeholder="Search Name or ID..."
                placeholderTextColor={Theme.textMuted}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={fetchHistory}
              />
            </View>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateInputWrapper}>
              <Text style={styles.dateLabel}>From</Text>
              <TextInput
                style={styles.dateInput}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.dateInputWrapper}>
              <Text style={styles.dateLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <TouchableOpacity style={styles.filterApplyBtn} onPress={fetchHistory}>
              <Ionicons name="filter" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {loading && history.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={Theme.primary} size="large" /></View>
        ) : (
          <FlatList
            data={history}
            renderItem={renderHistoryItem}
            keyExtractor={(item, index) => String(item.ID || index)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={Theme.primary} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="calendar-outline" size={60} color={Theme.textMuted} />
                <Text style={styles.emptyText}>No records found</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, gap: 15 },
  circularBack: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgCard, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  screenTitle: { flex: 1, color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.black },
  refreshBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.primary + "10", justifyContent: "center", alignItems: "center" },
  
  filterSection: { padding: 20, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.bgInput, borderRadius: 12, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: Theme.border },
  searchInput: { flex: 1, marginLeft: 10, color: Theme.textPrimary, fontFamily: Fonts.medium },
  
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  dateInputWrapper: { flex: 1 },
  dateLabel: { fontSize: 10, fontFamily: Fonts.bold, color: Theme.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  dateInput: { height: 44, backgroundColor: Theme.bgInput, borderRadius: 10, paddingHorizontal: 12, color: Theme.textPrimary, fontFamily: Fonts.bold, borderWidth: 1, borderColor: Theme.border },
  filterApplyBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Theme.primary, justifyContent: 'center', alignItems: 'center' },

  listContent: { padding: 20, gap: 15 },
  recordCard: { backgroundColor: Theme.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Theme.bgMain, paddingBottom: 10 },
  idBadge: { backgroundColor: Theme.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  idText: { color: Theme.primary, fontSize: 11, fontFamily: Fonts.bold },
  dateText: { color: Theme.textMuted, fontSize: 11, fontFamily: Fonts.medium },
  
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mainInfo: { flex: 1 },
  waiterName: { color: Theme.textPrimary, fontSize: 16, fontFamily: Fonts.black },
  orderId: { color: Theme.textSecondary, fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  
  statsRow: { flexDirection: 'row', gap: 15 },
  stat: { alignItems: 'flex-end' },
  statLabel: { fontSize: 9, color: Theme.textMuted, fontFamily: Fonts.bold, textTransform: 'uppercase' },
  statValue: { fontSize: 13, color: Theme.textPrimary, fontFamily: Fonts.black },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: Theme.textMuted, fontSize: 16, fontFamily: Fonts.bold, marginTop: 10 },
});
