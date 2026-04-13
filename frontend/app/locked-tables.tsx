import { API_URL } from "@/constants/Config";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { setOrderContext } from "../stores/orderContextStore";
import { useTableStatusStore } from "../stores/tableStatusStore";

const { width: SCREEN_W } = Dimensions.get("window");

type TableType = {
  tableId: string;
  tableNumber: string;
  isLocked?: boolean;
  diningSection?: number;
};

const SECTIONS = ["SECTION_1", "SECTION_2", "SECTION_3", "TAKEAWAY"];
const SECTION_LABELS: Record<string, string> = {
  SECTION_1: "Section 1",
  SECTION_2: "Section 2",
  SECTION_3: "Section 3",
  TAKEAWAY: "Takeaway",
};

// --- MOBILE SOLID COLORS ---
const SOLID_LIGHT_GREEN = '#F0FDF4'; 
const SOLID_LIGHT_AMBER = '#FFFBEB';
const SOLID_LIGHT_RED   = '#FEF2F2';

export default function LockedTablesScreen() {
  const router = useRouter();
  const IS_MOBILE = Platform.OS !== 'web';
  const [lockedTables, setLockedTables] = useState<TableType[]>([]);
  const [allTables, setAllTables] = useState<TableType[]>([]);
  const [activeSection, setActiveSection] = useState<string>("SECTION_1");
  const [loading, setLoading] = useState(true);
  const [lockingLoading, setLockingLoading] = useState(false);
  const [lockModalVisible, setLockModalVisible] = useState(false);
  const [lockModalName, setLockModalName] = useState("");
  const [lockingTableId, setLockingTableId] = useState("");
  const [lockingTableNumber, setLockingTableNumber] = useState("");
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [unlockingTableId, setUnlockingTableId] = useState("");
  const [unlockingTableNumber, setUnlockingTableNumber] = useState("");
  const [unlockingLoading, setUnlockingLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, []),
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const tablesRes = await fetch(`${API_URL}/tables`);
      if (!tablesRes.ok) throw new Error("Failed to fetch tables");
      const tablesData = await tablesRes.json();

      const lockedRes = await fetch(`${API_URL}/api/tables/locked`);
      if (!lockedRes.ok) throw new Error("Failed to fetch locked tables");
      const lockedData = await lockedRes.json();
      const locked = Array.isArray(lockedData) ? lockedData : [];

      setLockedTables(locked);

      const availableTables: TableType[] = Array.isArray(tablesData)
        ? tablesData.map((table: any) => {
            const tId = table.id || table.TableId;
            const tNum = table.label || table.TableNumber;
            const isLocked = locked.some((t: any) => {
              const lockedId = t.tableId || t.TableId;
              const lockedNum = String(t.tableNumber || t.TableNumber || "");
              return String(lockedId) === String(tId) || lockedNum === String(tNum);
            });

            return {
              tableId: tId,
              tableNumber: tNum,
              diningSection: Number(table.DiningSection) || 1,
              isLocked,
            };
          })
        : [];

      setAllTables(availableTables);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to fetch tables");
    } finally {
      setLoading(false);
    }
  };

  const getSectionFromDiningSection = (diningSection?: number): string => {
    switch (diningSection) {
      case 1: return "SECTION_1";
      case 2: return "SECTION_2";
      case 3: return "SECTION_3";
      case 4: return "TAKEAWAY";
      default: return "SECTION_1";
    }
  };

  const continueWithOrder = async (tableId: string, tableNumber: string, diningSection?: number) => {
    try {
      // 1. Release the persistent lock in backend
      const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
      await fetch(`${API_URL}/api/tables/unlock-persistent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: cleanId }),
      });

      // 2. Mark table as Active/HOLD in the store to turn it green
      const section = getSectionFromDiningSection(diningSection);
      useTableStatusStore.getState().updateTableStatus(
        section,
        tableNumber,
        `ORD-${Date.now().toString().slice(-6)}`, // Temporary ID
        'HOLD',
        Date.now()
      );

      // 3. Set context and navigate
      setOrderContext({
        orderType: "DINE_IN",
        section: section,
        tableNo: tableNumber,
      });
      router.push("/menu/thai_kitchen");
    } catch (err) {
      console.error("Failed to transition locked table:", err);
      // Still attempt to navigate if API fails, as user wants to proceed
      const section = getSectionFromDiningSection(diningSection);
      setOrderContext({
        orderType: "DINE_IN",
        section: section,
        tableNo: tableNumber,
      });
      router.push("/menu/thai_kitchen");
    }
  };

  const lockTable = (tableId: string, tableNumber: string) => {
    setLockingTableId(tableId);
    setLockingTableNumber(tableNumber);
    setLockModalName("");
    setLockModalVisible(true);
  };

  const confirmLockTable = async () => {
    try {
      setLockingLoading(true);
      const payload = { tableId: lockingTableId, lockedByName: lockModalName.trim() };
      const res = await fetch(`${API_URL}/api/tables/lock-persistent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setLockModalVisible(false);
        setAllTables((prev) => prev.map((t) => t.tableId === lockingTableId ? { ...t, isLocked: true } : t));
        setLockedTables((prev) => [...prev, { tableId: lockingTableId, tableNumber: lockingTableNumber }]);
        fetchData();
      } else {
        const data = await res.json();
        Alert.alert("Error", data.error || "Failed to lock table");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to lock table");
    } finally {
      setLockingLoading(false);
    }
  };

  const unlockTable = (tableId: string, tableNumber: string) => {
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    setUnlockingTableId(cleanId);
    setUnlockingTableNumber(tableNumber);
    setUnlockModalVisible(true);
  };

  const confirmUnlockTable = async () => {
    try {
      setUnlockingLoading(true);
      const res = await fetch(`${API_URL}/api/tables/unlock-persistent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: unlockingTableId }),
      });

      if (res.ok) {
        setUnlockModalVisible(false);
        setAllTables((prev) => prev.map((t) => t.tableId === unlockingTableId ? { ...t, isLocked: false } : t));
        fetchData();
      } else {
        Alert.alert("Error", "Failed to unlock table");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to unlock table");
    } finally {
      setUnlockingLoading(false);
    }
  };

  const sectionTables = React.useMemo(() => {
    return allTables.filter((t) => getSectionFromDiningSection(t.diningSection) === activeSection);
  }, [allTables, activeSection]);

  const renderTableItem = ({ item }: { item: TableType }) => {
    const tableStatus = useTableStatusStore.getState().tables.find(t => 
      t.section === getSectionFromDiningSection(item.diningSection) && t.tableNo === item.tableNumber
    );
    
    // Define "Active" as anything with an order that isn't EMPTY or LOCKED
    const isActive = tableStatus && ['SENT', 'HOLD', 'BILL_REQUESTED'].includes(tableStatus.status);

    const cardBg = item.isLocked 
      ? (IS_MOBILE ? SOLID_LIGHT_RED : Theme.danger + "10")
      : isActive 
        ? (IS_MOBILE ? SOLID_LIGHT_GREEN : Theme.success + "05")
        : Theme.bgCard;

    return (
      <View style={[
        styles.tableCard, 
        { 
          backgroundColor: cardBg,
          elevation: (item.isLocked || isActive) ? 0 : 2, // Fix fill artifacts
          borderWidth: (item.isLocked || isActive) ? 2 : 1.5,
          borderColor: item.isLocked ? Theme.danger + "40" : isActive ? Theme.success + "30" : Theme.border
        }
      ]}>
        <TouchableOpacity
          style={styles.tableContent}
          onPress={() => {
            if (item.isLocked) {
              Alert.alert("Locked Table", `Table ${item.tableNumber} is locked. Continue order processing?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Continue Order", onPress: () => continueWithOrder(item.tableId, item.tableNumber, item.diningSection) },
              ]);
            } else if (isActive) {
              Alert.alert("Table In Use", `Table ${item.tableNumber} currently has an active order and cannot be locked.`);
            } else {
              lockTable(item.tableId, item.tableNumber);
            }
          }}
        >
          <View style={[styles.tableIcon, item.isLocked && styles.lockedIcon, isActive && styles.activeIcon]}>
            <Ionicons
              name={item.isLocked ? "lock-closed" : isActive ? "restaurant" : "lock-open-outline"}
              size={24}
              color={item.isLocked ? Theme.danger : isActive ? Theme.success : Theme.textMuted}
            />
          </View>
          <Text style={styles.tableNumber}>{item.tableNumber}</Text>
          <Text style={[styles.tableStatus, item.isLocked && styles.lockedStatus, isActive && styles.activeStatus]}>
            {item.isLocked ? "LOCKED" : isActive ? "IN USE" : "AVAILABLE"}
          </Text>
        </TouchableOpacity>

        {item.isLocked && (
          <TouchableOpacity
            style={styles.unlockBtn}
            onPress={() => unlockTable(item.tableId, item.tableNumber)}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={18} color={Theme.danger} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Lock Table</Text>
          <Text style={styles.headerSubtitle}>Reserve or manage tables</Text>
        </View>
        <TouchableOpacity onPress={fetchData} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={Theme.success} />
        </TouchableOpacity>
      </View>

      {/* Locked Preview */}
      {lockedTables.length > 0 && (
        <View style={styles.lockedPreviewContainer}>
          <Text style={styles.lockedPreviewTitle}>🔒 RESERVED TABLES ({lockedTables.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.lockedTablesScroll}>
            {lockedTables.map((table, index) => (
              <View key={`${table.tableId}-${index}`} style={styles.lockedTablePreview}>
                <Ionicons name="lock-closed" size={16} color={Theme.danger} />
                <Text style={styles.lockedTablePreviewNo}>Table {table.tableNumber}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Section Tabs */}
      <View style={styles.sectionTabs}>
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section}
            style={[styles.sectionTab, activeSection === section && styles.activeSectionTab]}
            onPress={() => setActiveSection(section)}
          >
            <Text style={[styles.sectionTabText, activeSection === section && styles.activeSectionTabText]}>
              {SECTION_LABELS[section]}
            </Text>
            <View style={[styles.sectionTabBadge, activeSection === section && styles.activeSectionTabBadge]}>
              <Text style={styles.sectionTabBadgeText}>
                {allTables.filter((t) => getSectionFromDiningSection(t.diningSection) === section && t.isLocked).length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Theme.primary} />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      ) : (
        <FlatList
          data={sectionTables}
          keyExtractor={(item) => item.tableId}
          renderItem={renderTableItem}
          numColumns={4}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="grid-outline" size={48} color={Theme.border} />
              <Text style={styles.emptyText}>No tables in this section</Text>
            </View>
          }
        />
      )}

      {/* Info Footer */}
      <View style={styles.footer}>
        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <View style={[styles.dot, { backgroundColor: Theme.warning }]} />
            <Text style={styles.infoText}>Tap to lock table</Text>
          </View>
          <View style={styles.infoBadge}>
            <View style={[styles.dot, { backgroundColor: Theme.success }]} />
            <Text style={styles.infoText}>Tap locked to continue</Text>
          </View>
        </View>
      </View>

      {/* Modals */}
      <Modal transparent visible={lockModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lock Table {lockingTableNumber}</Text>
            <Text style={styles.modalSubtitle}>Enter customer name (optional)</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Customer Name"
              placeholderTextColor={Theme.textMuted}
              value={lockModalName}
              onChangeText={setLockModalName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setLockModalVisible(false)} disabled={lockingLoading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={confirmLockTable} disabled={lockingLoading}>
                <Text style={styles.confirmBtnText}>{lockingLoading ? "Locking..." : "Lock Table"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={unlockModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { color: Theme.danger }]}>Unlock Table {unlockingTableNumber}</Text>
            <Text style={styles.modalSubtitle}>Release this reservation?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setUnlockModalVisible(false)} disabled={unlockingLoading}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Theme.danger }]} onPress={confirmUnlockTable} disabled={unlockingLoading}>
                <Text style={styles.confirmBtnText}>{unlockingLoading ? "Unlocking..." : "Unlock Table"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, gap: 15,
    borderBottomWidth: 1, borderBottomColor: Theme.border, backgroundColor: Theme.bgCard,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgMuted,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border,
  },
  headerTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 20 },
  headerSubtitle: { color: Theme.textSecondary, fontFamily: Fonts.semiBold, fontSize: 12 },
  refreshBtn: {
    marginLeft: "auto", width: 44, height: 44, borderRadius: 10,
    backgroundColor: Theme.success + "15", justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Theme.success + "30",
  },
  lockedPreviewContainer: { padding: 20, backgroundColor: Theme.bgCard, borderBottomWidth: 1, borderBottomColor: Theme.border },
  lockedPreviewTitle: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 13, marginBottom: 15 },
  lockedTablesScroll: { flexDirection: "row" },
  lockedTablePreview: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, paddingVertical: 10,
    backgroundColor: Theme.danger + "15", borderRadius: 10, marginRight: 10, borderWidth: 1, borderColor: Theme.danger + "30",
  },
  lockedTablePreviewNo: { color: Theme.danger, fontFamily: Fonts.bold, fontSize: 14 },
  sectionTabs: { flexDirection: "row", padding: 20, gap: 10 },
  sectionTab: {
    flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Theme.bgCard,
    borderWidth: 1, borderColor: Theme.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  activeSectionTab: { backgroundColor: Theme.primary, borderColor: Theme.primary, ...Theme.shadowMd },
  sectionTabText: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 12 },
  activeSectionTabText: { color: "#fff" },
  sectionTabBadge: { backgroundColor: Theme.bgMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 28, alignItems: "center" },
  activeSectionTabBadge: { backgroundColor: "rgba(255,255,255,0.25)" },
  sectionTabBadgeText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 11 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 14, marginTop: 12 },
  gridContent: { paddingHorizontal: 20, paddingBottom: 100 },
  gridRow: { gap: 15, marginBottom: 15 },
  tableCard: {
    flex: 1, position: "relative", borderRadius: 20, backgroundColor: Theme.bgCard,
    borderWidth: 1.5, borderColor: Theme.border, minHeight: 140, ...Theme.shadowSm,
  },
  lockedCard: { backgroundColor: Theme.warning + "10", borderColor: Theme.warning + "40" },
  tableContent: { flex: 1, padding: 15, alignItems: "center", justifyContent: "center" },
  tableIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: Theme.bgMuted,
    justifyContent: "center", alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: Theme.border,
  },
  lockedIcon: { backgroundColor: Theme.danger + "15", borderColor: Theme.danger + "30" },
  tableNumber: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 20, letterSpacing: 0.5 },
  tableStatus: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 11, marginTop: 8, textTransform: "uppercase" },
  lockedStatus: { color: Theme.danger },
  activeCard: { backgroundColor: Theme.success + "05", borderColor: Theme.success + "30" },
  activeIcon: { backgroundColor: Theme.success + "10", borderColor: Theme.success + "20" },
  activeStatus: { color: Theme.success },
  unlockBtn: {
    position: "absolute", 
    top: -8, 
    left: -8, 
    width: 32, 
    height: 32, 
    borderRadius: 16,
    backgroundColor: Theme.bgCard, 
    justifyContent: "center", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: Theme.danger + "40",
    ...Theme.shadowMd,
    zIndex: 10,
  },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 20,
    backgroundColor: Theme.bgCard, borderTopWidth: 1, borderTopColor: Theme.border,
  },
  infoRow: { flexDirection: "row", justifyContent: "center", gap: 20 },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  infoText: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 13 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 20 },
  modalContent: {
    width: "100%", maxWidth: 400, backgroundColor: Theme.bgCard, borderRadius: 24, padding: 30,
    ...Theme.shadowLg, borderWidth: 1, borderColor: Theme.border,
  },
  modalTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 22, textAlign: "center", marginBottom: 10 },
  modalSubtitle: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 14, textAlign: "center", marginBottom: 25 },
  nameInput: {
    height: 60, backgroundColor: Theme.bgInput, borderRadius: 16, color: Theme.textPrimary,
    paddingHorizontal: 20, fontSize: 16, fontFamily: Fonts.bold, borderWidth: 1, borderColor: Theme.border, marginBottom: 25,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  modalActions: { flexDirection: "row", gap: 15 },
  modalBtn: { flex: 1, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center", ...Theme.shadowMd },
  cancelBtn: { backgroundColor: Theme.bgMuted, borderWidth: 1, borderColor: Theme.border },
  confirmBtn: { backgroundColor: Theme.primary },
  cancelBtnText: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 15 },
  confirmBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 15 },
  confirmBtnDisabled: { opacity: 0.6 },
  emptyContainer: { alignItems: "center", marginTop: 100, gap: 15 },
  emptyText: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 16 },
});
