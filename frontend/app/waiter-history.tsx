import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/Fonts";
import { Theme } from "@/constants/theme";

export default function WaiterHistoryScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circularBack}>
            <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Waiter History</Text>
        </View>

        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={80} color={Theme.textMuted} />
          <Text style={styles.emptyText}>No history records found.</Text>
          <Text style={styles.subText}>Waiter attendance and performance logs will appear here.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 20, gap: 15 },
  circularBack: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgCard, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  screenTitle: { flex: 1, color: Theme.textPrimary, fontSize: 20, fontFamily: Fonts.black },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: Theme.textPrimary, fontSize: 18, fontFamily: Fonts.bold, marginTop: 20 },
  subText: { color: Theme.textMuted, fontSize: 14, fontFamily: Fonts.medium, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
