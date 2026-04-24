import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { CartItem, useCartStore } from "../stores/cartStore";

export default function EditDishModal({
  visible,
  onClose,
  item,
}: {
  visible: boolean;
  onClose: () => void;
  item: CartItem | null;
}) {
  const updateCartItemFull = useCartStore((s) => s.updateCartItemFull);

  const [note, setNote] = useState("");
  const [discountValue, setDiscountValue] = useState("0");
  const [isTakeaway, setIsTakeaway] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setNote(item.note || "");
      setDiscountValue((item.discount || 0).toString());
      setIsTakeaway(item.isTakeaway || false);
    }
  }, [visible, item]);

  const handleApply = () => {
    if (!item) return;
    updateCartItemFull(item.lineItemId, {
      note,
      discount: parseInt(discountValue) || 0,
      isTakeaway,
    });
    onClose();
  };

  if (!visible || !item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.iconCircle}>
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={Theme.primary}
                  />
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  Edit {item.name}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={Theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              {/* DISCOUNT SECTION */}
              <View style={styles.section}>
                <Text style={styles.label}>Discount Percentage (%)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputPrefix}>%</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    maxLength={3}
                    selectTextOnFocus
                  />
                </View>
              </View>

              {/* TAKEAWAY SECTION */}
              <View style={styles.section}>
                <Text style={styles.label}>Order Options</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    isTakeaway && styles.toggleBtnActive,
                  ]}
                  onPress={() => setIsTakeaway(!isTakeaway)}
                >
                  <Ionicons
                    name={isTakeaway ? "bag-handle" : "bag-handle-outline"}
                    size={22}
                    color={isTakeaway ? "#fff" : Theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      isTakeaway && styles.toggleTextActive,
                    ]}
                  >
                    Mark as Takeaway (TW)
                  </Text>
                  {isTakeaway && (
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>

              {/* NOTES SECTION */}
              <View style={styles.section}>
                <Text style={styles.label}>Special Instructions</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="e.g. Less spicy, no onions..."
                  placeholderTextColor={Theme.textMuted}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                <Text style={styles.applyBtnText}>Apply Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  container: {
    width: "100%",
    maxWidth: 340,
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    ...Theme.shadowLg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: Theme.textPrimary,
    fontSize: 18,
    fontFamily: Fonts.black,
    flex: 1,
  },
  closeBtn: {
    padding: 5,
    backgroundColor: Theme.bgMuted,
    borderRadius: 10,
  },
  body: {
    gap: 12,
  },
  section: {
    gap: 6,
  },
  label: {
    color: Theme.textMuted,
    fontSize: 11,
    fontFamily: Fonts.black,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgMain,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputPrefix: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.black,
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.black,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  noteInput: {
    backgroundColor: Theme.bgMain,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
    minHeight: 60,
    textAlignVertical: "top",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgMain,
    paddingHorizontal: 12,
    gap: 10,
  },
  toggleBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  toggleText: {
    flex: 1,
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  toggleTextActive: {
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.black,
  },
  applyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowMd,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: Fonts.black,
  },
});
