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
  const updateCartItemTakeaway = useCartStore((s) => s.updateCartItemTakeaway);
  const updateCartItemDiscount = useCartStore((s) => s.updateCartItemDiscount);

  const [discountValue, setDiscountValue] = useState("0");
  const [isTakeaway, setIsTakeaway] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setDiscountValue((item.discount || 0).toString());
      setIsTakeaway(item.isTakeaway || false);
    }
  }, [visible, item]);

  const handleApply = () => {
    if (!item) return;
    updateCartItemDiscount(item.lineItemId, parseInt(discountValue) || 0);
    updateCartItemTakeaway(item.lineItemId, isTakeaway);
    onClose();
  };

  if (!item) return null;

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
                  <Ionicons name="create-outline" size={18} color={Theme.primary} />
                </View>
                <Text style={styles.title} numberOfLines={1}>Edit {item.name}</Text>
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
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={handleApply}
              >
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
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 400,
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: Theme.textPrimary,
    fontSize: 20,
    fontFamily: Fonts.black,
    flex: 1,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: Theme.bgMuted,
    borderRadius: 12,
  },
  body: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    color: Theme.textMuted,
    fontSize: 12,
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
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 54,
  },
  inputPrefix: {
    color: Theme.textSecondary,
    fontSize: 18,
    fontFamily: Fonts.black,
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Theme.textPrimary,
    fontSize: 18,
    fontFamily: Fonts.black,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgMain,
    paddingHorizontal: 16,
    gap: 12,
  },
  toggleBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  toggleText: {
    flex: 1,
    color: Theme.textSecondary,
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  toggleTextActive: {
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
  },
  cancelBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.black,
  },
  applyBtn: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowMd,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: Fonts.black,
  },
});
