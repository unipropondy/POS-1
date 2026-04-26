import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
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

  const fetchTodayLogs = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/attendance/today/${id}`);
      const data = await response.json();
      if (response.ok) {
        setTodayLogs(data);
      }
    } catch (error) {
      console.error("Error fetching today logs:", error);
    }
  };

  const fetchTodaySummary = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/api/attendance/summary/${userId}`);
      const data = await response.json();
      if (response.ok && data.summary) {
        setTodaySummary(data.summary);
        await fetchTodayLogs(userId);
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
        setTodayLogs([]);
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

  const renderLogsTable = () => {
    if (todayLogs.length === 0) return null;

    return (
      <View style={styles.logsContainer}>
        <View style={styles.logsHeaderContainer}>
          <Text style={styles.logsTitle}>TODAY'S ACTIVITY</Text>
        </View>
        <View style={styles.tableWrapper}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableCell, styles.tableHeadText, styles.colSn]}>#</Text>
            <Text style={[styles.tableCell, styles.tableHeadText, styles.colAction]}>ACTION</Text>
            <Text style={[styles.tableCell, styles.tableHeadText, styles.colTime]}>TIME</Text>
          </View>
          {todayLogs.map((log, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, styles.tableDataTextSno, styles.colSn]}>{todayLogs.length - idx}</Text>
              <Text style={[styles.tableCell, styles.tableDataText, styles.colAction, { color: log.status === 0 ? Theme.danger : (log.status === 3 ? Theme.warning : Theme.success) }]}>
                {log.ActionName}
              </Text>
              <Text style={[styles.tableCell, styles.tableDataText, styles.colTime]}>
                {new Date(log.ClockinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };



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
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtnHeader}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>TIME <Text style={styles.titleSpan}>ENTRY</Text></Text>
              <Text style={styles.timeText}>{currentTime.toLocaleTimeString()}</Text>
            </View>
            <TouchableOpacity 
              onPress={() => router.push("/waiters")} 
              style={styles.waiterBtnHeader}
            >
              <MaterialCommunityIcons name="account-group" size={24} color={Theme.primary} />
              <Text style={styles.waiterBtnText}>Waiter</Text>
            </TouchableOpacity>
          </View>

          {/* User Display Badge */}
          {staffName.length > 0 && (
            <View style={styles.staffNameBadge}>
              <Ionicons name="person-circle-outline" size={16} color={Theme.primary} />
              <Text style={styles.staffNameText}>User: {staffName}</Text>
            </View>
          )}

          {/* Login Card */}
          <View style={styles.card}>
            <View style={styles.loginRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>User ID</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color={Theme.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    value={userName}
                    onChangeText={setUserName}
                    placeholder="Enter ID"
                    placeholderTextColor={Theme.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Theme.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••"
                    placeholderTextColor={Theme.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.primaryBtn, !canLogin && styles.btnDisabled]} 
                onPress={() => handleAction(1)}
                disabled={!canLogin}
              >
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Status Card */}
          <View style={styles.card}>
            <View style={styles.statusSection}>
              <View style={styles.statusMain}>
                <View style={[styles.statusIndicator, { backgroundColor: lastStatus === 3 ? Theme.warning : (lastStatus === 1 || lastStatus === 4 ? Theme.success : Theme.textMuted) }]} />
                <View>
                  <Text style={styles.statusTitle}>Current Status</Text>
                  <Text style={[styles.statusValue, { color: lastStatus === 3 ? Theme.warning : (lastStatus === 1 || lastStatus === 4 ? Theme.success : Theme.textSecondary) }]}>
                    {getStatusText()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.outBtn, !canOut && styles.btnDisabled]} 
                onPress={() => handleAction(0)}
                disabled={!canOut}
              >
                <Ionicons name="power-outline" size={18} color={canOut ? Theme.danger : Theme.textMuted} />
                <Text style={[styles.outBtnText, { color: canOut ? Theme.danger : Theme.textMuted }]}>OUT</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionBtn, !canBreakIn && styles.btnDisabled, { backgroundColor: Theme.successBg, borderColor: Theme.successBorder }]} 
              onPress={() => handleAction(3)}
              disabled={!canBreakIn}
            >
              <Ionicons name="cafe-outline" size={22} color={Theme.success} />
              <Text style={[styles.actionBtnText, { color: Theme.success }]}>Break In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, !canBreakOut && styles.btnDisabled, { backgroundColor: Theme.dangerBg, borderColor: Theme.dangerBorder }]} 
              onPress={() => handleAction(4)}
              disabled={!canBreakOut}
            >
              <Ionicons name="play-outline" size={22} color={Theme.danger} />
              <Text style={[styles.actionBtnText, { color: Theme.danger }]}>Break Out</Text>
            </TouchableOpacity>
          </View>

          {/* Metric Summary */}
          {todaySummary && (
            <View style={styles.metricCard}>
              <View style={styles.metricIconWrap}>
                <Ionicons name="time-outline" size={24} color={Theme.primary} />
              </View>
              <View>
                <Text style={styles.metricLabel}>TOTAL WORKED TODAY</Text>
                <Text style={styles.metricValue}>{todaySummary.netHours.toFixed(2)} HOURS</Text>
              </View>
            </View>
          )}

          {renderLogsTable()}

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
  scrollContent: { padding: 20, paddingBottom: 60 },
  header: { 
    alignItems: "center", 
    marginTop: 10,
    marginBottom: 30,
    position: 'relative',
    height: 60,
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnHeader: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
    zIndex: 10,
  },
  waiterBtnHeader: {
    position: 'absolute',
    right: 0,
    top: 0,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.bgCard,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 6,
    ...Theme.shadowSm,
    zIndex: 10,
  },
  waiterBtnText: {
    fontFamily: Fonts.black,
    fontSize: 12,
    color: Theme.primary,
    textTransform: 'uppercase',
  },
  title: { alignSelf: 'center', fontFamily: Fonts.black, fontSize: 32, color: Theme.textPrimary, letterSpacing: 0.5 },
  titleSpan: { color: Theme.primary },
  timeText: { fontFamily: Fonts.bold, fontSize: 16, color: Theme.textSecondary, marginTop: 4, letterSpacing: 1 },

  staffNameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: Theme.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  staffNameText: {
    fontFamily: Fonts.black,
    fontSize: 14,
    color: Theme.primary,
  },

  card: {
    backgroundColor: Theme.bgCard,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  loginRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontFamily: Fonts.black,
    fontSize: 11,
    color: Theme.textPrimary,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.bgInput,
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    height: 52,
  },
  textInput: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Theme.textPrimary,
    marginLeft: 10,
  },
  primaryBtn: {
    backgroundColor: Theme.primary,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Theme.shadowMd,
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: Fonts.black,
    fontSize: 16,
  },

  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Theme.textMuted,
    marginBottom: 2,
  },
  statusValue: {
    fontFamily: Fonts.black,
    fontSize: 18,
  },
  outBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  outBtnText: {
    fontFamily: Fonts.black,
    fontSize: 14,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
    height: 64,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    ...Theme.shadowSm,
  },
  actionBtnText: {
    fontFamily: Fonts.black,
    fontSize: 16,
    letterSpacing: 0.5,
  },

  metricCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 30,
    borderWidth: 1,
    color: Theme.textPrimary,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  metricIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Theme.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
  },
  metricLabel: {
    fontFamily: Fonts.black,
    fontSize: 12,
    color: Theme.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: Fonts.black,
    fontSize: 22,
    color: Theme.textPrimary,
  },

  logsContainer: {
    width: '100%',
  },
  logsHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 10,
  },
  logsTitle: {
    fontFamily: Fonts.black,
    fontSize: 14,
    color: Theme.textSecondary,
    letterSpacing: 2,
  },
  tableWrapper: {
    backgroundColor: Theme.bgCard,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: Theme.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.primaryBorder,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  tableRowAlt: {
    backgroundColor: Theme.bgMain,
  },
  tableCell: {
    paddingVertical: 18,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  tableHeadText: {
    fontFamily: Fonts.black,
    fontSize: 11,
    color: Theme.primaryDark,
    textTransform: 'uppercase',
  },
  tableDataText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  tableDataTextSno: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Theme.textMuted,
  },
  colSn: { width: 60 },
  colAction: { flex: 1 },
  colTime: { width: 120 },

  btnDisabled: { opacity: 0.3 },
  loaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
});
