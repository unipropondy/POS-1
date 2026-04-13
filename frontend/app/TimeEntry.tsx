import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
} from "react-native";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";

interface TodaySummary {
  clockedIn: boolean;
  shiftCompleted: boolean;
  clockInTime: string | null;
  clockOutTime: string | null;
  totalHours: number;
  totalBreakMinutes: number;
  netHours: number;
  isOnBreak: boolean;
  canClockIn: boolean;
  canClockOut: boolean;
  canStartBreak: boolean;
  canEndBreak: boolean;
}

export default function TimeEntryScreen() {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // --- CLOCK ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- INITIAL LOAD ---
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  // --- AUTO-FETCH SUMMARY ---
  useEffect(() => {
    if (userId) {
      fetchTodaySummary();
    }
  }, [userId]);

  // --- INSTANT STAFF NAME FETCH ---
  useEffect(() => {
    if (userName.length > 0) {
      const delayFetch = setTimeout(() => {
        fetchStaffName(userName);
      }, 500);
      return () => clearTimeout(delayFetch);
    } else {
      setStaffName("");
      setUserId("");
    }
  }, [userName]);

  const loadSavedCredentials = async () => {
    try {
      const savedUser = await AsyncStorage.getItem("lastUserName");
      const savedUserId = await AsyncStorage.getItem("lastUserId");
      if (savedUser) setUserName(savedUser);
      if (savedUserId) setUserId(savedUserId);
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
  };

  const fetchStaffName = async (name: string) => {
    try {
      const res = await fetch(`${API_URL}/api/attendance/getUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: name }),
      });
      const data = await res.json();
      if (res.ok) {
        setStaffName(data.FullName);
        setUserId(data.UserId);
        await AsyncStorage.setItem("lastUserName", name);
        await AsyncStorage.setItem("lastUserId", data.UserId);
      } else {
        setStaffName("");
        setUserId("");
      }
    } catch (_) {
      setStaffName("");
      setUserId("");
    }
  };

  const fetchTodaySummary = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/api/attendance/summary/${userId}`);
      const data = await response.json();
      if (response.ok && data.summary) {
        setTodaySummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  };

  const handleAction = async (status: number) => {
    if (!userId || !password) {
      Alert.alert("Error", "Please enter User ID and Password");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/attendance/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status, userName, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      if (status !== 1) { // Clear password for any action other than Login (optional preference)
        setPassword("");
      }

      Alert.alert("Success", data.message);
      await fetchTodaySummary();
      
      if (status === 0) { // OUT -> Clear all as per "close session" requirement
        setUserName("");
        setPassword("");
        setStaffName("");
        setUserId("");
        setTodaySummary(null);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTodaySummary();
    setRefreshing(false);
  };

  const getStatusText = () => {
    const status = todaySummary?.lastStatus;
    if (status === 1) return "Active (In)";
    if (status === 3) return "On Break";
    if (status === 4) return "Active (Back from Break)";
    return "Out / Inactive";
  };

  // Logic Rules based on lastStatus
  const lastStatus = todaySummary?.lastStatus;
  const canLogin = (lastStatus === 0 || lastStatus === null || !userId);
  const canOut = (lastStatus === 1 || lastStatus === 4);
  const canBreakIn = (lastStatus === 1 || lastStatus === 4);
  const canBreakOut = (lastStatus === 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.bgNav} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.primary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Time <Text style={styles.titleSpan}>Entry</Text></Text>
            <Text style={styles.timeText}>{currentTime.toLocaleTimeString()}</Text>
          </View>

          {/* Row 1: [ User ID ] [ Password ] [ Login ] */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, {flex: 1.2}]}>
              <Text style={styles.miniLabel}>User ID</Text>
              <TextInput
                style={styles.simpleInput}
                value={userName}
                onChangeText={setUserName}
                placeholder="ID"
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.inputContainer, {flex: 1.2}]}>
              <Text style={styles.miniLabel}>Password</Text>
              <TextInput
                style={styles.simpleInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Pass"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity 
              style={[styles.loginBtnSimple, !canLogin && styles.btnDisabled]} 
              onPress={() => handleAction(1)}
              disabled={!canLogin}
            >
              <Text style={styles.btnTextThin}>Login</Text>
            </TouchableOpacity>
          </View>

          {/* User Display */}
          {staffName.length > 0 && (
            <Text style={styles.staffNameText}>User: {staffName}</Text>
          )}

          {/* Row 2: Status: Active (In) [ Out ] */}
          <View style={[styles.row, styles.statusRow]}>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={[styles.statusValue, lastStatus === 3 ? {color: Theme.warning} : {color: Theme.success}]}>
                {getStatusText()}
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.outBtnSimple, !canOut && styles.btnDisabled]} 
              onPress={() => handleAction(0)}
              disabled={!canOut}
            >
              <Text style={styles.btnTextThin}>OUT</Text>
            </TouchableOpacity>
          </View>

          {/* Row 3: [ Break In ] [ Break Out ] */}
          <View style={styles.row}>
            <TouchableOpacity 
              style={[styles.breakBtnSimple, !canBreakIn && styles.btnDisabled, {backgroundColor: Theme.success}]} 
              onPress={() => handleAction(3)}
              disabled={!canBreakIn}
            >
              <Text style={styles.btnTextThin}>Break In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.breakBtnSimple, !canBreakOut && styles.btnDisabled, {backgroundColor: Theme.danger}]} 
              onPress={() => handleAction(4)}
              disabled={!canBreakOut}
            >
              <Text style={styles.btnTextThin}>Break Out</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Summary View */}
          {todaySummary && (
            <View style={styles.footerSummary}>
              <Text style={styles.footerText}>Today: {todaySummary.netHours.toFixed(2)} hrs worked</Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Theme.bgMain },
  container: { flex: 1 },
  scrollContent: { padding: 15 },
  header: { alignItems: "center", marginBottom: 20 },
  title: { fontFamily: Fonts.extraBold, fontSize: 26, color: Theme.textPrimary },
  titleSpan: { color: Theme.primary },
  timeText: { fontFamily: Fonts.bold, fontSize: 18, color: Theme.textSecondary, marginTop: 5 },
  row: { 
    flexDirection: "row", 
    alignItems: "flex-end", 
    justifyContent: "space-between", 
    marginBottom: 20,
    backgroundColor: Theme.bgCard,
    padding: 12,
    borderRadius: 12,
    ...Theme.shadowSm
  },
  inputContainer: { marginRight: 8 },
  miniLabel: { fontFamily: Fonts.bold, fontSize: 11, color: Theme.textSecondary, marginBottom: 4 },
  simpleInput: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    fontFamily: Fonts.medium,
    backgroundColor: Theme.bgInput,
    color: Theme.textPrimary,
  },
  loginBtnSimple: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  outBtnSimple: {
    backgroundColor: Theme.danger,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: "center",
  },
  breakBtnSimple: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnTextThin: { fontFamily: Fonts.black, color: "#fff", fontSize: 14, textTransform: "uppercase" },
  btnDisabled: { opacity: 0.3 },
  statusRow: { alignItems: "center", paddingVertical: 15 },
  statusInfo: { flexDirection: "row", alignItems: "center" },
  statusLabel: { fontFamily: Fonts.bold, fontSize: 16, color: Theme.textSecondary, marginRight: 8 },
  statusValue: { fontFamily: Fonts.black, fontSize: 16 },
  staffNameText: { 
    textAlign: "center", 
    fontFamily: Fonts.bold, 
    color: Theme.textPrimary, 
    marginBottom: 10, 
    fontSize: 14,
    backgroundColor: Theme.bgMuted,
    alignSelf: "center",
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 15
  },
  footerSummary: { marginTop: 10, alignItems: "center" },
  footerText: { fontFamily: Fonts.medium, fontSize: 13, color: Theme.textSecondary },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
});
