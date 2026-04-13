import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";

export default function PaymentSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const total = String(params.total ?? "0");
  const paid = String(params.paidNum ?? "0");
  const change = String(params.change ?? "0");

  const orderId = String(params.orderId ?? "");
  const tableNo = String(params.tableNo ?? "");
  const section = String(params.section ?? "");
  const orderType = String(params.orderType ?? "");
  const method = String(params.method ?? "");

  const handleDone = () => {
    router.replace({
      pathname: "/category",
      params: { section },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgMain} />
      
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={Theme.success} />
          </View>

          <Text style={styles.title}>Payment Successful</Text>
          <Text style={styles.orderText}>Order #{orderId}</Text>

          <Text style={styles.sub}>
            {orderType === "DINE_IN"
              ? `Table ${tableNo} • ${section}`
              : `Takeaway • ${section}`}
          </Text>

          <View style={styles.divider} />

          <View style={styles.detailsContainer}>
            <View style={styles.row}>
              <Text style={styles.label}>Payment Method</Text>
              <Text style={styles.value}>{method}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Total Amount</Text>
              <Text style={styles.value}>${total}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Amount Paid</Text>
              <Text style={styles.value}>${paid}</Text>
            </View>

            <View style={[styles.row, styles.changeRow]}>
              <Text style={styles.label}>Change Due</Text>
              <Text style={[styles.value, { color: Theme.primary }]}>${change}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.bgCard,
    borderRadius: 30,
    padding: 30,
    alignItems: "center",
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  iconContainer: {
    marginBottom: 15,
  },
  title: {
    color: Theme.textPrimary,
    fontSize: 26,
    fontFamily: Fonts.black,
    textAlign: "center",
  },
  orderText: {
    color: Theme.success,
    fontSize: 18,
    fontFamily: Fonts.bold,
    marginTop: 5,
  },
  sub: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 14,
    marginTop: 5,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.border,
    width: "100%",
    marginVertical: 20,
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: 1,
  },
  detailsContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  changeRow: {
    marginTop: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
  },
  label: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  value: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  doneBtn: {
    marginTop: 10,
    backgroundColor: Theme.primary,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 16,
    ...Theme.shadowMd,
    width: "100%",
    alignItems: "center",
  },
  doneText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 18,
  },
});
