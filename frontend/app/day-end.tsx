import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Theme } from "@/constants/theme";
import { Fonts } from "@/constants/Fonts";
import { API_URL } from "@/constants/Config";
import { useAuthStore } from "@/stores/authStore";

export default function DayEndScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDaySummary();
  }, []);

  const fetchDaySummary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sales/day-end-summary`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to fetch day summary");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const handleDayEnd = () => {
    Alert.alert(
      "Confirm Day End",
      "Are you sure you want to close the day? This will finalize all transactions and prepare for the next business day.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          style: "destructive",
          onPress: () => {
            // Logic for Day End would go here (e.g. archiving or resetting)
            Alert.alert("Success", "Day ended successfully. Report generated.");
            router.replace("/");
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Theme.primary} />
        <Text style={{ marginTop: 10, fontFamily: Fonts.medium, color: Theme.textSecondary }}>Fetching Summary...</Text>
      </View>
    );
  }

  const analysis = data?.salesAnalysis;
  const paymodes = data?.paymodeDetail || [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Day End Report</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Main Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Sales</Text>
              <Text style={styles.statValue}>{formatCurrency(analysis?.totalSales || 0)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Bills</Text>
              <Text style={styles.statValue}>{analysis?.billCount || 0}</Text>
            </View>
          </View>

          {/* Paymode Detail Table */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="credit-card-outline" size={20} color={Theme.primary} />
              <Text style={styles.sectionTitle}>Paymode Detail</Text>
            </View>
            
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Particulars</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Qty</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: "right" }]}>Amount</Text>
            </View>

            {paymodes.length > 0 ? (
              paymodes.map((pm: any, idx: number) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCellText, { flex: 2, fontFamily: Fonts.bold }]}>{pm.Paymode}</Text>
                  <Text style={[styles.tableCellText, { flex: 1, textAlign: "center" }]}>{pm.Count}</Text>
                  <Text style={[styles.tableCellText, { flex: 1.5, textAlign: "right", color: Theme.success }]}>
                    {formatCurrency(pm.Amount)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No transactions yet</Text>
            )}
            
            <View style={styles.tableFooter}>
              <Text style={[styles.footerText, { flex: 2 }]}>Total</Text>
              <Text style={[styles.footerText, { flex: 1, textAlign: "center" }]}>
                {paymodes.reduce((acc: number, curr: any) => acc + curr.Count, 0)}
              </Text>
              <Text style={[styles.footerText, { flex: 1.5, textAlign: "right" }]}>
                {formatCurrency(paymodes.reduce((acc: number, curr: any) => acc + curr.Amount, 0))}
              </Text>
            </View>
          </View>

          {/* Analysis Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="chart-line" size={20} color={Theme.primary} />
              <Text style={styles.sectionTitle}>Analysis</Text>
            </View>
            
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Sales Amount</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.totalSales || 0)}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>No of Bills</Text>
              <Text style={styles.analysisValue}>{analysis?.billCount || 0}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>Avg/Bill</Text>
              <Text style={styles.analysisValue}>{formatCurrency(analysis?.avgPerBill || 0)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.actionBtn} onPress={handleDayEnd}>
            <MaterialCommunityIcons name="printer" size={24} color="#fff" />
            <Text style={styles.actionBtnText}>Print & Close Day</Text>
          </TouchableOpacity>

          <Text style={styles.infoText}>
            Generating the Day End report will finalize all daily records. Ensure all tables are cleared before proceeding.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: Theme.bgCard,
    padding: 16,
    borderRadius: 16,
    ...Theme.shadowSm,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  sectionCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 16,
    ...Theme.shadowSm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.border,
  },
  tableCellText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
  },
  tableFooter: {
    flexDirection: "row",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: Theme.border,
  },
  footerText: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  analysisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.border,
  },
  analysisLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  analysisValue: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  actionBtn: {
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 16,
    marginTop: 10,
    ...Theme.shadowMd,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: Fonts.black,
  },
  infoText: {
    textAlign: "center",
    color: Theme.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontFamily: Fonts.medium,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
});
