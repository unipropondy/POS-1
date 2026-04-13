import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { API_URL } from "@/constants/Config";

type CancelReason = {
  CRCode: string;
  CRName: string;
  SortCode: number;
};

interface CancelOrderModalProps {
  visible: boolean;
  settlementId: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  visible,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const [reasons, setReasons] = useState<CancelReason[]>([]);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) fetchCancelReasons();
  }, [visible]);

  const fetchCancelReasons = async () => {
    setLoadingReasons(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/cancel-reasons`);
      const data = await response.json();
      setReasons(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load reasons");
    } finally {
      setLoadingReasons(false);
    }
  };

  const handleConfirm = () => {
    const reason = selectedReason === "other" ? customReason : selectedReason;
    if (!reason || reason.trim() === "") {
      setError("Please select or enter a reason");
      return;
    }
    onConfirm(reason);
    handleClose();
  };

  const handleClose = () => {
    setSelectedReason(null);
    setCustomReason("");
    setError("");
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <Ionicons name="alert-circle" size={24} color={Theme.danger} />
                <Text style={styles.title}>Cancel Order</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.label}>Select Cancellation Reason:</Text>

              {loadingReasons ? (
                <ActivityIndicator size="large" color={Theme.primary} style={{ marginVertical: 20 }} />
              ) : (
                <>
                  <FlatList
                    data={reasons}
                    keyExtractor={(item) => item.CRCode}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.reasonOption, selectedReason === item.CRName && styles.reasonSelected]}
                        onPress={() => { setSelectedReason(item.CRName); setError(""); }}
                      >
                        <View style={[styles.checkbox, selectedReason === item.CRName && styles.checkboxActive]}>
                          {selectedReason === item.CRName && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <Text style={[styles.reasonText, selectedReason === item.CRName && styles.reasonTextActive]}>{item.CRName}</Text>
                      </TouchableOpacity>
                    )}
                  />

                  <TouchableOpacity
                    style={[styles.reasonOption, selectedReason === "other" && styles.reasonSelected]}
                    onPress={() => { setSelectedReason("other"); setError(""); }}
                  >
                    <View style={[styles.checkbox, selectedReason === "other" && styles.checkboxActive]}>
                      {selectedReason === "other" && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.reasonText, selectedReason === "other" && styles.reasonTextActive]}>Other Reason</Text>
                  </TouchableOpacity>

                  {selectedReason === "other" && (
                    <TextInput
                      placeholder="Type details..."
                      placeholderTextColor={Theme.textMuted}
                      style={styles.input}
                      value={customReason}
                      onChangeText={(t) => { setCustomReason(t); setError(""); }}
                      multiline
                    />
                  )}
                </>
              )}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={isLoading}>
                <Text style={styles.cancelBtnText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (isLoading || !selectedReason) && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={isLoading || !selectedReason}
              >
                {isLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBtnText}>Confirm Cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, justifyContent: "center", width: "100%", alignItems: "center", padding: 20 },
  modal: { backgroundColor: Theme.bgCard, borderRadius: 24, width: "100%", maxWidth: 420, overflow: "hidden", ...Theme.shadowLg, borderWidth: 1, borderColor: Theme.border },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: Theme.border },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontFamily: Fonts.black, color: Theme.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 24, paddingVertical: 20 },
  label: { fontSize: 13, fontFamily: Fonts.black, color: Theme.textSecondary, marginBottom: 15, textTransform: "uppercase", letterSpacing: 0.5 },
  reasonOption: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: Theme.border, backgroundColor: Theme.bgCard, ...Theme.shadowSm },
  reasonSelected: { borderColor: Theme.danger, backgroundColor: Theme.danger + "08" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Theme.border, marginRight: 15, justifyContent: "center", alignItems: "center", backgroundColor: Theme.bgMuted },
  checkboxActive: { backgroundColor: Theme.danger, borderColor: Theme.danger },
  reasonText: { flex: 1, fontSize: 15, fontFamily: Fonts.bold, color: Theme.textSecondary },
  reasonTextActive: { color: Theme.textPrimary },
  input: { backgroundColor: Theme.bgInput, borderRadius: 12, padding: 15, marginTop: 10, color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 15, borderWidth: 1, borderColor: Theme.border, height: 100, textAlignVertical: "top", ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  errorText: { color: Theme.danger, fontSize: 11, fontFamily: Fonts.bold, marginTop: 12, textAlign: "center" },
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: Theme.border },
  cancelBtn: { flex: 1, height: 56, borderRadius: 16, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  cancelBtnText: { color: Theme.textSecondary, fontSize: 15, fontFamily: Fonts.black },
  confirmBtn: { flex: 1.5, height: 56, borderRadius: 16, backgroundColor: Theme.danger, justifyContent: "center", alignItems: "center", ...Theme.shadowMd },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: "#fff", fontSize: 15, fontFamily: Fonts.black },
});
