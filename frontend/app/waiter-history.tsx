import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
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

  const clearFilters = () => {
    setSearchQuery("");
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
    setExpandedId(null);
    fetchHistory();
  };

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [detailedRecords, setDetailedRecords] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [viewingWaiter, setViewingWaiter] = useState<any>(null);

  const fetchWaiterDetails = async (waiter: any) => {
    setViewingWaiter(waiter);
    setDetailsModalVisible(true);
    setLoadingDetails(true);
    try {
      const url = `${API_URL}/api/servers/history?serId=${waiter.SER_ID}&startDate=${startDate}&endDate=${endDate}&detail=true`;
      const res = await fetch(url);
      const data = await res.json();
      setDetailedRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("FETCH DETAILS ERROR:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
    setExpandedId(null);
    fetchHistory();
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
          <LinearGradient
            colors={[Theme.primary, Theme.primary + "CC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarCircle}
          >
            <Text style={styles.avatarLetter}>{item.SER_NAME?.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          
          <View style={styles.mainInfo}>
            <Text style={styles.waiterName}>{item.SER_NAME}</Text>
            <View style={styles.idBadgeMini}>
              <Ionicons name="finger-print" size={10} color={Theme.primary} style={{ marginRight: 4 }} />
              <Text style={styles.idTextMini}>WAIT-{item.SER_ID}</Text>
            </View>
          </View>
          
          <View style={styles.quickStat}>
            <Text style={styles.quickStatValue}>{item.OrderCount}</Text>
            <Text style={styles.quickStatLabel}>Orders</Text>
          </View>

          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-forward"} 
            size={18} 
            color={isExpanded ? Theme.primary : Theme.textMuted} 
            style={{ marginLeft: 10 }}
          />
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Ionicons name="calendar-outline" size={16} color={Theme.textMuted} />
                <View>
                  <Text style={styles.statLabel}>Tracking Period</Text>
                  <Text style={styles.statValueSmall}>{startDate} to {endDate}</Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.viewDetailBtn} 
              activeOpacity={0.8}
              onPress={() => fetchWaiterDetails(item)}
            >
              <LinearGradient
                colors={[Theme.primary, "#4F46E5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBtn}
              >
                <Text style={styles.viewDetailText}>Full Performance Analytics</Text>
                <Ionicons name="analytics-outline" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={["#F8FAFC", "#F1F5F9"]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.circularBack}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>Performance Hub</Text>
              <Text style={styles.screenSubtitle}>Track waiter productivity</Text>
            </View>
            <TouchableOpacity onPress={fetchHistory} style={styles.refreshBtn}>
              <Ionicons name="sync" size={20} color={Theme.primary} />
            </TouchableOpacity>
          </View>

          {/* Premium Filter Panel */}
          <View style={styles.filterSection}>
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrapper}>
                <Ionicons name="search" size={20} color={Theme.primary} />
                <TextInput
                  placeholder="Search Name or ID..."
                  placeholderTextColor={Theme.textMuted}
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={fetchHistory}
                />
                {searchQuery !== "" && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={20} color={Theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.dateRow}>
              <View style={styles.dateInputWrapper}>
                <View style={styles.dateHeader}>
                  <Ionicons name="calendar" size={12} color={Theme.primary} />
                  <Text style={styles.dateLabel}>From Date</Text>
                </View>
                <TextInput
                  style={styles.dateInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              
              <View style={styles.dateInputWrapper}>
                <View style={styles.dateHeader}>
                  <Ionicons name="calendar" size={12} color={Theme.danger} />
                  <Text style={styles.dateLabel}>To Date</Text>
                </View>
                <TextInput
                  style={styles.dateInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>

            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Ionicons name="trash-outline" size={18} color={Theme.danger} />
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.searchBtn} onPress={fetchHistory}>
                <LinearGradient
                  colors={[Theme.primary, "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.searchBtnGradient}
                >
                  <Ionicons name="funnel-outline" size={18} color="#fff" />
                  <Text style={styles.searchBtnText}>Apply Filters</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* List Section */}
          <View style={{ flex: 1 }}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Waiter Summary</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{history.length} Staff</Text>
              </View>
            </View>

            {loading && history.length === 0 ? (
              <View style={styles.center}><ActivityIndicator color={Theme.primary} size="large" /></View>
            ) : (
              <FlatList
                data={history}
                renderItem={renderHistoryItem}
                keyExtractor={(item, index) => String(item.SER_ID || index)}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={Theme.primary} />}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <View style={styles.emptyIconBg}>
                      <Ionicons name="search-outline" size={48} color={Theme.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>No matches found</Text>
                    <Text style={styles.emptySubText}>Try changing your search or date range.</Text>
                  </View>
                }
              />
            )}
          </View>

          {/* Details Modal */}
          <Modal visible={detailsModalVisible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.detailsSheet}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>{viewingWaiter?.SER_NAME}</Text>
                    <Text style={styles.sheetSubtitle}>Detailed Order History</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetailsModalVisible(false)} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color={Theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                {loadingDetails ? (
                  <View style={styles.sheetCenter}><ActivityIndicator color={Theme.primary} size="large" /></View>
                ) : (
                  <FlatList
                    data={detailedRecords}
                    keyExtractor={(item, index) => String(item.ORDER_ID || index)}
                    contentContainerStyle={styles.detailsList}
                    renderItem={({ item }) => (
                      <View style={styles.detailRow}>
                        <View style={styles.detailIcon}>
                          <Ionicons name="receipt" size={18} color={Theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderIdText}>Order #{item.ORDER_ID}</Text>
                          <Text style={styles.dateTimeText}>
                            {new Date(item.CreatedDate).toLocaleDateString()} at {new Date(item.CreatedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{item.ORDER_TYPE || 'POS'}</Text>
                        </View>
                      </View>
                    )}
                    ListEmptyComponent={
                      <View style={styles.sheetCenter}>
                        <Text style={styles.emptyText}>No records found</Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 20, gap: 15 },
  circularBack: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", ...Theme.shadowSm, borderWidth: 1, borderColor: "#E2E8F0" },
  screenTitle: { color: Theme.textPrimary, fontSize: 24, fontFamily: Fonts.black, lineHeight: 28 },
  screenSubtitle: { color: Theme.textMuted, fontSize: 13, fontFamily: Fonts.medium, marginTop: -2 },
  refreshBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Theme.primary + "10", justifyContent: "center", alignItems: "center" },
  
  filterSection: { marginHorizontal: 20, marginBottom: 15, padding: 16, backgroundColor: "#fff", borderRadius: 24, gap: 12, ...Theme.shadowMd, borderWidth: 1, borderColor: "#E2E8F0" },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInputWrapper: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: "#F8FAFC", 
    borderRadius: 14, 
    paddingHorizontal: 15, 
    height: 46, 
    borderWidth: 1, 
    borderColor: "#F1F5F9",
  },
  searchInput: { 
    flex: 1, 
    marginLeft: 10, 
    color: Theme.textPrimary, 
    fontFamily: Fonts.bold, 
    fontSize: 14,
    ...Platform.select({
      web: { outlineStyle: 'none' } as any
    })
  },
  
  dateRow: { flexDirection: 'row', gap: 10 },
  dateInputWrapper: { flex: 1, gap: 4 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  dateLabel: { fontSize: 10, fontFamily: Fonts.black, color: Theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  dateInput: { 
    height: 44, 
    backgroundColor: "#F8FAFC", 
    borderRadius: 12, 
    paddingHorizontal: 15, 
    color: Theme.textPrimary, 
    fontFamily: Fonts.black, 
    fontSize: 13, 
    borderWidth: 1, 
    borderColor: "#F1F5F9" 
  },
  
  filterActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  clearBtn: { 
    flex: 0.3, 
    height: 44, 
    borderRadius: 12, 
    backgroundColor: "#FFF1F2", 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 6, 
    borderWidth: 1, 
    borderColor: "#FECDD3" 
  },
  clearBtnText: { color: "#E11D48", fontSize: 12, fontFamily: Fonts.bold },
  searchBtn: { flex: 0.7, height: 44, borderRadius: 12, overflow: 'hidden' },
  searchBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  searchBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 25, marginBottom: 10 },
  listTitle: { fontSize: 16, fontFamily: Fonts.black, color: Theme.textPrimary },
  countBadge: { backgroundColor: Theme.primary, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: '#fff', fontSize: 10, fontFamily: Fonts.black },

  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  recordCard: { backgroundColor: "#fff", borderRadius: 20, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", ...Theme.shadowSm },
  expandedCard: { borderColor: Theme.primary + "40", backgroundColor: Theme.primary + "02" },
  cardMainRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  avatarLetter: { color: "#fff", fontSize: 18, fontFamily: Fonts.black },
  mainInfo: { flex: 1, marginLeft: 12 },
  waiterName: { color: Theme.textPrimary, fontSize: 16, fontFamily: Fonts.black },
  idBadgeMini: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#F1F5F9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 2 },
  idTextMini: { color: Theme.textSecondary, fontSize: 9, fontFamily: Fonts.bold },
  
  quickStat: { alignItems: 'center', backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: "#F1F5F9" },
  quickStatValue: { fontSize: 15, fontFamily: Fonts.black, color: Theme.primary },
  quickStatLabel: { fontSize: 8, fontFamily: Fonts.bold, color: Theme.textMuted, textTransform: 'uppercase' },

  expandedContent: { marginTop: 12 },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginBottom: 12 },
  statsGrid: { gap: 8, marginBottom: 12 },
  statBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: "#F8FAFC", padding: 12, borderRadius: 14, gap: 10, borderWidth: 1, borderColor: "#F1F5F9" },
  statLabel: { fontSize: 9, color: Theme.textMuted, fontFamily: Fonts.black, textTransform: 'uppercase' },
  statValueSmall: { fontSize: 12, color: Theme.textPrimary, fontFamily: Fonts.black, marginTop: 2 },
  
  viewDetailBtn: { height: 44, borderRadius: 12, overflow: 'hidden' },
  gradientBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewDetailText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  detailsSheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '80%', padding: 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontFamily: Fonts.black, color: Theme.textPrimary },
  sheetSubtitle: { fontSize: 14, fontFamily: Fonts.medium, color: Theme.textMuted },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  sheetCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  detailsList: { paddingBottom: 20, gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 18, gap: 15, borderWidth: 1, borderColor: '#F1F5F9' },
  detailIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Theme.primary + '10', justifyContent: 'center', alignItems: 'center' },
  orderIdText: { fontSize: 16, fontFamily: Fonts.black, color: Theme.textPrimary },
  dateTimeText: { fontSize: 12, fontFamily: Fonts.bold, color: Theme.textMuted, marginTop: 2 },
  badge: { backgroundColor: '#E2E8F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: Fonts.black, color: Theme.textSecondary },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIconBg: { width: 90, height: 90, borderRadius: 30, backgroundColor: "#F1F5F9", justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.black, textAlign: 'center' },
  emptySubText: { color: Theme.textMuted, fontSize: 15, fontFamily: Fonts.medium, textAlign: 'center', marginTop: 8 },
});
