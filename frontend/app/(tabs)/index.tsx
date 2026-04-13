import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Fonts } from "../../constants/Fonts";
import { Theme } from "../../constants/theme";
import { API_URL } from "../../constants/Config";
import { useAuthStore } from "../../stores/authStore";

/* ============ ROLE CONFIG ============ */

const ROLE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  ADMIN:      { color: "#DC2626", icon: "shield-checkmark", label: "Administrator" },
  MANAGER:    { color: "#7C3AED", icon: "briefcase",        label: "Manager" },
  SUPERVISOR: { color: "#0891B2", icon: "eye",              label: "Supervisor" },
  CASHIER:    { color: Theme.primary, icon: "cash",         label: "Cashier" },
};

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setPermissions = useAuthStore((s) => s.setPermissions);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      // Reset state on focus
      setError("");
      setLoading(false);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]).start();
    }, [fadeAnim, slideAnim]),
  );

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!userName.trim() || !password.trim()) {
      setError("Please enter both User ID and Password.");
      shakeError();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: userName.trim(), password }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);

        // Fetch role-based permissions from DB immediately after login
        try {
          const permRes = await fetch(`${API_URL}/api/auth/permissions/${data.user.role}`);
          if (permRes.ok) {
            const permData = await permRes.json();
            setPermissions(permData);
          }
        } catch {
          // Permissions fetch failed — non-fatal, admin still has full access via role check
          setPermissions({});
        }

        router.replace("/(tabs)/category");
      } else {
        setError(data.message || "Login failed. Please try again.");
        shakeError();
      }
    } catch (err) {
      setError("Cannot connect to server. Check your network.");
      shakeError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background */}
      <LinearGradient colors={[Theme.primary, "#1A1A1A"]} style={StyleSheet.absoluteFill}>
        <View style={[styles.bgCircle, styles.bgCircle1]} />
        <View style={[styles.bgCircle, styles.bgCircle2]} />
      </LinearGradient>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.centeredContent}>
            <Animated.View
              style={[
                styles.content,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
              ]}
            >
              {/* Logo */}
              <View style={styles.logoWrap}>
                <View style={styles.logoBadge}>
                  <Ionicons name="restaurant" size={44} color={Theme.primary} />
                </View>
                <Text style={styles.appName}>Smart Cafe POS</Text>
                <Text style={styles.appTagline}>Point of Sale System</Text>
              </View>

              {/* Card */}
              <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
                <Text style={styles.cardTitle}>Sign In</Text>
                <Text style={styles.cardSubtitle}>Enter your credentials to continue</Text>

                {/* Error Banner */}
                {error !== "" && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color="#DC2626" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* User ID */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>User ID</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="person-outline" size={18} color={Theme.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your User ID"
                      placeholderTextColor={Theme.textMuted}
                      value={userName}
                      onChangeText={(t) => { setUserName(t); setError(""); }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="lock-closed-outline" size={18} color={Theme.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Enter your Password"
                      placeholderTextColor={Theme.textMuted}
                      value={password}
                      onChangeText={(t) => { setPassword(t); setError(""); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                    <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Theme.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Login Button */}
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonLoading]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={22} color="#fff" />
                      <Text style={styles.buttonText}>Sign In</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Roles info */}
                <View style={styles.rolesRow}>
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <View key={key} style={[styles.roleChip, { borderColor: cfg.color + "40", backgroundColor: cfg.color + "10" }]}>
                      <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
                      <Text style={[styles.roleChipText, { color: cfg.color }]}>{key}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>

              {/* Footer */}
              <Text style={styles.footerText}>© 2026 Unipro Softwares SG Pte Ltd</Text>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Theme.primary },
  safeArea:       { flex: 1 },
  keyboardView:   { flex: 1 },
  centeredContent: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  content:        { width: "100%", maxWidth: 440, alignItems: "center" },

  bgCircle:   { position: "absolute", borderRadius: 999 },
  bgCircle1:  { width: 300, height: 300, backgroundColor: "rgba(255,255,255,0.08)", top: -60, left: -60 },
  bgCircle2:  { width: 420, height: 420, backgroundColor: "rgba(0,0,0,0.08)", bottom: -100, right: -80 },

  logoWrap:   { alignItems: "center", marginBottom: 28 },
  logoBadge:  {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
  },
  appName:     { color: "#fff", fontSize: 28, fontFamily: Fonts.black, letterSpacing: -0.5 },
  appTagline:  { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: Fonts.medium, marginTop: 4 },

  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 28,
    ...Theme.shadowLg,
  },
  cardTitle:    { color: Theme.textPrimary, fontSize: 22, fontFamily: Fonts.black, marginBottom: 4 },
  cardSubtitle: { color: Theme.textMuted, fontSize: 13, fontFamily: Fonts.medium, marginBottom: 20 },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16, borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { color: "#DC2626", fontSize: 13, fontFamily: Fonts.medium, flex: 1 },

  inputGroup:  { marginBottom: 16 },
  inputLabel:  { color: Theme.textSecondary, fontSize: 12, fontFamily: Fonts.bold, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Theme.bgMain, borderRadius: 14,
    borderWidth: 1.5, borderColor: Theme.border,
    paddingHorizontal: 14, height: 52,
  },
  inputIcon:   { marginRight: 10 },
  input:       { flex: 1, color: Theme.textPrimary, fontSize: 16, fontFamily: Fonts.medium, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  eyeBtn:      { padding: 4 },

  button: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 10, backgroundColor: Theme.primary, height: 58,
    borderRadius: 16, marginTop: 8, ...Theme.shadowMd, shadowColor: Theme.primary,
  },
  buttonLoading: { opacity: 0.75 },
  buttonText:    { color: "#fff", fontSize: 18, fontFamily: Fonts.black },

  rolesRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 20, justifyContent: "center" },
  roleChip:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  roleChipText: { fontSize: 10, fontFamily: Fonts.bold },

  footerText: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: Fonts.medium, marginTop: 24 },
});
