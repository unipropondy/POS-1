import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../constants/theme';
import { Fonts } from '../constants/Fonts';
import BillPDFGenerator from '../components/BillPDFGenerator';
import { useToast } from '../components/Toast';
import { API_URL } from '@/constants/Config';
import { useCompanySettingsStore } from '../stores/companySettingsStore';

export default function CompanySettingsScreen() {
  const { settings, loading, fetchSettings, updateSettings } = useCompanySettingsStore();
  const [userId, setUserId] = useState('1');
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      // ✅ CONSISTENT ID LOGIC: Match BillPDFGenerator
      const outletId = await AsyncStorage.getItem('selectedOutletId');
      const storedUserId = await AsyncStorage.getItem('userId') || '1';
      const targetId = outletId || storedUserId;
      
      setUserId(targetId);
      await fetchSettings(targetId);
    };
    load();
  }, []);

  const handleSave = async () => {
    // ✅ CONSISTENT ID LOGIC: Match BillPDFGenerator
    const outletId = await AsyncStorage.getItem('selectedOutletId');
    const storedUserId = await AsyncStorage.getItem('userId') || '1';
    const targetId = outletId || storedUserId;

    if (!targetId) return;
    setSaving(true);
    try {
      const success = await BillPDFGenerator.saveSettings(settings, targetId);
      if (success) {
        showToast({ type: 'success', message: 'Settings saved successfully' });
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      showToast({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type: 'company' | 'halal') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'error', message: 'Permission needed to access images' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6, // Slightly lower quality to keep DB size manageable
      base64: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      setSaving(true);
      try {
        // Use the base64 from asset if available (ImagePicker supports it)
        let base64Data = result.assets[0].base64;
        
        // If not available, we could fetch it, but ImagePicker quality 0.7 + base64: true is best
        if (!base64Data) {
          // Fallback if needed, but we'll enable it in the picker options
        }

        const dataUri = `data:image/jpeg;base64,${base64Data}`;
        updateSettings({
          [type === 'company' ? 'companyLogo' : 'halalLogo']: dataUri
        });
        showToast({ type: 'success', message: 'Logo processed successfully' });
      } catch (error) {
        showToast({ type: 'error', message: 'Failed to process image' });
      } finally {
        setSaving(false);
      }
    }
  };

  const getLogoUri = (logo: string) => {
    if (!logo) return undefined;
    if (logo.startsWith('data:image')) return logo;
    if (logo.startsWith('http')) return `${logo}?t=${Date.now()}`;
    return `${API_URL}${logo.startsWith('/') ? '' : '/'}${logo}?t=${Date.now()}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop Settings</Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Branding</Text>
            <View style={styles.logoGrid}>
              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Company Logo</Text>
                <TouchableOpacity 
                  style={[styles.logoPicker, settings.companyLogo ? styles.logoPickerActive : null]} 
                  onPress={() => pickImage('company')}
                >
                  {settings.companyLogo ? (
                    <Image source={{ uri: getLogoUri(settings.companyLogo) }} style={styles.logoPreview} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={30} color={Theme.textMuted} />
                  )}
                </TouchableOpacity>
                <View style={styles.statusContainer}>
                   <Text style={[styles.statusText, settings.companyLogo ? styles.statusSuccess : styles.statusMuted]}>
                     {settings.companyLogo ? '✅ Uploaded' : '❌ Not Uploaded'}
                   </Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>{settings.showCompanyLogo ? 'Active on bill' : 'Hidden on bill'}</Text>
                  <Switch 
                    value={settings.showCompanyLogo} 
                    onValueChange={(val) => { updateSettings({ showCompanyLogo: val }); }}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>

              <View style={styles.logoItem}>
                <Text style={styles.logoLabel}>Halal Logo</Text>
                <TouchableOpacity 
                  style={[styles.logoPicker, settings.halalLogo ? styles.logoPickerActive : null]} 
                  onPress={() => pickImage('halal')}
                >
                  {settings.halalLogo ? (
                    <Image source={{ uri: getLogoUri(settings.halalLogo) }} style={styles.logoPreview} />
                  ) : (
                    <Ionicons name="ribbon-outline" size={30} color={Theme.textMuted} />
                  )}
                </TouchableOpacity>
                <View style={styles.statusContainer}>
                   <Text style={[styles.statusText, settings.halalLogo ? styles.statusSuccess : styles.statusMuted]}>
                     {settings.halalLogo ? '✅ Uploaded' : '❌ Not Uploaded'}
                   </Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>{settings.showHalalLogo ? 'Active on bill' : 'Hidden on bill'}</Text>
                  <Switch 
                    value={settings.showHalalLogo} 
                    onValueChange={(val) => { updateSettings({ showHalalLogo: val }); }}
                    trackColor={{ false: '#ddd', true: Theme.primary }}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Shop Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shop Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Company Name</Text>
              <TextInput 
                style={styles.input}
                value={settings.name}
                onChangeText={(val) => { updateSettings({ name: val }); }}
                placeholder="Enter shop name"
                placeholderTextColor={Theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput 
                style={[styles.input, styles.textArea]}
                value={settings.address}
                onChangeText={(val) => { updateSettings({ address: val }); }}
                placeholder="Enter shop address"
                placeholderTextColor={Theme.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.phone}
                  onChangeText={(val) => { updateSettings({ phone: val }); }}
                  placeholder="+65 ..."
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.email}
                  onChangeText={(val) => { updateSettings({ email: val }); }}
                  placeholder="shop@example.com"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="email-address"
                />
              </View>
            </View>
          </View>

          {/* Tax & Currency */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tax & Currency</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstNo}
                  onChangeText={(val) => { updateSettings({ gstNo: val }); }}
                  placeholder="Registration No"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>GST (%)</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.gstPercentage.toString()}
                  onChangeText={(val) => { updateSettings({ gstPercentage: parseFloat(val) || 0 }); }}
                  placeholder="9.0"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Currency Code</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currency}
                  onChangeText={(val) => { updateSettings({ currency: val }); }}
                  placeholder="SGD"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Symbol</Text>
                <TextInput 
                  style={styles.input}
                  value={settings.currencySymbol}
                  onChangeText={(val) => { updateSettings({ currencySymbol: val }); }}
                  placeholder="$"
                  placeholderTextColor={Theme.textMuted}
                />
              </View>
            </View>
          </View>
          
          {/* Printer Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Printer Settings</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>WiFi Printer IP Address</Text>
              <TextInput 
                style={styles.input}
                value={settings.printerIp}
                onChangeText={(val) => { updateSettings({ printerIp: val }); }}
                placeholder="e.g. 192.168.1.100"
                placeholderTextColor={Theme.textMuted}
                keyboardType="numeric"
              />
              <Text style={[styles.note, { textAlign: 'left', marginTop: 5 }]}>
                Leave empty if using Sunmi or Web printing only.
              </Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  backButton: {
    padding: 5,
  },
  saveButton: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...Theme.shadowSm,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  logoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoItem: {
    width: '48%',
    alignItems: 'center',
  },
  logoLabel: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 10,
  },
  logoPicker: {
    width: 100,
    height: 100,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Theme.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.bgNav,
    overflow: 'hidden',
  },
  logoPickerActive: {
    borderStyle: 'solid',
    borderColor: Theme.primaryBorder,
    backgroundColor: Theme.primaryLight,
  },
  statusContainer: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Theme.bgNav,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  statusSuccess: {
    color: Theme.success,
  },
  statusMuted: {
    color: Theme.textMuted,
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
  },
  inputGroup: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Theme.bgNav,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Theme.textPrimary,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  note: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Theme.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
});
