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
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    // Fetch today's summary
    fetchTodaySummary();
  }, []);

  const fetchTodaySummary = async () => {
    setLoading(true);
    try {
      // Placeholder for actual API call
      // const res = await fetch(`${API_URL}/api/sales/today-summary`);
      // const data = await res.json();
      // setSummary(data);
      
      // Dummy data for now
      setSummary({
        totalSales: 1250.50,
        orderCount: 45,
        cashPayments: 850.00,
        cardPayments: 400.50,
        startTime: new Date().setHours(9, 0, 0),
        endTime: new Date().getTime(),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDayEnd = () => {
    Alert.alert(
      "Confirm Day End",
      "Are you sure you want to close the day? This will generate a final report and log you out.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          style: "destructive",
          onPress: () => {
            // Logic for Day End
            Alert.alert("Success", "Day ended successfully. Printing report...");
            router.replace("/");
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Day End</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="calendar-clock" size={24} color={Theme.primary} />
              <Text style={styles.cardTitle}>Today's Summary</Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={Theme.primary} style={{ marginVertical: 40 }} />
            ) : (
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Sales</Text>
                  <Text style={styles.statValue}>${summary?.totalSales.toFixed(2)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Orders</Text>
                  <Text style={styles.statValue}>{summary?.orderCount}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Cash</Text>
                  <Text style={[styles.statValue, { color: Theme.success }]}>${summary?.cashPayments.toFixed(2)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Card/Online</Text>
                  <Text style={[styles.statValue, { color: Theme.info }]}>${summary?.cardPayments.toFixed(2)}</Text>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.actionBtn} onPress={handleDayEnd}>
            <MaterialCommunityIcons name="check-circle-outline" size={24} color="#fff" />
            <Text style={styles.actionBtnText}>Perform Day End</Text>
          </TouchableOpacity>

          <Text style={styles.infoText}>
            Performing Day End will finalize all transactions for today and prepare the system for the next business day.
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
    padding: 20,
  },
  summaryCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 20,
    ...Theme.shadowMd,
    marginBottom: 30,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    paddingBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
  },
  statItem: {
    width: "47%",
    backgroundColor: Theme.bgMuted,
    padding: 15,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    marginBottom: 5,
  },
  statValue: {
    fontSize: 18,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  actionBtn: {
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 60,
    borderRadius: 16,
    ...Theme.shadowMd,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: Fonts.black,
  },
  infoText: {
    marginTop: 20,
    textAlign: "center",
    color: Theme.textMuted,
    fontSize: 13,
    fontFamily: Fonts.medium,
    lineHeight: 20,
  },
});
