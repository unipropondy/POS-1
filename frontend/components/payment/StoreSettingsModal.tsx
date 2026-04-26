import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Theme } from "../../constants/theme";
import { Fonts } from "../../constants/Fonts";
import { API_URL } from "../../constants/Config";
import { usePaymentSettingsStore } from "../../stores/paymentSettingsStore";

interface StoreSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const StoreSettingsModal: React.FC<StoreSettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const { settings, fetchSettings, updateSettings } = usePaymentSettingsStore();
  
  const [upiId, setUpiId] = useState(settings.upiId || "");
  const [shopName, setShopName] = useState(settings.shopName || "");
  const [qrCodeUrl, setQrCodeUrl] = useState(settings.payNowQrUrl || "");
  
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setUpiId(settings.upiId || "");
      setShopName(settings.shopName || "");
      setQrCodeUrl(settings.payNowQrUrl || "");
      setPassword("");
      setIsUnlocked(false);
    }
  }, [visible, settings]);

  const handleUnlock = () => {
    // Basic admin password check
    if (password === "1234") {
      setIsUnlocked(true);
    } else {
      Alert.alert("Access Denied", "Incorrect Admin Password");
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'We need access to your photos to upload the QR code.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename || '');
      const type = match ? `image/${match[1]}` : `image`;

      formData.append('image', {
        uri,
        name: filename || 'qr_code.jpg',
        type,
      } as any);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      if (data.success) {
        setQrCodeUrl(data.imageUrl);
        Alert.alert("Success", "QR Code image uploaded successfully!");
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error: any) {
      Alert.alert("Upload Error", error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/settings/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upiId: upiId.trim(),
          shopName: shopName.trim(),
          qrCodeUrl: qrCodeUrl,
        }),
      });

      const data = await response.json();
      if (data.success) {
        updateSettings({ upiId, shopName, payNowQrUrl: qrCodeUrl });
        Alert.alert("Success", "Settings updated successfully!");
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isUnlocked) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.passwordBox}>
            <Text style={styles.title}>🔐 Admin Access</Text>
            <Text style={styles.subtitle}>Enter password to edit payment settings</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.unlockBtn]} onPress={handleUnlock}>
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚙️ Store Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll}>
            <Text style={styles.sectionTitle}>Business Info</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Shop Name (Display on QR)</Text>
              <TextInput
                style={styles.input}
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g. My Awesome Restaurant"
              />
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>UPI Configuration</Text>
            <View style={styles.field}>
              <Text style={styles.label}>UPI ID (Dynamic QR)</Text>
              <TextInput
                style={styles.input}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. shopname@okaxis"
                autoCapitalize="none"
              />
              <Text style={styles.helper}>Used to generate dynamic QR codes with exact amounts.</Text>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>PayNow Configuration</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Static QR Image (PayNow)</Text>
              {qrCodeUrl ? (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: `${API_URL}${qrCodeUrl}` }} style={styles.qrPreview} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => setQrCodeUrl("")}>
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadBtn} onPress={pickImage} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={Theme.primary} /> : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={32} color={Theme.primary} />
                      <Text style={styles.uploadText}>Upload QR Screenshot</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save All Settings</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  passwordBox: { backgroundColor: "#fff", padding: 25, borderRadius: 16, width: "85%", maxWidth: 400 },
  content: { backgroundColor: "#fff", width: "90%", height: "80%", borderRadius: 24, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: Theme.textPrimary },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 20 },
  scroll: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Theme.primary, marginBottom: 15 },
  field: { marginBottom: 15 },
  label: { fontSize: 14, color: "#444", marginBottom: 8, fontWeight: "600" },
  input: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, padding: 14, fontSize: 16 },
  helper: { fontSize: 12, color: "#718096", marginTop: 5 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: { flex: 1, padding: 15, borderRadius: 12, alignItems: "center" },
  cancelBtn: { backgroundColor: "#F1F5F9" },
  unlockBtn: { backgroundColor: Theme.primary },
  btnText: { fontWeight: "700", color: "#64748B" },
  unlockText: { fontWeight: "700", color: "#fff" },
  saveBtn: { backgroundColor: Theme.primary, padding: 18, borderRadius: 14, alignItems: "center", marginTop: 20 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  uploadBtn: { height: 180, borderStyle: "dashed", borderWidth: 2, borderColor: Theme.primary, borderRadius: 16, justifyContent: "center", alignItems: "center", backgroundColor: "#F0F9FF" },
  uploadText: { marginTop: 10, color: Theme.primary, fontWeight: "700" },
  previewContainer: { position: "relative", alignItems: "center" },
  qrPreview: { width: 200, height: 200, borderRadius: 12, borderWidth: 1, borderColor: "#eee" },
  removeBtn: { position: "absolute", top: 10, right: 10, backgroundColor: "#ef4444", padding: 8, borderRadius: 10 },
});

export default StoreSettingsModal;
