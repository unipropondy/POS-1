import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from "react-native";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { GstTaxMode, useGstStore } from "../stores/gstStore";

interface Props {
  visible: boolean;
  onClose: () => void;
  previewSubtotal?: number;
}

const PRESETS = [0, 2.15, 6, 9, 10];

export default function GstSettingsModal({
  visible,
  onClose,
  previewSubtotal = 100,
}: Props) {
  const {
    percentage,
    registrationNumber,
    taxMode: savedMode,
    enabled: savedEnabled,
    updateSettings,
  } = useGstStore();

  const [percentStr, setPercentStr] = useState("2.15");
  const [regNo, setRegNo] = useState("");
  const [regErr, setRegErr] = useState(false);
  const [taxMode, setTaxMode] = useState<GstTaxMode>("exclusive");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (visible) {
      setPercentStr(percentage.toString());
      setRegNo(registrationNumber);
      setTaxMode(savedMode ?? "exclusive");
      setEnabled(savedEnabled ?? false);
      setRegErr(false);
    }
  }, [visible]);

  const rate = parseFloat(percentStr) || 0;
  const gstAmt = taxMode === "exclusive"
    ? +((previewSubtotal * rate) / 100).toFixed(2)
    : +(previewSubtotal - previewSubtotal / (1 + rate / 100)).toFixed(2);

  const total = taxMode === "exclusive" ? +(previewSubtotal + gstAmt).toFixed(2) : previewSubtotal;
  const baseAmt = taxMode === "inclusive" ? +(previewSubtotal - gstAmt).toFixed(2) : previewSubtotal;
  const isValid = !isNaN(rate) && rate >= 0 && rate <= 100;

  const handleRegChange = (v: string) => {
    setRegNo(v);
    setRegErr(v.trim().length > 0 && v.trim().length < 5);
  };

  const handleSave = async () => {
    if (!isValid || regErr) return;
    await updateSettings(rate, regNo.trim(), taxMode, enabled);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.titleRow}>
            <View style={s.titleLeft}>
              <View style={[s.dot, { backgroundColor: enabled ? Theme.success : Theme.textMuted }]} />
              <Text style={s.title}>Tax Settings</Text>
            </View>
            <View style={s.titleRight}>
              <Text style={[s.toggleLabel, { color: enabled ? Theme.success : Theme.textSecondary }]}>{enabled ? "ACTIVE" : "INACTIVE"}</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: Theme.border, true: Theme.success + "80" }}
                thumbColor={enabled ? Theme.success : Theme.textMuted}
                ios_backgroundColor={Theme.bgMuted}
              />
              <TouchableOpacity onPress={onClose} style={s.closeBtn}><Ionicons name="close" size={20} color={Theme.textSecondary} /></TouchableOpacity>
            </View>
          </View>

          <View style={{ opacity: enabled ? 1 : 0.5 }} pointerEvents={enabled ? "auto" : "none"}>
            <View style={s.modeRow}>
              <TouchableOpacity style={[s.modeBtn, taxMode === "exclusive" && s.modeBtnActive]} onPress={() => setTaxMode("exclusive")}>
                <Ionicons name="add-circle" size={18} color={taxMode === "exclusive" ? "#fff" : Theme.textSecondary} />
                <Text style={[s.modeTxt, taxMode === "exclusive" && s.modeTxtActive]}>Excl. GST</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modeBtn, taxMode === "inclusive" && s.modeBtnActive]} onPress={() => setTaxMode("inclusive")}>
                <Ionicons name="checkmark-circle" size={18} color={taxMode === "inclusive" ? "#fff" : Theme.textSecondary} />
                <Text style={[s.modeTxt, taxMode === "inclusive" && s.modeTxtActive]}>Incl. GST</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modeHint}>
              {taxMode === "exclusive" ? "Tax is added on top of the menu price" : "Tax is already included in the price"}
            </Text>

            <View style={s.preview}>
              <View>
                <Text style={s.previewLabel}>SUBTOTAL</Text>
                <Text style={s.previewVal}>${baseAmt.toFixed(2)}</Text>
              </View>
              <View style={s.previewDivider} />
              <View style={{ alignItems: "center" }}>
                <Text style={s.previewLabel}>TAX ({rate}%)</Text>
                <Text style={[s.previewVal, { color: Theme.success }]}>+${gstAmt.toFixed(2)}</Text>
              </View>
              <View style={s.previewDivider} />
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.previewLabel}>GRAND TOTAL</Text>
                <Text style={[s.previewVal, { color: Theme.primary }]}>${total.toFixed(2)}</Text>
              </View>
            </View>

            <Text style={s.label}>QUICK SELECT</Text>
            <View style={s.presetRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity key={p} style={[s.preset, rate === p && s.presetActive]} onPress={() => setPercentStr(p.toString())}>
                  <Text style={[s.presetTxt, rate === p && s.presetTxtActive]}>{p}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>CUSTOM RATE (%)</Text>
            <View style={s.inputWrap}>
              <TextInput style={s.input} value={percentStr} onChangeText={setPercentStr} keyboardType="numeric" placeholder="2.15" placeholderTextColor={Theme.textMuted} selectTextOnFocus />
              <Ionicons name="calculator-outline" size={20} color={Theme.primary} />
            </View>

            <Text style={[s.label, { marginTop: 16 }]}>GST REGISTRATION NO. <Text style={{ color: Theme.textMuted }}>(Optional)</Text></Text>
            <TextInput style={[s.inputFull, regErr && s.inputErr]} value={regNo} onChangeText={handleRegChange} placeholder="e.g. M2-1234567-X" placeholderTextColor={Theme.textMuted} autoCapitalize="characters" />
            {regErr && <Text style={s.errTxt}>Invalid format — check registration number</Text>}
          </View>

          <View style={s.btns}>
            <TouchableOpacity style={s.btnCancel} onPress={onClose}><Text style={s.btnCancelTxt}>Discard</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btnSave, (!isValid || regErr) && s.btnDisabled]} onPress={handleSave} disabled={!isValid || regErr}><Text style={s.btnSaveTxt}>Apply Settings</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { backgroundColor: Theme.bgCard, width: "100%", maxWidth: 420, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowLg },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 18, letterSpacing: 0.5 },
  titleRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel: { fontSize: 10, fontFamily: Fonts.black, letterSpacing: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Theme.bgMuted, justifyContent: "center", alignItems: "center" },
  modeRow: { flexDirection: "row", backgroundColor: Theme.bgMuted, borderRadius: 14, padding: 4, marginBottom: 10, borderWidth: 1, borderColor: Theme.border },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10 },
  modeBtnActive: { backgroundColor: Theme.primary, ...Theme.shadowSm },
  modeTxt: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 13 },
  modeTxtActive: { color: "#fff" },
  modeHint: { color: Theme.textMuted, fontSize: 11, fontFamily: Fonts.medium, textAlign: "center", marginBottom: 20 },
  preview: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Theme.bgMuted, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Theme.border },
  previewLabel: { color: Theme.textMuted, fontSize: 9, fontFamily: Fonts.black, letterSpacing: 1.2, marginBottom: 6 },
  previewVal: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  previewDivider: { width: 1, height: 30, backgroundColor: Theme.border },
  label: { color: Theme.textSecondary, fontSize: 10, fontFamily: Fonts.black, letterSpacing: 1.2, marginBottom: 10 },
  presetRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  preset: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Theme.bgCard, alignItems: "center", borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm },
  presetActive: { backgroundColor: Theme.primary + "10", borderColor: Theme.primary },
  presetTxt: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 13 },
  presetTxtActive: { color: Theme.primary },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Theme.bgInput, borderRadius: 14, borderWidth: 1, borderColor: Theme.border, paddingHorizontal: 16, height: 56, marginBottom: 10 },
  input: { flex: 1, color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 18, paddingVertical: 12, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  inputFull: { backgroundColor: Theme.bgInput, borderWidth: 1, borderColor: Theme.border, borderRadius: 14, padding: 16, color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  inputErr: { borderColor: Theme.danger },
  errTxt: { color: Theme.danger, fontSize: 11, fontFamily: Fonts.medium, marginTop: 6 },
  btns: { flexDirection: "row", gap: 12, marginTop: 24 },
  btnCancel: { flex: 1, height: 56, justifyContent: "center", alignItems: "center", backgroundColor: Theme.bgMuted, borderRadius: 16, borderWidth: 1, borderColor: Theme.border },
  btnCancelTxt: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 14 },
  btnSave: { flex: 2, height: 56, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: Theme.primary, borderRadius: 16, ...Theme.shadowMd },
  btnSaveTxt: { color: "#fff", fontFamily: Fonts.black, fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
