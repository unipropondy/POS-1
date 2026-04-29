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

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        name: searchQuery,
      });
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

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderHistoryItem = ({ item }: { item: any }) => {
    const isExpanded = expandedId === item.SER_ID;
    
    return (
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => toggleExpand(item.SER_ID)}
        style={[styles.recordCard, isExpanded && styles.expandedCard]}
      >
        <View style={styles.cardMainRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{item.SER_NAME?.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.mainInfo}>
            <Text style={styles.waiterName}>{item.SER_NAME}</Text>
            <View style={styles.idBadgeMini}>
              <Text style={styles.idTextMini}>ID: {item.SER_ID}</Text>
            </View>
          </View>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color={Theme.textMuted} 
          />
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Orders</Text>
                <Text style={styles.statValue}>{item.OrderCount}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Period</Text>
                <Text style={styles.statValueSmall}>{startDate} to {endDate}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.viewDetailBtn}>
              <Text style={styles.viewDetailText}>View Performance Report</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circularBack}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Waiter Performance</Text>
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
              <Text style={styles.dateLabel}>Start Date</Text>
              <TextInput
                style={styles.dateInput}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.dateInputWrapper}>
              <Text style={styles.dateLabel}>End Date</Text>
              <TextInput
                style={styles.dateInput}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <TouchableOpacity style={styles.filterApplyBtn} onPress={fetchHistory}>
              <Ionicons name="options-outline" size={20} color="#fff" />
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
            keyExtractor={(item, index) => String(item.SER_ID || index)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={Theme.primary} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="people-outline" size={40} color={Theme.textMuted} />
                </View>
                <Text style={styles.emptyText}>No waiters found for this period</Text>
                <Text style={styles.emptySubText}>Try adjusting your date filters or search query.</Text>
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
  
  filterSection: { margin: 20, padding: 20, backgroundColor: Theme.bgCard, borderRadius: 24, gap: 15, ...Theme.shadowMd, borderWidth: 1, borderColor: Theme.border },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.bgInput, borderRadius: 14, paddingHorizontal: 12, height: 50, borderWidth: 1, borderColor: Theme.border },
  searchInput: { flex: 1, marginLeft: 10, color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14 },
  
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  dateInputWrapper: { flex: 1 },
  dateLabel: { fontSize: 10, fontFamily: Fonts.black, color: Theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateInput: { height: 46, backgroundColor: Theme.bgInput, borderRadius: 12, paddingHorizontal: 12, color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 13, borderWidth: 1, borderColor: Theme.border },
  filterApplyBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: Theme.primary, justifyContent: 'center', alignItems: 'center', ...Theme.shadowSm },

  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  recordCard: { backgroundColor: Theme.bgCard, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  expandedCard: { borderColor: Theme.primary + "50", ...Theme.shadowMd },
  cardMainRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  avatarCircle: { width: 54, height: 54, borderRadius: 18, backgroundColor: Theme.primary + "08", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.primary + "15" },
  avatarLetter: { color: Theme.primary, fontSize: 22, fontFamily: Fonts.black },
  mainInfo: { flex: 1 },
  waiterName: { color: Theme.textPrimary, fontSize: 18, fontFamily: Fonts.black },
  idBadgeMini: { backgroundColor: Theme.bgMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  idTextMini: { color: Theme.textSecondary, fontSize: 11, fontFamily: Fonts.bold },
  
  expandedContent: { marginTop: 15 },
  divider: { height: 1, backgroundColor: Theme.border, marginBottom: 15, opacity: 0.5 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  statBox: { flex: 1, backgroundColor: Theme.bgInput, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: Theme.border },
  statLabel: { fontSize: 10, color: Theme.textMuted, fontFamily: Fonts.black, textTransform: 'uppercase', marginBottom: 5 },
  statValue: { fontSize: 24, color: Theme.primary, fontFamily: Fonts.black },
  statValueSmall: { fontSize: 12, color: Theme.textPrimary, fontFamily: Fonts.bold },
  
  viewDetailBtn: { backgroundColor: Theme.primary, height: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewDetailText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: Theme.bgMuted, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { color: Theme.textPrimary, fontSize: 18, fontFamily: Fonts.black, textAlign: 'center' },
  emptySubText: { color: Theme.textMuted, fontSize: 14, fontFamily: Fonts.medium, textAlign: 'center', marginTop: 8 },
});
