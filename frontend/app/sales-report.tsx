import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  StatusBar,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { API_URL } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import { useToast } from "../components/Toast";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type FilterType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export default function SalesReport() {
  const router = useRouter();
  const { showToast } = useToast();
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const todayDate = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("DAILY");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activePaymentModes, setActivePaymentModes] = useState<string[]>(["CASH", "CARD", "NETS", "PAYNOW"]);
  const [activeOrderTypes, setActiveOrderTypes] = useState<string[]>(["DINE-IN", "TAKEAWAY"]);
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "HIGHEST">("NEWEST");

  const isTablet = SCREEN_W >= 768;

  useEffect(() => {
    const loadState = async () => {
      try {
        const savedDate = await AsyncStorage.getItem("sales_selected_date");
        const savedFilter = await AsyncStorage.getItem("sales_selected_filter");
        const savedModes = await AsyncStorage.getItem("sales_payment_modes");
        const savedTypes = await AsyncStorage.getItem("sales_order_types");
        const savedSort = await AsyncStorage.getItem("sales_sort_order");

        if (savedDate) setSelectedDate(savedDate);
        if (savedFilter) setSelectedFilter(savedFilter as FilterType);
        if (savedModes) setActivePaymentModes(JSON.parse(savedModes));
        if (savedTypes) setActiveOrderTypes(JSON.parse(savedTypes));
        if (savedSort) setSortOrder(savedSort as "NEWEST" | "HIGHEST");
      } catch (e) {
        console.error("Load state error:", e);
      }
    };
    loadState();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem("sales_selected_date", selectedDate);
    AsyncStorage.setItem("sales_selected_filter", selectedFilter);
    AsyncStorage.setItem("sales_payment_modes", JSON.stringify(activePaymentModes));
    AsyncStorage.setItem("sales_order_types", JSON.stringify(activeOrderTypes));
    AsyncStorage.setItem("sales_sort_order", sortOrder);
    fetchData();
  }, [selectedDate, selectedFilter, activePaymentModes, activeOrderTypes, sortOrder]);

  const fetchData = async () => {
    try {
      if (sales.length === 0) setLoading(true);
      await Promise.all([fetchSales(), fetchSummary()]);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API_URL}/api/sales/all`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setSales(data);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.error("Sales fetch error:", error);
      setSales([]);
    }
  };

  const fetchSummary = async () => {
    try {
      let url = "";
      if (selectedFilter === "DAILY") {
        url = `${API_URL}/api/sales/daily/${selectedDate}`;
        const response = await fetch(url);
        const data = await response.json();
        setSummary(data);
      } else {
        const end = new Date(selectedDate);
        const start = new Date(selectedDate);

        if (selectedFilter === "WEEKLY") {
          start.setDate(start.getDate() - 6);
        } else if (selectedFilter === "MONTHLY") {
          start.setDate(1);
          end.setMonth(end.getMonth() + 1);
          end.setDate(0);
        } else if (selectedFilter === "YEARLY") {
          start.setMonth(0, 1);
          end.setMonth(11, 31);
        }

        const startStr = start.toISOString().split("T")[0];
        const endStr = end.toISOString().split("T")[0];
        url = `${API_URL}/api/sales/range?startDate=${startStr}&endDate=${endStr}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const aggregated = data.reduce((acc, curr) => ({
            TotalTransactions: acc.TotalTransactions + curr.TotalTransactions,
            TotalSales: acc.TotalSales + curr.TotalSales,
            CashSales: acc.CashSales + curr.CashSales,
            NETS_Sales: acc.NETS_Sales + curr.NETS_Sales,
            PayNow_Sales: acc.PayNow_Sales + curr.PayNow_Sales,
            TotalItems: acc.TotalItems + (curr.TotalItems || 0),
          }), { TotalTransactions: 0, TotalSales: 0, CashSales: 0, NETS_Sales: 0, PayNow_Sales: 0, TotalItems: 0 });
          setSummary(aggregated);
        } else {
          setSummary(null);
        }
      }
    } catch (error) {
      console.error("Summary fetch error:", error);
      setSummary(null);
    }
  };

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    fetchData();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount?.toFixed(2) || "0.00"}`;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate.toISOString().split("T")[0]);
  };

  const filteredSales = useMemo(() => {
    let dateScopedSales = sales;
    
    if (selectedFilter === "DAILY") {
      dateScopedSales = sales.filter(s => {
        if (!s.SettlementDate) return false;
        const saleDate = s.SettlementDate.split("T")[0];
        return saleDate === selectedDate;
      });
    } else if (selectedFilter === "WEEKLY") {
      const selectedDateObj = new Date(selectedDate);
      const sevenDaysAgo = new Date(selectedDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateScopedSales = sales.filter(s => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= sevenDaysAgo && saleDate <= selectedDateObj;
      });
    } else if (selectedFilter === "MONTHLY") {
      const selectedDateObj = new Date(selectedDate);
      const firstDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), 1);
      const lastDay = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth() + 1, 0);
      dateScopedSales = sales.filter(s => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= firstDay && saleDate <= lastDay;
      });
    }

    const filtered = dateScopedSales.filter((s) => {
       const modeMatch = activePaymentModes.includes(s.PayMode);
       const typeMatch = activeOrderTypes.length === 2 || (s.OrderType ? activeOrderTypes.includes(s.OrderType) : activeOrderTypes.includes("DINE-IN"));
       return modeMatch && typeMatch;
    });

    if (sortOrder === "NEWEST") {
      return [...filtered].sort((a, b) => new Date(b.SettlementDate).getTime() - new Date(a.SettlementDate).getTime());
    } else {
      return [...filtered].sort((a, b) => b.SysAmount - a.SysAmount);
    }
  }, [sales, selectedFilter, selectedDate, activePaymentModes, activeOrderTypes, sortOrder]);

  const filteredMetrics = useMemo(() => {
    if (!summary || selectedFilter === "DAILY") {
       const daySales = sales.filter(s => s.SettlementDate && s.SettlementDate.startsWith(selectedDate));
       const filtered = daySales.filter(s => activePaymentModes.includes(s.PayMode));
       
       return {
         TotalSales: filtered.reduce((acc, s) => acc + s.SysAmount, 0),
         TotalTransactions: filtered.length,
         TotalItems: filtered.reduce((acc, s) => acc + (s.ReceiptCount || 0), 0),
         Cash: filtered.filter(s => s.PayMode === "CASH").reduce((acc, s) => acc + s.SysAmount, 0),
         Card: filtered.filter(s => s.PayMode === "CARD").reduce((acc, s) => acc + s.SysAmount, 0),
         Nets: filtered.filter(s => s.PayMode === "NETS").reduce((acc, s) => acc+ s.SysAmount, 0),
         PayNow: filtered.filter(s=> s.PayMode === "PAYNOW").reduce((acc, s) => acc + s.SysAmount, 0),
       };
    }
    
    const filtered = filteredSales;
    return {
       TotalSales: filtered.reduce((acc, s) => acc + s.SysAmount, 0),
       TotalTransactions: filtered.length,
       TotalItems: filtered.reduce((acc, s) => acc + (s.ReceiptCount || 0), 0),
       Cash: filtered.filter(s => s.PayMode === "CASH").reduce((acc, s) => acc + s.SysAmount, 0),
       Card: filtered.filter(s => s.PayMode === "CARD").reduce((acc, s) => acc + s.SysAmount, 0),
       Nets: filtered.filter(s => s.PayMode === "NETS").reduce((acc, s) => acc+ s.SysAmount, 0),
       PayNow: filtered.filter(s=> s.PayMode === "PAYNOW").reduce((acc, s) => acc + s.SysAmount, 0),
    };
  }, [filteredSales, summary, selectedFilter, selectedDate, activePaymentModes]);

  const avgOrder = useMemo(() => {
    if (!filteredMetrics.TotalTransactions) return 0;
    return filteredMetrics.TotalSales / filteredMetrics.TotalTransactions;
  }, [filteredMetrics]);

  const paymentMix = useMemo(() => {
    if (!filteredMetrics.TotalSales) return { cash: 0, card: 0, nets: 0, paynow: 0 };
    return {
      cash: (filteredMetrics.Cash / filteredMetrics.TotalSales) * 100,
      card: (filteredMetrics.Card / filteredMetrics.TotalSales) * 100,
      nets: (filteredMetrics.Nets / filteredMetrics.TotalSales) * 100,
      paynow: (filteredMetrics.PayNow / filteredMetrics.TotalSales) * 100,
    };
  }, [filteredMetrics]);

  const paymentMixCenterRows = useMemo(() => {
    const rows: { key: string; pct: number; color: string }[] = [];
    if (filteredMetrics.Cash > 0) rows.push({ key: "CASH", pct: paymentMix.cash, color: "#22c55e" });
    if (filteredMetrics.Card > 0) rows.push({ key: "CARD", pct: paymentMix.card, color: "#818cf8" });
    if (filteredMetrics.Nets > 0) rows.push({ key: "NETS", pct: paymentMix.nets, color: "#3b82f6" });
    if (filteredMetrics.PayNow > 0) rows.push({ key: "DIGITAL", pct: paymentMix.paynow, color: "#f59e0b" });
    return rows.sort((a, b) => b.pct - a.pct);
  }, [filteredMetrics, paymentMix]);

  const togglePaymentMode = (mode: string) => {
     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
     setActivePaymentModes(prev => 
       prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
     );
  };

  const toggleOrderType = (type: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveOrderTypes(prev => 
       prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
     );
  };

  const fetchOrderDetails = async (settlementId: string) => {
    try {
      setLoadingDetails(true);
      const response = await fetch(`${API_URL}/api/sales/detail/${settlementId}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setOrderDetails(data);
        } else {
          setOrderDetails([{ DishName: "Item info not available", Qty: 0, Price: 0 }]);
        }
      }
    } catch (e) {
      console.error("Detail fetch error:", e);
      setOrderDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOrderPress = (order: any) => {
    setSelectedOrder(order);
    fetchOrderDetails(order.SettlementID);
  };

  const renderMetricTile = (label: string, value: string | number, icon: any, color: string) => (
    <View style={[styles.metricTile, { borderLeftColor: color }]}>
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={14} color={Theme.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.dashboardHeader}>
            <View style={styles.headerContent}>
              <Text style={styles.dashboardYear}>{new Date().getFullYear()}</Text>
              <Text style={styles.dashboardTitle}>SALES ANALYTICS</Text>
              <Text style={styles.dashboardSubtitle}>Comprehensive performance dashboard</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={Theme.textPrimary} />
                <Text style={styles.backBtnLabel}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilterPanel(true)} style={styles.filterMenuBtn}>
                <Ionicons name="filter-outline" size={20} color={Theme.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView 
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.primary} />}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Active Badges */}
            <View style={styles.badgeRow}>
              {activePaymentModes.length < 4 && activePaymentModes.map(m => (
                <View key={m} style={[styles.activeBadge, { borderColor: Theme.border }]}>
                  <Text style={styles.badgeText}>{m}</Text>
                  <TouchableOpacity onPress={() => togglePaymentMode(m)}>
                    <Ionicons name="close-circle" size={14} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
              {activeOrderTypes.length < 2 && activeOrderTypes.map(t => (
                <View key={t} style={[styles.activeBadge, { borderColor: Theme.border }]}>
                  <Text style={styles.badgeText}>{t}</Text>
                  <TouchableOpacity onPress={() => toggleOrderType(t)}>
                    <Ionicons name="close-circle" size={14} color={Theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Filter Toggles */}
            <View style={styles.filterBar}>
              {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as FilterType[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setSelectedFilter(f)}
                  style={[styles.filterBtn, selectedFilter === f && styles.activeFilterBtn]}
                >
                  <Text style={[styles.filterText, selectedFilter === f && styles.activeFilterText]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Navigation */}
            <View style={styles.dateControl}>
              <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
              <View style={styles.dateDisplay}>
                <Text style={styles.dateText}>{selectedDate}</Text>
              </View>
              <TouchableOpacity onPress={() => changeDate(1)} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={Theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Metrics Grid */}
            <View style={styles.metricsGrid}>
              {renderMetricTile("Gross Revenue", formatCurrency(filteredMetrics.TotalSales), "card-outline", Theme.success)}
              {renderMetricTile("Avg Check", formatCurrency(avgOrder), "analytics-outline", Theme.primary)}
              {renderMetricTile("Total Orders", filteredMetrics.TotalTransactions, "receipt-outline", Theme.warning)}
              {renderMetricTile("Items Sold", filteredMetrics.TotalItems, "fast-food-outline", "#ec4899")}
            </View>

            {/* Charts Section */}
            <View style={styles.chartsContainer}>
              {/* Pie Chart */}
              <View style={[styles.chartCard, styles.chartCardWide]}>
                <View style={styles.chartCardHeader}>
                  <Text style={styles.cardTitle}>PAYMENT CHANNEL MIX</Text>
                  <Ionicons name="pie-chart" size={14} color={Theme.primary} />
                </View>
                <View style={styles.chartContainer}>
                  {filteredMetrics.TotalSales > 0 ? (
                    <View style={styles.pieChartWrapper}>
                      <PieChart
                        data={[
                          { value: filteredMetrics.Cash, color: "#22c55e", label: "CASH" },
                          { value: filteredMetrics.Card, color: "#818cf8", label: "CARD" },
                          { value: filteredMetrics.Nets, color: "#3b82f6", label: "NETS" },
                          { value: filteredMetrics.PayNow, color: "#f59e0b", label: "DIGITAL" },
                        ].filter((d) => d.value > 0)}
                        donut
                        radius={70}
                        innerRadius={50}
                        innerCircleColor={Theme.bgCard}
                        showText={false}
                        strokeColor={Theme.bgCard}
                        strokeWidth={2}
                        centerLabelComponent={() => (
                          <View style={styles.pieDonutCenter}>
                            {paymentMixCenterRows.map((row) => (
                              <Text key={row.key} style={styles.pieDonutCenterLine} numberOfLines={1}>
                                <Text style={[styles.pieDonutCenterPct, { color: row.color }]}>{row.pct.toFixed(0)}%</Text>
                                <Text style={styles.pieDonutCenterTag}> {row.key}</Text>
                              </Text>
                            ))}
                          </View>
                        )}
                      />
                    </View>
                  ) : (
                    <View style={styles.emptyChartPlaceholder}>
                      <Ionicons name="pie-chart-outline" size={40} color={Theme.textMuted} />
                      <Text style={styles.emptyChartText}>No sales data</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.chartCard}>
                <View style={styles.chartCardHeader}>
                  <Text style={styles.cardTitle}>ORDER TYPES</Text>
                  <Ionicons name="layers-outline" size={14} color={Theme.primary} />
                </View>
                <View style={styles.orderTypeStats}>
                  {(() => {
                    const dineIn = sales.filter(s => !s.OrderType || s.OrderType === "DINE-IN").length;
                    const takeaway = sales.filter(s => s.OrderType === "TAKEAWAY").length;
                    const total = dineIn + takeaway;
                    return (
                      <>
                        <View style={styles.statRow}>
                          <View style={styles.statLabel}><Text style={styles.statIcon}>🪑</Text><Text style={styles.statName}>Dine-In</Text></View>
                          <Text style={[styles.statValue, { color: Theme.primary }]}>{total > 0 ? ((dineIn / total) * 100).toFixed(0) : 0}%</Text>
                        </View>
                        <View style={styles.statRow}>
                          <View style={styles.statLabel}><Text style={styles.statIcon}>🛍️</Text><Text style={styles.statName}>Takeaway</Text></View>
                          <Text style={[styles.statValue, { color: Theme.warning }]}>{total > 0 ? ((takeaway / total) * 100).toFixed(0) : 0}%</Text>
                        </View>
                      </>
                    );
                  })()}
                </View>
              </View>

              <View style={styles.chartCard}>
                <View style={styles.chartCardHeader}>
                  <Text style={styles.cardTitle}>KEY METRICS</Text>
                  <Ionicons name="bar-chart-outline" size={14} color={Theme.primary} />
                </View>
                <View style={styles.metricsStats}>
                  <View style={styles.metricRow}><Text style={styles.metricLabel}>Conversion</Text><Text style={styles.metricValueSmall}>{filteredMetrics.TotalTransactions}</Text></View>
                  <View style={styles.metricRow}><Text style={styles.metricLabel}>Avg Items</Text><Text style={styles.metricValueSmall}>{filteredMetrics.TotalTransactions > 0 ? (filteredMetrics.TotalItems / filteredMetrics.TotalTransactions).toFixed(1) : 0}</Text></View>
                  <View style={styles.metricRow}><Text style={styles.metricLabel}>Per Item</Text><Text style={styles.metricValueSmall}>{formatCurrency(filteredMetrics.TotalItems > 0 ? filteredMetrics.TotalSales / filteredMetrics.TotalItems : 0)}</Text></View>
                </View>
              </View>
            </View>

            {/* Breakdown */}
            <View style={styles.breakdownCard}>
              <View style={styles.chartCardHeader}>
                <Text style={styles.cardTitle}>PAYMENT BREAKDOWN</Text>
                <Ionicons name="wallet-outline" size={14} color={Theme.primary} />
              </View>
              <View style={styles.breakdownRow}>
                {[
                  { label: "CASH", val: filteredMetrics.Cash, icon: "💵", color: "#22c55e" },
                  { label: "CARD", val: filteredMetrics.Card, icon: "💳", color: "#818cf8" },
                  { label: "NETS", val: filteredMetrics.Nets, icon: "🔳", color: "#3b82f6" },
                  { label: "DIGITAL", val: filteredMetrics.PayNow, icon: "📱", color: "#f59e0b" },
                ].map((item, idx) => (
                  <View key={idx} style={styles.breakdownItem}>
                    <Text style={styles.breakdownIcon}>{item.icon}</Text>
                    <Text style={styles.breakdownLabel}>{item.label}</Text>
                    <Text style={[styles.breakdownValue, { color: item.color }]}>{formatCurrency(item.val)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Recent Transactions */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>RECENT TRANSACTIONS</Text>
              <TouchableOpacity onPress={() => fetchData()}><Text style={styles.seeAllText}>REFRESH</Text></TouchableOpacity>
            </View>

            {filteredSales.slice(0, 15).map((item, idx) => (
              <TouchableOpacity key={idx} onPress={() => handleOrderPress(item)} style={styles.transactionCard}>
                <View style={styles.txIconWrap}>
                  <Ionicons 
                    name={item.PayMode === "CASH" ? "cash-outline" : "card-outline"} 
                    size={16} 
                    color={item.PayMode === "CASH" ? "#22c55e" : Theme.primary} 
                  />
                </View>
                <View style={styles.txOrderInfo}>
                  <Text style={styles.txTitle}>{item.OrderType === "TAKEAWAY" ? "🛍️ Takeaway" : `🪑 Table ${item.TableNo || "N/A"}`}</Text>
                  <Text style={styles.txSmall}>Order #{item.OrderId || item.BillNo?.slice(-6)}</Text>
                </View>
                <View style={styles.txTimeInfo}>
                  <Text style={styles.txDatetime}>{new Date(item.SettlementDate).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(item.SettlementDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <View style={styles.txRightInfo}>
                  <Text style={styles.txAmount}>{formatCurrency(item.SysAmount)}</Text>
                  <View style={styles.paidBadgeSmall}><Ionicons name="checkmark" size={10} color={Theme.success} /></View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Modal Overlay */}
          <Modal visible={!!selectedOrder} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <TouchableOpacity activeOpacity={1} style={styles.modalDismiss} onPress={() => setSelectedOrder(null)} />
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Order #{selectedOrder?.OrderId || selectedOrder?.BillNo?.slice(-6)}</Text>
                    <Text style={styles.modalSub}>{new Date(selectedOrder?.SettlementDate).toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedOrder(null)}><Ionicons name="close" size={24} color={Theme.textPrimary} /></TouchableOpacity>
                </View>
                <View style={styles.modalDivider} />
                <ScrollView style={styles.itemsList}>
                   {loadingDetails ? <ActivityIndicator color={Theme.primary} /> : orderDetails.map((item, idx) => (
                     <View key={idx} style={styles.orderItemRow}>
                       <Text style={styles.orderItemQty}>{item.Qty}x</Text>
                       <Text style={styles.orderItemName}>{item.DishName}</Text>
                       <Text style={styles.orderItemPrice}>${(item.Price * item.Qty).toFixed(2)}</Text>
                     </View>
                   ))}
                </ScrollView>
                <View style={styles.modalDivider} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Grand Total</Text>
                  <Text style={styles.totalValue}>{formatCurrency(selectedOrder?.SysAmount)}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedOrder(null)} style={styles.doneBtn}><Text style={styles.doneBtnText}>CLOSE</Text></TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Sidebar Modal */}
          <Modal visible={showFilterPanel} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
              <TouchableOpacity activeOpacity={1} style={styles.sidebarDismiss} onPress={() => setShowFilterPanel(false)} />
              <View style={styles.sidebarContent}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarTitle}>ADVANCED FILTERS</Text>
                  <TouchableOpacity onPress={() => setShowFilterPanel(false)}><Ionicons name="close" size={24} color={Theme.textPrimary} /></TouchableOpacity>
                </View>
                <ScrollView>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>PAYMENT MODES</Text>
                    <View style={styles.chipRow}>
                      {["CASH", "CARD", "NETS", "PAYNOW"].map(m => (
                        <TouchableOpacity key={m} onPress={() => togglePaymentMode(m)} style={[styles.chip, activePaymentModes.includes(m) && styles.activeChip]}>
                          <Text style={[styles.chipText, activePaymentModes.includes(m) && styles.activeChipText]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>ORDER TYPE</Text>
                    <View style={styles.chipRow}>
                      {["DINE-IN", "TAKEAWAY"].map(t => (
                        <TouchableOpacity key={t} onPress={() => toggleOrderType(t)} style={[styles.chip, activeOrderTypes.includes(t) && styles.activeChip]}>
                          <Text style={[styles.chipText, activeOrderTypes.includes(t) && styles.activeChipText]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>SORT BY</Text>
                    {[
                      { id: "NEWEST", label: "Newest First", icon: "time-outline" },
                      { id: "HIGHEST", label: "Highest Amount", icon: "trending-up-outline" },
                    ].map(s => (
                      <TouchableOpacity key={s.id} onPress={() => setSortOrder(s.id as any)} style={[styles.sortBtn, sortOrder === s.id && styles.activeSortBtn]}>
                        <Ionicons name={s.icon as any} size={18} color={sortOrder === s.id ? Theme.primary : Theme.textMuted} />
                        <Text style={[styles.sortText, sortOrder === s.id && styles.activeSortText]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.sidebarFooter}>
                  <TouchableOpacity onPress={() => { setActivePaymentModes(["CASH", "CARD", "NETS", "PAYNOW"]); setActiveOrderTypes(["DINE-IN", "TAKEAWAY"]); setSortOrder("NEWEST"); }} style={styles.resetBtn}><Text style={styles.resetText}>RESET ALL</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowFilterPanel(false)} style={styles.applyBtn}><Text style={styles.applyText}>APPLY</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  overlay: { flex: 1, paddingHorizontal: 16 },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 20,
    gap: 16,
  },
  headerContent: { flex: 1 },
  dashboardYear: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 14, marginBottom: 4 },
  dashboardTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 26 },
  dashboardSubtitle: { color: Theme.textSecondary, fontFamily: Fonts.semiBold, fontSize: 12, marginTop: 4 },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  filterMenuBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgCard,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm,
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 44,
    borderRadius: 12, backgroundColor: Theme.bgCard, justifyContent: "center", borderWidth: 1, borderColor: Theme.border, ...Theme.shadowSm,
  },
  backBtnLabel: { color: Theme.textPrimary, fontFamily: Fonts.semiBold, fontSize: 14 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border,
  },
  badgeText: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 10 },
  filterBar: {
    flexDirection: "row", borderRadius: 14, overflow: "hidden", padding: 4,
    backgroundColor: Theme.bgNav, marginBottom: 16, borderWidth: 1, borderColor: Theme.border,
  },
  filterBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeFilterBtn: { backgroundColor: Theme.primary, ...Theme.shadowSm },
  filterText: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 11 },
  activeFilterText: { color: "#fff" },
  dateControl: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12 },
  navBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Theme.bgCard, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  dateDisplay: {
    flex: 1, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Theme.border, backgroundColor: Theme.bgCard,
  },
  dateText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  metricTile: {
    width: (SCREEN_W - 32 - 12) / 2, padding: 16, borderRadius: 16,
    borderLeftWidth: 4, backgroundColor: Theme.bgCard, ...Theme.shadowMd,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  tileLabel: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 11, textTransform: "uppercase" },
  tileValue: { fontFamily: Fonts.black, fontSize: 22 },
  chartsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  chartCard: {
    flex: 1, minWidth: (SCREEN_W - 32 - 12) / 2, padding: 20, borderRadius: 20,
    backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowMd,
  },
  chartCardWide: { width: "100%" },
  chartCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 12, letterSpacing: 1 },
  chartContainer: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  pieChartWrapper: { alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  pieDonutCenter: { alignItems: "center", justifyContent: "center", gap: 4 },
  pieDonutCenterLine: { textAlign: "center" },
  pieDonutCenterPct: { fontFamily: Fonts.black, fontSize: 13 },
  pieDonutCenterTag: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 10 },
  emptyChartPlaceholder: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 12 },
  emptyChartText: { color: Theme.textMuted, fontFamily: Fonts.semiBold, fontSize: 13 },
  orderTypeStats: { gap: 12 },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: { fontSize: 20 },
  statName: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  statValue: { fontFamily: Fonts.black, fontSize: 16 },
  metricsStats: { gap: 10 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  metricLabel: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 12 },
  metricValueSmall: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 15 },
  breakdownCard: { padding: 20, borderRadius: 20, marginBottom: 24, backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border, ...Theme.shadowMd },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  breakdownItem: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Theme.bgMuted, borderWidth: 1, borderColor: Theme.border,
  },
  breakdownIcon: { fontSize: 24 },
  breakdownLabel: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 9, letterSpacing: 0.5 },
  breakdownValue: { fontFamily: Fonts.black, fontSize: 11 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, marginTop: 8 },
  sectionHeaderText: { color: Theme.textSecondary, fontFamily: Fonts.black, fontSize: 13, letterSpacing: 1 },
  seeAllText: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 12 },
  transactionCard: {
    flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 16,
    marginBottom: 12, backgroundColor: Theme.bgCard, borderWidth: 1, borderColor: Theme.border, gap: 12, ...Theme.shadowSm,
  },
  txIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Theme.bgMuted,
    justifyContent: "center", alignItems: "center",
  },
  txOrderInfo: { flex: 1 },
  txTitle: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14 },
  txSmall: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 10, marginTop: 2 },
  txTimeInfo: { flex: 1, alignItems: "center" },
  txDatetime: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 12 },
  txRightInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  txAmount: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 15 },
  paidBadgeSmall: {
    backgroundColor: Theme.success + "20", padding: 4, borderRadius: 6,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Theme.success + "40",
  },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    width: Math.min(SCREEN_W * 0.9, 480), backgroundColor: Theme.bgCard, borderRadius: 24, padding: 24,
    ...Theme.shadowLg, borderWidth: 1, borderColor: Theme.border,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 18 },
  modalSub: { color: Theme.textSecondary, fontFamily: Fonts.medium, fontSize: 12, marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: Theme.border, marginVertical: 16 },
  itemsList: { maxHeight: 250 },
  orderItemRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  orderItemQty: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 14, width: 30 },
  orderItemName: { flex: 1, color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14 },
  orderItemPrice: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 14 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  totalLabel: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 18 },
  totalValue: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 24 },
  doneBtn: { backgroundColor: Theme.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", ...Theme.shadowMd },
  doneBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  sidebarOverlay: { flex: 1, flexDirection: "row-reverse", backgroundColor: "rgba(0,0,0,0.4)" },
  sidebarDismiss: { flex: 1 },
  sidebarContent: {
    width: Math.min(SCREEN_W * 0.8, 320), height: "100%", backgroundColor: Theme.bgCard, padding: 24,
    paddingTop: 60, borderLeftWidth: 1, borderLeftColor: Theme.border,
  },
  sidebarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 30 },
  sidebarTitle: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  sidebarSection: { marginBottom: 24 },
  sectionLabel: { color: Theme.textMuted, fontFamily: Fonts.black, fontSize: 10, letterSpacing: 1, marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Theme.bgMuted, borderWidth: 1, borderColor: Theme.border,
  },
  activeChip: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  chipText: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 12 },
  activeChipText: { color: "#fff" },
  sortBtn: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12,
    backgroundColor: Theme.bgMuted, marginBottom: 10, borderWidth: 1, borderColor: Theme.border,
  },
  activeSortBtn: { backgroundColor: Theme.primary + "10", borderColor: Theme.primary },
  sortText: { color: Theme.textSecondary, fontFamily: Fonts.bold, fontSize: 13 },
  activeSortText: { color: Theme.primary },
  sidebarFooter: { marginTop: "auto", gap: 12 },
  applyBtn: { backgroundColor: Theme.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", ...Theme.shadowMd },
  applyText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  resetBtn: { paddingVertical: 14, alignItems: "center" },
  resetText: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 12 },
});