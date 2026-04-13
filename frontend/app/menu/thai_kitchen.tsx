import { API_URL } from "@/constants/Config";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CartSidebar from "../../components/CartSidebar";
import { Fonts } from "../../constants/Fonts";
import { Theme } from "../../constants/theme";
import {
  addToCartGlobal,
  getContextId,
  setCurrentContext,
  useCartStore,
} from "../../stores/cartStore";
import { useOrderContextStore } from "../../stores/orderContextStore";

const IMAGE_BASE_URL = `${API_URL}/api/menu/image/`;

// --- COMPONENTS ---

const NavRail = () => {
  const router = useRouter();
  const navItems = [
    { id: "home", icon: "home-outline", label: "Home", active: true },
  ];

  return (
    <View style={styles.rail}>
      <View style={styles.railTop}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.railItem, item.active && styles.railItemActive]}
          >
            <Ionicons
              name={item.icon as any}
              size={22}
              color={item.active ? Theme.primary : Theme.textSecondary}
            />
            <Text
              style={[styles.railLabel, item.active && styles.railLabelActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.railBottom}>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => router.replace("/")}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color={Theme.textSecondary}
          />
          <Text style={styles.railLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DishCard = React.memo(
  ({ dish, width, cartQty, onPress, isPhone, isTablet }: any) => {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          { width, padding: isPhone ? 8 : isTablet ? 12 : 10 },
        ]}
        onPress={() => onPress(dish)}
        activeOpacity={0.7}
      >
        {cartQty > 0 && (
          <View
            style={[
              styles.qtyBadge,
              isPhone
                ? { width: 22, height: 22, borderRadius: 11 }
                : isTablet
                  ? { width: 32, height: 32, borderRadius: 16 }
                  : null,
            ]}
          >
            <Text
              style={[
                styles.qtyBadgeText,
                isPhone ? { fontSize: 11 } : isTablet ? { fontSize: 15 } : null,
              ]}
            >
              {cartQty}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.dishImageWrap,
            isPhone
              ? { width: 50, height: 50, marginBottom: 4 }
              : isTablet
                ? {
                    width: 75,
                    height: 75,
                    marginBottom: 6,
                    borderRadius: 37.5,
                  }
                : null,
          ]}
        >
          {dish.Image ? (
            <Image
              source={{ uri: `${IMAGE_BASE_URL}${dish.Image}` }}
              style={styles.dishImg}
            />
          ) : (
            <View
              style={[
                styles.dishImg,
                {
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: Theme.bgMuted,
                },
              ]}
            >
              <Ionicons
                name="restaurant-outline"
                size={isPhone ? 24 : isTablet ? 48 : 40}
                color={Theme.textMuted}
              />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.dishName,
            isPhone
              ? { fontSize: 11, minHeight: 42, lineHeight: 14 }
              : isTablet
                ? { fontSize: 13, minHeight: 48, lineHeight: 16 }
                : null,
          ]}
          numberOfLines={3}
        >
          {dish.Name}
        </Text>
        <Text
          style={[
            styles.dishPrice,
            isPhone ? { fontSize: 12 } : isTablet ? { fontSize: 14 } : null,
          ]}
        >
          ${(dish.Price || 0).toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  },
);

// --- SCREEN ---

export default function MenuScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [kitchens, setKitchens] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [isLoadingDishes, setIsLoadingDishes] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [selectedKitchenId, setSelectedKitchenId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [searchText, setSearchText] = useState("");
  const [allDishes, setAllDishes] = useState<any[]>([]);

  // Modifier Modal State
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [showModifier, setShowModifier] = useState(false);
  const [selectedDish, setSelectedDish] = useState<any | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [loadingModifiers, setLoadingModifiers] = useState(false);

  // Custom Item Submodal (Screenshot Flow)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customMods, setCustomMods] = useState<any[]>([]);
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(
    null,
  );

  const orderContext = useOrderContextStore((state) => state.currentOrder);
  const carts = useCartStore((state) => state.carts);

  const isLandscape = width > 900;
  const isTabletPortrait = width >= 600 && width <= 900;
  const isPhone = width < 600;
  const isLarge = true; // Always show cart on all devices

  const cartWidth = isLandscape ? 380 : isTabletPortrait ? 330 : width * 0.55;
  const mainWidth = width - cartWidth;

  const columns = width > 1200 ? 5 : width > 900 ? 3 : isPhone ? 1 : 2;
  const gap = isPhone ? 8 : 12; // Smaller gap for phones
  const cardWidth =
    (mainWidth - (isPhone ? 20 : 40) - gap * (columns - 1)) / columns;

  const dismissKeyboard = () => Keyboard.dismiss();

  useEffect(() => {
    const newId = getContextId(orderContext);
    setCurrentContext(newId);
  }, [orderContext]);

  useEffect(() => {
    setIsInitialLoading(true);
    fetch(`${API_URL}/api/menu/kitchens`)
      .then((res) => res.json())
      .then((data) => {
        const safeData = Array.isArray(data) ? data : [];
        const filtered = safeData.filter(
          (k: any) => k.KitchenTypeName && !k.KitchenTypeName.includes("TEST"),
        );
        setKitchens(filtered);
        if (filtered.length > 0) loadGroups(filtered[0].CategoryId);
        setIsInitialLoading(false);
      });

    fetch(`${API_URL}/api/dishes/all`)
      .then((res) => res.json())
      .then((data) => setAllDishes(Array.isArray(data) ? data : []))
      .catch((e) => console.log(e));
  }, []);

  const loadGroups = async (kitchenId: string) => {
    setSelectedKitchenId(kitchenId);
    try {
      const res = await fetch(`${API_URL}/api/menu/dishgroups/${kitchenId}`);
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0)
        loadDishes(data[0].DishGroupId);
    } catch (e) {
      console.log(e);
    }
  };

  const loadDishes = async (groupId: string) => {
    setSelectedGroup(groupId);
    setIsLoadingDishes(true);
    try {
      const res = await fetch(`${API_URL}/api/menu/dishes/group/${groupId}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoadingDishes(false);
    }
  };

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return items;

    // Search across all dishes if query exists
    return allDishes.filter((d) => {
      const name = (d.Name || d.DishName || "").toLowerCase();
      return name.includes(query);
    });
  }, [searchText, items, allDishes]);

  const openModifiers = React.useCallback(async (dish: any) => {
    setSelectedDish(dish);
    setSelectedModifierIds([]);
    setCustomMods([]);
    setModifiers([]);
    setLoadingModifiers(true);

    try {
      const res = await fetch(`${API_URL}/api/menu/modifiers/${dish.DishId}`);
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setModifiers(data);
        setShowModifier(true);
      } else {
        addToCartGlobal({
          id: dish.DishId,
          name: dish.Name,
          price: dish.Price || 0,
        });
        setModifiers([]);
        setShowModifier(false);
      }
    } catch (err) {
      console.error(err);
      addToCartGlobal({
        id: dish.DishId,
        name: dish.Name,
        price: dish.Price || 0,
      });
      setModifiers([]);
      setShowModifier(false);
    } finally {
      setLoadingModifiers(false);
    }
  }, []);

  const renderDishItem = React.useCallback(
    ({ item }: { item: any }) => {
      const ctxId = getContextId(orderContext);
      const currentCart = ctxId ? carts[ctxId] || [] : [];

      const cartQty = currentCart.reduce((acc: number, cartItem: any) => {
        return cartItem.id === item.DishId ? acc + cartItem.qty : acc;
      }, 0);

      return (
        <DishCard
          dish={item}
          width={cardWidth}
          cartQty={cartQty}
          onPress={openModifiers}
          isPhone={isPhone}
          isTablet={isTabletPortrait}
        />
      );
    },
    [orderContext, carts, cardWidth, openModifiers],
  );

  const toggleModifier = (mod: any) => {
    if (mod.ModifierName.toUpperCase() === "OPEN") {
      setShowCustomModal(true);
      return;
    }

    setSelectedModifierIds((prev) => {
      const next = prev.includes(mod.ModifierID)
        ? prev.filter((id) => id !== mod.ModifierID)
        : [...prev, mod.ModifierID];
      return next;
    });
  };

  const addCustomMod = () => {
    if (!customItemName) return;
    const newId = `custom-${Date.now()}`;
    const newMod = {
      ModifierID: newId,
      ModifierName: customItemName,
      Price: parseFloat(customItemPrice) || 0,
    };

    setCustomMods((prev) => [...prev, newMod]);
    setSelectedModifierIds((prev) => [...prev, newId]);

    setShowCustomModal(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const addWithModifiers = () => {
    if (selectedDish) {
      const allAvailable = [...modifiers, ...customMods];
      const selectedMods = allAvailable.filter((m) =>
        selectedModifierIds.includes(m.ModifierID),
      );

      const modsToAdd = selectedMods.map((m) => ({
        ModifierId: m.ModifierID || m.ModifierId,
        ModifierName: m.ModifierName,
        Price: m.Price || 0,
      }));

      const extra = modsToAdd.reduce((sum, m) => sum + (m.Price || 0), 0);
      const finalPrice = (selectedDish.Price || 0) + extra;

      addToCartGlobal({
        id: selectedDish.DishId,
        name: selectedDish.Name,
        price: finalPrice,
        modifiers: modsToAdd as any,
        basePrice: selectedDish.Price || 0,
      });
    }
    setShowModifier(false);
  };

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={() => router.replace("/(tabs)/category")}
        style={styles.backBtn}
      >
        <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
      </TouchableOpacity>
      <View style={styles.searchWrap}>
        <Ionicons
          name="search"
          size={20}
          color={Theme.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products....."
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={Theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.topActions}>
        {!isLarge && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: Theme.success }]}
            onPress={() => router.push("/cart")}
          >
            <Ionicons name="cart" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderCategoryNav = () => (
    <View style={styles.categoryNavigation}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catScroll}
      >
        {kitchens.map((k) => (
          <TouchableOpacity
            key={k.CategoryId}
            style={[
              styles.catPill,
              selectedKitchenId === k.CategoryId && styles.catPillActive,
            ]}
            onPress={() => loadGroups(k.CategoryId)}
          >
            <Text
              style={[
                styles.catText,
                selectedKitchenId === k.CategoryId && styles.catTextActive,
              ]}
            >
              {k.KitchenTypeName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ marginTop: 15 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groupScroll}
        >
          {groups.map((g) => (
            <TouchableOpacity
              key={g.DishGroupId}
              style={[
                styles.groupPill,
                selectedGroup === g.DishGroupId && styles.groupPillActive,
              ]}
              onPress={() => loadDishes(g.DishGroupId)}
            >
              <Text
                style={[
                  styles.groupText,
                  selectedGroup === g.DishGroupId && styles.groupTextActive,
                ]}
              >
                {g.DishGroupName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  if (!orderContext)
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Select Table First</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        {isLandscape ? (
          <View style={styles.layout}>
            {/* DESKTOP LAYOUT - Full height sidebar */}
            <View style={[styles.main, { width: mainWidth }]}>
              {renderTopBar()}
              {renderCategoryNav()}
              <View style={styles.gridContainer}>
                {isLoadingDishes ? (
                  <ActivityIndicator
                    color={Theme.primary}
                    style={{ marginTop: 50 }}
                  />
                ) : (
                  <FlatList
                    data={filteredItems}
                    keyExtractor={(item) => item.DishId}
                    numColumns={columns}
                    key={columns}
                    renderItem={renderDishItem}
                    columnWrapperStyle={
                      columns > 1 ? { gap: gap, marginBottom: gap } : undefined
                    }
                    contentContainerStyle={[
                      styles.listPadding,
                      columns === 1 && { gap: gap },
                    ]}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </View>
            </View>
            {isLarge && <CartSidebar width={cartWidth} />}
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
            {/* TAB/PHONE LAYOUT - Hawker Style */}
            <View style={{ padding: isPhone ? 10 : 20, paddingBottom: 0 }}>
              {renderTopBar()}
              {renderCategoryNav()}
            </View>

            <View style={[styles.layout, { flex: 1 }]}>
              <View
                style={[
                  styles.main,
                  {
                    width: mainWidth,
                    paddingTop: 0,
                    paddingHorizontal: isPhone ? 10 : 20,
                  },
                ]}
              >
                <View style={styles.gridContainer}>
                  {isLoadingDishes ? (
                    <ActivityIndicator
                      color={Theme.primary}
                      style={{ marginTop: 50 }}
                    />
                  ) : (
                    <FlatList
                      data={filteredItems}
                      keyExtractor={(item) => item.DishId}
                      numColumns={columns}
                      key={columns}
                      renderItem={renderDishItem}
                      columnWrapperStyle={
                        columns > 1
                          ? { gap: gap, marginBottom: gap }
                          : undefined
                      }
                      contentContainerStyle={[
                        styles.listPadding,
                        columns === 1 && { gap: gap },
                      ]}
                      showsVerticalScrollIndicator={false}
                    />
                  )}
                </View>
              </View>
              {isLarge && <CartSidebar width={cartWidth} />}
            </View>
          </View>
        )}

        {/* MODIFIER MODAL (Screenshot 1 Style) */}
        {showModifier && selectedDish && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Modifiers {selectedDish.Name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowModifier(false)}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={Theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {loadingModifiers ? (
                  <ActivityIndicator color={Theme.primary} size="large" />
                ) : (
                  <ScrollView
                    style={styles.modifierList}
                    showsVerticalScrollIndicator={false}
                  >
                    {modifiers.map((m) => (
                      <TouchableOpacity
                        key={m.ModifierID}
                        style={styles.modifierRow}
                        onPress={() => toggleModifier(m)}
                      >
                        <Text style={styles.modifierName}>
                          {m.ModifierName}
                        </Text>
                        <View
                          style={[
                            styles.checkbox,
                            selectedModifierIds.includes(m.ModifierID) &&
                              styles.checkboxActive,
                          ]}
                        >
                          {selectedModifierIds.includes(m.ModifierID) && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowModifier(false)}
                >
                  <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnAdd,
                    { backgroundColor: Theme.success },
                  ]}
                  onPress={addWithModifiers}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.modalBtnTextAdd}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ADD CUSTOM ITEM SUB-MODAL (Screenshot 2 Style) */}
            {showCustomModal && (
              <View
                style={[
                  styles.modalOverlay,
                  { zIndex: 2000, backgroundColor: "rgba(0,0,0,0.8)" },
                ]}
              >
                <View style={styles.customItemModal}>
                  <Text style={styles.customModalTitle}>Add Custom Item</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Item Name *</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter item name"
                      placeholderTextColor="#666"
                      value={customItemName}
                      onChangeText={setCustomItemName}
                      autoFocus
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Price (Optional)</Text>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Enter price"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={customItemPrice}
                      onChangeText={setCustomItemPrice}
                    />
                  </View>

                  <View style={styles.customModalActions}>
                    <TouchableOpacity
                      style={styles.customBtnCancel}
                      onPress={() => setShowCustomModal(false)}
                    >
                      <Text style={styles.customBtnTextCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.customBtnAdd}
                      onPress={addCustomMod}
                    >
                      <Text style={styles.customBtnTextAdd}>Add Item</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const full = 999;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bgMain },
  layout: { flex: 1, flexDirection: "row" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  rail: {
    width: 90,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: Theme.border,
    alignItems: "center",
    paddingVertical: 20,
  },
  railTop: { flex: 1, gap: 20 },
  railItem: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  railItemActive: { backgroundColor: Theme.bgMain },
  railLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  railLabelActive: { color: Theme.primary },
  railBottom: { gap: 20, alignItems: "center" },
  logoutBtn: { alignItems: "center" },
  main: { flex: 1, padding: 20 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  searchWrap: {
    flex: 0.7,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    ...Theme.shadowSm,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Theme.textPrimary,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  categoryNavigation: { marginBottom: 15 },
  catScroll: { gap: 10 },
  catPill: {
    paddingHorizontal: 20,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  catPillActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  catText: { fontSize: 14, fontFamily: Fonts.bold, color: Theme.textSecondary },
  catTextActive: { color: "#fff" },
  groupScroll: { gap: 8 },
  groupPill: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: full,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  groupPillActive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: Theme.primary,
    ...Theme.shadowSm,
  },
  groupText: { fontSize: 12, fontFamily: Fonts.medium, color: Theme.textSecondary },
  groupTextActive: { color: Theme.textPrimary, fontFamily: Fonts.bold },
  gridContainer: { flex: 1 },
  listPadding: { paddingBottom: 80 },
  card: {
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  qtyBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Theme.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#fff",
    ...Theme.shadowSm,
  },
  qtyBadgeText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  dishImageWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: Theme.bgMain,
  },
  dishImg: { width: "100%", height: "100%" },
  dishName: {
    fontSize: 13,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    minHeight: 36,
    lineHeight: 18,
  },
  dishPrice: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    marginTop: 4,
  },
  title: { fontSize: 24, fontFamily: Fonts.black },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    width: "85%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.black,
    color: Theme.primary,
  },
  modalClose: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.bgMuted,
    borderRadius: 18,
  },
  modalBody: { flexShrink: 1 },
  modifierList: { borderTopWidth: 1, borderTopColor: Theme.border },
  modifierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.bgMain,
  },
  modifierName: {
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: { backgroundColor: Theme.primary },
  modalFooter: { flexDirection: "row", gap: 12, marginTop: 24 },
  modalBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  modalBtnAdd: {
    flex: 1.5,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.success,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    ...Theme.shadowSm,
  },
  modalBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },

  /* Submodal Styling (Screenshot 2) */
  customItemModal: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  customModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    color: Theme.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.bold,
    marginBottom: 8,
  },
  customInput: {
    height: 52,
    backgroundColor: Theme.bgMain,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    color: Theme.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.medium,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  customModalActions: { flexDirection: "row", gap: 12, marginTop: 10 },
  customBtnCancel: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  customBtnTextCancel: {
    color: Theme.textSecondary,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  customBtnAdd: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadowSm,
  },
  customBtnTextAdd: { color: "#fff", fontSize: 16, fontFamily: Fonts.black },
});
