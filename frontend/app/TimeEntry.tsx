import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
  Animated,
} from "react-native";
import { Theme } from "../constants/theme";
import { Fonts } from "../constants/Fonts";

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

  // Animation values for hover/press effect
  const btnScales: { [key: number]: Animated.Value } = {
    0: useRef(new Animated.Value(1)).current,
    1: useRef(new Animated.Value(1)).current,
    3: useRef(new Animated.Value(1)).current,
    4: useRef(new Animated.Value(1)).current,
  };

  const handlePressIn = (id: number) => {
    Animated.spring(btnScales[id], { toValue: 0.96, useNativeDriver: true }).start();
  };
  const handlePressOut = (id: number) => {
    Animated.spring(btnScales[id], { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadSavedCredentials();
  }, []);

  useEffect(() => {
    if (userId) fetchTodaySummary();
  }, [userId]);

  useEffect(() => {
    if (userName.length > 0) {
      const delayFetch = setTimeout(() => fetchStaffName(userName), 500);
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
    } catch (_) {}
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
      if (response.ok) setTodayLogs(data);
    } catch (_) {}
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
    } catch (_) {}
  };

  const handleAction = async (status: number) => {
    if (!userId || !password) {
      Alert.alert("Error", "Enter ID & Password");
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
      if (!res.ok) throw new Error(data.message || "Failed");
      if (status !== 1) setPassword("");
      Alert.alert("Success", data.message);
      await fetchTodaySummary();
      if (status === 0) {
        setUserName(""); setPassword(""); setStaffName(""); setUserId("");
        setTodaySummary(null); setTodayLogs([]);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const lastStatus = todaySummary?.lastStatus;
  const canLogin = (lastStatus === 0 || lastStatus === null || !userId);
  const canOut = (lastStatus === 1 || lastStatus === 4);
  const canBreakIn = (lastStatus === 1 || lastStatus === 4);
  const canBreakOut = (lastStatus === 3);

  const getStatus = () => {
    switch (lastStatus) {
      case 1: return { text: "ACTIVE", color: Theme.success };
      case 3: return { text: "BREAK", color: Theme.warning };
      case 4: return { text: "ACTIVE", color: Theme.info };
      default: return { text: "OFF", color: Theme.textMuted };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Theme.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Attendance</Text>
        <View style={styles.timeBadge}>
          <Text style={styles.headerTime}>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchTodaySummary} tintColor={Theme.primary} />}
        >
          {/* Main Control Panel (Swapped Layout) */}
          <View style={styles.mainCard}>
            <View style={styles.topRow}>
              {/* Inputs on the LEFT */}
              <View style={styles.inputBox}>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={14} color={Theme.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={userName}
                    onChangeText={setUserName}
                    placeholder="User ID"
                    placeholderTextColor={Theme.textMuted}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={14} color={Theme.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="PIN"
                    placeholderTextColor={Theme.textMuted}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Staff Info on the RIGHT */}
              <View style={styles.staffBox}>
                <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
                  <Text style={styles.staffName}>{staffName || "Select Staff"}</Text>
                  <View style={styles.statusRow}>
                    {todaySummary && <Text style={[styles.hoursText, { marginRight: 8 }]}>{todaySummary.netHours.toFixed(2)}h Today</Text>}
                    <Text style={[styles.statusText, { color: getStatus().color }]}>{getStatus().text}</Text>
                    <View style={[styles.statusDot, { backgroundColor: getStatus().color, marginLeft: 6, marginRight: 0 }]} />
                  </View>
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{staffName ? staffName.charAt(0) : "?"}</Text>
                </View>
              </View>
            </View>

            {/* High Contrast Action Grid */}
            <View style={styles.grid}>
              {[
                { id: 1, label: "CLOCK IN", icon: "enter", color: "#10b981", active: canLogin },
                { id: 3, label: "BREAK IN", icon: "cafe", color: "#f59e0b", active: canBreakIn },
                { id: 4, label: "BREAK OUT", icon: "play", color: "#3b82f6", active: canBreakOut },
                { id: 0, label: "CLOCK OUT", icon: "power", color: "#ef4444", active: canOut },
              ].map((btn) => (
                <Animated.View key={btn.id} style={{ flex: 1, transform: [{ scale: btnScales[btn.id] }] }}>
                  <TouchableOpacity
                    disabled={!btn.active}
                    onPressIn={() => handlePressIn(btn.id)}
                    onPressOut={() => handlePressOut(btn.id)}
                    onPress={() => handleAction(btn.id)}
                    style={[
                      styles.gridBtn, 
                      btn.active ? { backgroundColor: btn.color } : styles.btnDisabled
                    ]}
                  >
                    <Ionicons name={btn.icon as any} size={24} color={btn.active ? "#fff" : Theme.textMuted} />
                    <Text style={[styles.btnLabel, { color: btn.active ? "#fff" : Theme.textMuted }]}>{btn.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>

          {/* Minimalist Logs */}
          {todayLogs.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>RECENT RECORDS</Text>
              {todayLogs.slice(0, 3).map((log, i) => (
                <View key={i} style={styles.historyCard}>
                  <View style={styles.historyIcon}>
                    <Ionicons name="time-outline" size={14} color={Theme.primary} />
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.historyAction}>{log.ActionName}</Text>
                    <Text style={styles.historyTime}>{new Date(log.ClockinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && <View style={styles.loader}><ActivityIndicator color={Theme.primary} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bgMain },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    backgroundColor: Theme.bgCard, 
    borderBottomWidth: 1, 
    borderBottomColor: Theme.border 
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: Fonts.black, color: Theme.textPrimary, marginLeft: 12 },
  timeBadge: { backgroundColor: Theme.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  headerTime: { fontSize: 13, fontFamily: Fonts.black, color: Theme.primary },
  
  content: { padding: 16 },
  
  mainCard: { 
    backgroundColor: Theme.bgCard, 
    borderRadius: 20, 
    padding: 20, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: Theme.border, 
    ...Theme.shadowMd 
  },
  topRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: 20,
    gap: 20,
  },
  staffBox: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 14, 
    backgroundColor: Theme.primaryLight, 
    alignItems: "center", 
    justifyContent: "center", 
    marginRight: 12 
  },
  avatarText: { fontSize: 20, fontFamily: Fonts.black, color: Theme.primary },
  staffName: { fontSize: 17, fontFamily: Fonts.black, color: Theme.textPrimary },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, fontFamily: Fonts.bold },
  hoursText: { fontSize: 11, fontFamily: Fonts.medium, color: Theme.textSecondary, marginLeft: 8 },

  inputBox: { flex: 1, gap: 10, maxWidth: 300 },
  inputWrapper: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: Theme.bgInput, 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    height: 40, 
    borderWidth: 1, 
    borderColor: Theme.border 
  },
  input: { flex: 1, marginLeft: 8, fontSize: 14, fontFamily: Fonts.bold, color: Theme.textPrimary },

  grid: { flexDirection: "row", gap: 12 },
  gridBtn: { 
    height: 80, 
    borderRadius: 16, 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 6,
    ...Theme.shadowSm 
  },
  btnLabel: { fontSize: 11, fontFamily: Fonts.black, textTransform: 'uppercase' },
  btnDisabled: { backgroundColor: Theme.bgMuted, borderWidth: 1, borderColor: Theme.border },

  historySection: { marginTop: 10 },
  sectionTitle: { fontSize: 10, fontFamily: Fonts.black, color: Theme.textMuted, letterSpacing: 1, marginBottom: 10 },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  historyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  historyAction: { fontSize: 13, fontFamily: Fonts.bold, color: Theme.textPrimary },
  historyTime: { fontSize: 12, fontFamily: Fonts.medium, color: Theme.textSecondary },

  loader: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }
});
