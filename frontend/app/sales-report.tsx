import { API_URL } from "@/constants/Config";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "../constants/Fonts";
import { Theme } from "../constants/theme";
import BillPrompt from "../components/BillPrompt";
import UniversalPrinter from "../components/UniversalPrinter";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isSameMonth, 
  isSameDay, 
  setYear,
  setMonth,
  getYear,
  getMonth,
  subMonths,
  addMonths
} from 'date-fns';

type FilterType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
type DetailReportType = "CATEGORY" | "DISH" | "SETTLEMENT";

export default function SalesReport() {
  const router = useRouter();
  const { width: SCREEN_W } = useWindowDimensions();
  const [sales, setSales] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const todayDate = new Date().toLocaleDateString('en-CA');
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("DAILY");
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetails, setOrderDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activePaymentModes, setActivePaymentModes] = useState<string[]>([
    "CASH",
    "CARD",
    "NETS",
    "PAYNOW",
  ]);
  const [activeOrderTypes, setActiveOrderTypes] = useState<string[]>([
    "DINE-IN",
    "TAKEAWAY",
  ]);
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "HIGHEST">("NEWEST");
  const [detailReportType, setDetailReportType] =
    useState<DetailReportType | null>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [dishReport, setDishReport] = useState<any[]>([]);
  const [settlementReport, setSettlementReport] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [isReprinting, setIsReprinting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  const [selectionMode, setSelectionMode] = useState<"SINGLE" | "RANGE">("SINGLE");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"DAYS" | "MONTHS" | "YEARS">("DAYS");

  useEffect(() => {
    const loadState = async () => {
      try {
        const savedDate = await AsyncStorage.getItem("sales_selected_date");
        const savedFilter = await AsyncStorage.getItem("sales_selected_filter");
        const savedModes = await AsyncStorage.getItem("sales_payment_modes");
        const savedTypes = await AsyncStorage.getItem("sales_order_types");
        const savedSort = await AsyncStorage.getItem("sales_sort_order");

        if (savedDate) setSelectedDate(savedDate);
        if (
          savedFilter &&
          ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(savedFilter)
        ) {
          setSelectedFilter(savedFilter as FilterType);
        }
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
    AsyncStorage.setItem(
      "sales_payment_modes",
      JSON.stringify(activePaymentModes),
    );
    AsyncStorage.setItem("sales_order_types", JSON.stringify(activeOrderTypes));
    AsyncStorage.setItem("sales_sort_order", sortOrder);
    fetchData();
  }, [
    selectedDate,
    selectedFilter,
    activePaymentModes,
    activeOrderTypes,
    sortOrder,
  ]);

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

  const fetchDetailReport = useCallback(
    async (reportType: DetailReportType, filterType = selectedFilter) => {
      try {
        setLoadingReport(true);
        const reportFilter = filterType.toLowerCase();
        const params = new URLSearchParams({
          filter: reportFilter,
          date: selectedDate,
          t: Date.now().toString(),
        });

        const endpoint = reportType === "CATEGORY" ? "category" : reportType === "DISH" ? "dish" : "settlement";
        console.log("[SalesReport] Fetching report", {
          reportType,
          filterType: reportFilter,
        });
        const response = await fetch(
          `${API_URL}/api/reports/${endpoint}?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Unable to load ${endpoint} report`);
        }

        const data = await response.json();
        console.log("[SalesReport] API response", {
          reportType,
          filterType: reportFilter,
          rows: Array.isArray(data) ? data.length : 0,
          data,
        });

        if (reportType === "CATEGORY") {
          setCategoryReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  CategoryName: row.categoryName || row.CategoryName || "Unmapped",
                  Sold: row.totalQty ?? row.totalQuantitySold ?? 0,
                  SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
                }))
              : [],
          );
          setDishReport([]);
          setSettlementReport([]);
        } else if (reportType === "DISH") {
          setDishReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  DishName: row.dishName || row.DishName || "Unknown Dish",
                  CategoryName: row.categoryName || row.CategoryName || "Unmapped",
                  SubCategoryName: row.subCategoryName || row.SubCategoryName || "Unmapped",
                  Sold: row.totalQty ?? row.quantitySold ?? 0,
                  Voided: row.voidQty ?? 0,
                  SalesAmount: row.totalAmount ?? row.totalSalesAmount ?? 0,
                }))
              : [],
          );
          setCategoryReport([]);
          setSettlementReport([]);
        } else {
          setSettlementReport(
            Array.isArray(data)
              ? data.map((row: any) => ({
                  Paymode: row.Paymode || "Unknown",
                  SysAmount: row.SysAmount ?? 0,
                  ManualAmount: row.ManualAmount ?? 0,
                  SortageOrExces: row.SortageOrExces ?? 0,
                  ReceiptCount: row.ReceiptCount ?? 0,
                }))
              : [],
          );
          setCategoryReport([]);
          setDishReport([]);
        }
      } catch (error) {
        console.error("Detail report fetch error:", error);
        setCategoryReport([]);
        setDishReport([]);
        setSettlementReport([]);
      } finally {
        setLoadingReport(false);
      }
    },
    [selectedFilter],
  );

  const handleReportPress = (reportType: DetailReportType) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (detailReportType === reportType) {
      fetchDetailReport(reportType);
      return;
    }
    setDetailReportType(reportType);
  };

  useEffect(() => {
    if (detailReportType) {
      fetchDetailReport(detailReportType, selectedFilter);
    }
  }, [selectedFilter, detailReportType, fetchDetailReport]);

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API_URL}/api/sales/all`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to fetch sales");
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
      } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
        start.setTime(new Date(rangeStart).getTime());
        end.setTime(new Date(rangeEnd).getTime());
      }

      const startStr = start.toLocaleDateString('en-CA');
      const endStr = end.toLocaleDateString('en-CA');
      const url = `${API_URL}/api/sales/range?startDate=${startStr}&endDate=${endStr}`;
      const response = await fetch(url);
      const data = await response.json();
      setSummary(Array.isArray(data) ? data[0] : data);
    } catch (error) {
      console.error("Summary fetch error:", error);
      setSummary(null);
    }
  };

  const onRefresh = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await fetchData();
    if (detailReportType) {
      await fetchDetailReport(detailReportType);
    }
  };

  const formatOrderId = (order: any) => {
    if (!order) return "";
    const rawId = String(order.OrderId || order.BillNo || "");
    if (rawId.includes("-")) return rawId;

    const d = order.SettlementDate
      ? new Date(order.SettlementDate)
      : new Date();
    const datePart =
      d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, "0") +
      d.getDate().toString().padStart(2, "0");
    return `${datePart}-${rawId.padStart(4, "0")}`;
  };

  const formatCurrency = (amount: number) => {
    return `$${amount?.toFixed(2) || "0.00"}`;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate.toISOString().split("T")[0]);
  };

  const onDateChange = (event: any, selectedDateValue?: Date) => {
    console.log("[SalesReport] onDateChange event:", event.type, selectedDateValue);
    
    if (event.type === "set") {
      if (selectedDateValue) {
        const formattedDate = selectedDateValue.toISOString().split("T")[0];
        setSelectedDate(formattedDate);
      }
    }
    
    // Close picker for Android and when dismissed
    if (Platform.OS !== "ios" || event.type === "dismissed" || event.type === "set") {
      setShowDatePicker(false);
    }
  };

  const filteredSales = useMemo(() => {
    let dateScopedSales = sales;

    if (selectedFilter === "DAILY") {
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        return String(s.SettlementDate).startsWith(selectedDate);
      });
    } else if (selectedFilter === "WEEKLY") {
      const selectedDateObj = new Date(selectedDate);
      const sevenDaysAgo = new Date(
        selectedDateObj.getTime() - 6 * 24 * 60 * 60 * 1000,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= sevenDaysAgo && saleDate <= selectedDateObj;
      });
    } else if (selectedFilter === "MONTHLY") {
      const selectedDateObj = new Date(selectedDate);
      const firstDay = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth(),
        1,
      );
      const lastDay = new Date(
        selectedDateObj.getFullYear(),
        selectedDateObj.getMonth() + 1,
        0,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= firstDay && saleDate <= lastDay;
      });
    } else if (selectedFilter === "YEARLY") {
      const selectedDateObj = new Date(selectedDate);
      const firstDay = new Date(selectedDateObj.getFullYear(), 0, 1);
      const lastDay = new Date(
        selectedDateObj.getFullYear(),
        11,
        31,
        23,
        59,
        59,
      );
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= firstDay && saleDate <= lastDay;
      });
    } else if (selectedFilter === "CUSTOM" && rangeStart && rangeEnd) {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      end.setHours(23, 59, 59, 999);
      dateScopedSales = sales.filter((s) => {
        if (!s.SettlementDate) return false;
        const saleDate = new Date(s.SettlementDate);
        return saleDate >= start && saleDate <= end;
      });
    }

    const filtered = dateScopedSales.filter((s) => {
      const modeMatch = activePaymentModes.includes(s.PayMode?.trim());
      const typeMatch =
        activeOrderTypes.length === 2 ||
        (s.OrderType
          ? activeOrderTypes.includes(s.OrderType?.trim())
          : activeOrderTypes.includes("DINE-IN"));
      return modeMatch && typeMatch;
    });

    if (sortOrder === "NEWEST") {
      return [...filtered].sort(
        (a, b) =>
          new Date(b.SettlementDate).getTime() -
          new Date(a.SettlementDate).getTime(),
      );
    } else {
      return [...filtered].sort((a, b) => b.SysAmount - a.SysAmount);
    }
  }, [
    sales,
    selectedFilter,
    selectedDate,
    activePaymentModes,
    activeOrderTypes,
    sortOrder,
  ]);

  const filteredMetrics = useMemo(() => {
    const filtered = filteredSales;
    return {
      TotalSales: filtered.reduce(
        (acc: number, s: any) => acc + s.SysAmount,
        0,
      ),
      TotalTransactions: filtered.length,
      TotalItems: filtered.reduce(
        (acc: number, s: any) => acc + (s.ReceiptCount || 0),
        0,
      ),
      Cash: filtered
        .filter((s: any) => s.PayMode === "CASH")
        .reduce((acc: number, s: any) => acc + s.SysAmount, 0),
      Card: filtered
        .filter((s: any) => s.PayMode === "CARD")
        .reduce((acc: number, s: any) => acc + s.SysAmount, 0),
      Nets: filtered
        .filter((s: any) => s.PayMode === "NETS")
        .reduce((acc: number, s: any) => acc + s.SysAmount, 0),
      PayNow: filtered
        .filter((s: any) => s.PayMode === "PAYNOW")
        .reduce((acc: number, s: any) => acc + s.SysAmount, 0),
      TotalVoids: filtered.reduce(
        (acc: number, s: any) => acc + (s.VoidQty || 0),
        0,
      ),
      TotalVoidAmount: filtered.reduce(
        (acc: number, s: any) => acc + (s.VoidAmount || 0),
        0,
      ),
    };
  }, [filteredSales]);

  const avgOrder = useMemo(() => {
    if (!filteredMetrics.TotalTransactions) return 0;
    return filteredMetrics.TotalSales / filteredMetrics.TotalTransactions;
  }, [filteredMetrics]);

  const paymentMix = useMemo(() => {
    if (!filteredMetrics.TotalSales)
      return { cash: 0, card: 0, nets: 0, paynow: 0 };
    return {
      cash: (filteredMetrics.Cash / filteredMetrics.TotalSales) * 100,
      card: (filteredMetrics.Card / filteredMetrics.TotalSales) * 100,
      nets: (filteredMetrics.Nets / filteredMetrics.TotalSales) * 100,
      paynow: (filteredMetrics.PayNow / filteredMetrics.TotalSales) * 100,
    };
  }, [filteredMetrics]);

  const paymentMixCenterRows = useMemo(() => {
    const rows: { key: string; pct: number; color: string }[] = [];
    if (filteredMetrics.Cash > 0)
      rows.push({ key: "CASH", pct: paymentMix.cash, color: "#22c55e" });
    if (filteredMetrics.Card > 0)
      rows.push({ key: "CARD", pct: paymentMix.card, color: "#818cf8" });
    if (filteredMetrics.Nets > 0)
      rows.push({ key: "NETS", pct: paymentMix.nets, color: "#3b82f6" });
    if (filteredMetrics.PayNow > 0)
      rows.push({ key: "DIGITAL", pct: paymentMix.paynow, color: "#f59e0b" });
    return rows.sort((a, b) => b.pct - a.pct);
  }, [filteredMetrics, paymentMix]);

  const togglePaymentMode = (mode: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActivePaymentModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const toggleOrderType = (type: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveOrderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const fetchOrderDetails = async (settlementId: string) => {
    try {
      setLoadingDetails(true);
      const response = await fetch(
        `${API_URL}/api/sales/detail/${settlementId}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setOrderDetails(data);
        } else {
          setOrderDetails([
            { DishName: "Item info not available", Qty: 0, Price: 0 },
          ]);
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

  const handleReprint = async () => {
    if (!selectedOrder || orderDetails.length === 0) return;
    
    setIsReprinting(true);
    setShowPrintPrompt(false);
    
    try {
      const userId = await AsyncStorage.getItem("userId") || "1";
      
      const mappedItems = orderDetails.map(item => ({
        name: item.DishName,
        price: item.Price,
        qty: item.Qty,
        modifiers: [] // Modifiers are not typically in the standard sales report detail view
      }));

      const saleData = {
        invoiceNumber: formatOrderId(selectedOrder),
        total: selectedOrder.SysAmount,
        paymentMethod: selectedOrder.PayMode || "CASH",
        cashPaid: selectedOrder.SysAmount,
        change: 0,
        items: mappedItems,
        date: selectedOrder.SettlementDate || new Date().toISOString(),
      };

      const dummyDiscount = {
        applied: false,
        type: 'fixed' as const,
        value: 0,
        amount: 0
      };

      await UniversalPrinter.smartPrint(saleData, userId, {}, dummyDiscount);
    } catch (error) {
      console.error("Reprint error:", error);
    } finally {
      setIsReprinting(false);
    }
  };

  const renderMetricTile = (
    label: string,
    value: string | number,
    icon: any,
    color: string,
  ) => (
    <View style={[styles.metricTile, { borderLeftColor: color }]}>
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={14} color={Theme.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );

  const renderDetailReport = () => {
    if (!detailReportType) {
      return null;
    }

    const isSettlement = detailReportType === "SETTLEMENT";
    const rows = isSettlement ? settlementReport : detailReportType === "CATEGORY" ? categoryReport : dishReport;
    const isDishReport = detailReportType === "DISH";

    return (
      <View style={styles.detailReportCard}>
        <View style={styles.detailReportHeader}>
          {/* Spacer to balance the actions on the right for exact centering */}
          <View style={{ width: 62 }} />
          <View style={styles.reportTitleContainer}>
            <Text style={styles.cardTitle}>
              {isSettlement ? "SETTLEMENT DETAILS REPORT" : isDishReport ? "DISH SALES REPORT" : "CATEGORY SALES REPORT"}
            </Text>
            <Text style={styles.reportSubText}>
              {rows.length} rows for the selected period
            </Text>
          </View>
          <View style={styles.reportHeaderActions}>
            <Ionicons
              name={isSettlement ? "wallet-outline" : isDishReport ? "restaurant-outline" : "albums-outline"}
              size={18}
              color={Theme.primary}
            />
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setDetailReportType(null);
                setCategoryReport([]);
                setDishReport([]);
                setSettlementReport([]);
              }}
              style={styles.reportCloseBtn}
            >
              <Ionicons name="close" size={18} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>

        {loadingReport ? (
          <View style={styles.reportLoading}>
            <ActivityIndicator color={Theme.primary} />
            <Text style={styles.reportSubText}>Loading report...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyReport}>
            <Ionicons
              name="document-text-outline"
              size={32}
              color={Theme.textMuted}
            />
            <Text style={styles.emptyChartText}>No report data</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ minWidth: "100%" }}
          >
            <View style={styles.reportTable}>
              <View style={styles.reportTableHeader}>
                <Text style={[styles.reportCell, styles.snoCell]}>S/N</Text>
                {isSettlement ? (
                  <>
                    <Text style={[styles.reportCell, styles.paymodeCell]}>Paymode</Text>
                    <Text style={[styles.reportCell, styles.sysAmtCell]}>Sys Amt</Text>
                    <Text style={[styles.reportCell, styles.manualAmtCell]}>Manual Amt</Text>
                    <Text style={[styles.reportCell, styles.diffCell]}>Diff</Text>
                    <Text style={[styles.reportCell, styles.qtyCell]}>Qty</Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.reportCell,
                        isDishReport
                          ? styles.dishNameCell
                          : styles.categoryNameCell,
                      ]}
                    >
                      {isDishReport ? "Dish" : "Category"}
                    </Text>
                    {isDishReport && (
                      <Text style={[styles.reportCell, styles.categoryNameCell]}>
                        Category
                      </Text>
                    )}
                    {isDishReport && (
                      <Text style={[styles.reportCell, styles.subCategoryNameCell]}>
                        Subcategory
                      </Text>
                    )}
                    <Text style={[styles.reportCell, styles.qtyCell, { textAlign: "center" }]}>QTY</Text>
                    <Text style={[styles.reportCell, styles.qtyCell, { textAlign: "center", color: '#ef4444' }]}>VOID</Text>
                    <Text style={[styles.reportCell, styles.amountCell]}>Sales</Text>
                  </>
                )}
              </View>
              {rows.slice(0, 100).map((row, idx) => (
                <View
                  key={`${detailReportType}-${idx}`}
                  style={[
                    styles.reportTableRow,
                    idx % 2 === 0 && styles.reportTableRowAlt,
                  ]}
                >
                  <Text
                    style={[
                      styles.reportCell,
                      styles.reportCellText,
                      styles.snoCell,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                  {isSettlement ? (
                    <>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.paymodeCell, { textAlign: 'left' }]}>
                        {row.Paymode}
                      </Text>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.sysAmtCell, { color: Theme.success }]}>
                        {formatCurrency(row.SysAmount)}
                      </Text>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.manualAmtCell, { color: Theme.primary }]}>
                        {formatCurrency(row.ManualAmount)}
                      </Text>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.diffCell, { color: row.SortageOrExces < 0 ? '#dc2626' : Theme.textPrimary }]}>
                        {formatCurrency(row.SortageOrExces)}
                      </Text>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.qtyCell]}>
                        {Number(row.ReceiptCount || 0).toFixed(0)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          isDishReport
                            ? styles.dishNameCell
                            : styles.categoryNameCell,
                        ]}
                      >
                        {isDishReport ? row.DishName : row.CategoryName}
                      </Text>
                      {isDishReport && (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.categoryNameCell,
                          ]}
                        >
                          {row.CategoryName || "Unmapped"}
                        </Text>
                      )}
                      {isDishReport && (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.reportCell,
                            styles.reportCellText,
                            styles.subCategoryNameCell,
                          ]}
                        >
                          {row.SubCategoryName || "Unmapped"}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.qtyCell,
                        ]}
                      >
                        {Number(row.Sold || 0).toFixed(0)}
                      </Text>
                      <Text style={[styles.reportCell, styles.reportCellText, styles.qtyCell, { color: '#dc2626' }]}>
                        {Number(row.Voided || 0).toFixed(0)}
                      </Text>
                      <Text
                        style={[
                          styles.reportCell,
                          styles.reportCellText,
                          styles.amountCell,
                          { color: Theme.success, fontWeight: "bold" },
                        ]}
                      >
                        {formatCurrency(Number(row.SalesAmount || 0))}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bgMain }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.dashboardHeader}>
            <View style={styles.headerContent}>
              <Text style={styles.dashboardYear}>
                {new Date().getFullYear()}
              </Text>
              <Text style={styles.dashboardTitle}>SALES ANALYTICS</Text>
              <Text style={styles.dashboardSubtitle}>
                Comprehensive performance dashboard
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backBtn}
              >
                <Ionicons
                  name="arrow-back"
                  size={20}
                  color={Theme.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilterPanel(true)}
                style={styles.filterMenuBtn}
              >
                <Ionicons
                  name="filter-outline"
                  size={20}
                  color={Theme.primary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Theme.primary}
              />
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Active Badges */}
            <View style={styles.badgeRow}>
              {activePaymentModes.length < 4 &&
                activePaymentModes.map((m) => (
                  <View
                    key={m}
                    style={[styles.activeBadge, { borderColor: Theme.border }]}
                  >
                    <Text style={styles.badgeText}>{m}</Text>
                    <TouchableOpacity onPress={() => togglePaymentMode(m)}>
                      <Ionicons
                        name="close-circle"
                        size={14}
                        color={Theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              {activeOrderTypes.length < 2 &&
                activeOrderTypes.map((t) => (
                  <View
                    key={t}
                    style={[styles.activeBadge, { borderColor: Theme.border }]}
                  >
                    <Text style={styles.badgeText}>{t}</Text>
                    <TouchableOpacity onPress={() => toggleOrderType(t)}>
                      <Ionicons
                        name="close-circle"
                        size={14}
                        color={Theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
            </View>

            {/* Filter Toggles */}
            <View style={styles.filterBar}>
              {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as FilterType[]).map(
                (f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setSelectedFilter(f)}
                    style={[
                      styles.filterBtn,
                      selectedFilter === f && styles.activeFilterBtn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        selectedFilter === f && styles.activeFilterText,
                      ]}
                    >
                      {f}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            {/* Date Navigation */}
            <View style={styles.dateControl}>
              <TouchableOpacity
                onPress={() => changeDate(-1)}
                style={styles.navBtn}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={Theme.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  console.log("[SalesReport] Opening DatePicker");
                  setShowDatePicker(true);
                }}
                style={styles.dateDisplay}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateText, selectionMode === "RANGE" && { fontSize: 13 }]}>
                  {selectedFilter === "CUSTOM" && rangeStart && rangeEnd 
                    ? `${format(new Date(rangeStart), "MMM d")} - ${format(new Date(rangeEnd), "MMM d, yyyy")}` 
                    : selectedDate}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={Theme.primary}
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => changeDate(1)}
                style={styles.navBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={Theme.textPrimary}
                />
              </TouchableOpacity>
            </View>

            {/* Metrics Grid */}
            <View style={styles.metricsGrid}>
              {renderMetricTile(
                "Gross Revenue",
                formatCurrency(filteredMetrics.TotalSales),
                "card-outline",
                Theme.success,
              )}
              {renderMetricTile(
                "Avg Check",
                formatCurrency(avgOrder),
                "analytics-outline",
                Theme.primary,
              )}
              {renderMetricTile(
                "Total Orders",
                filteredMetrics.TotalTransactions,
                "receipt-outline",
                Theme.warning,
              )}
              {renderMetricTile(
                "Items Sold",
                filteredMetrics.TotalItems,
                "fast-food-outline",
                "#ec4899",
              )}
              {renderMetricTile(
                "Total Voids",
                `${filteredMetrics.TotalVoids} (${formatCurrency(filteredMetrics.TotalVoidAmount)})`,
                "trash-outline",
                "#ef4444",
              )}
            </View>

            <View style={styles.reportSwitchRow}>
              <TouchableOpacity
                onPress={() => handleReportPress("CATEGORY")}
                style={[
                  styles.reportSwitchBtn,
                  detailReportType === "CATEGORY" &&
                    styles.activeReportSwitchBtn,
                ]}
              >
                <Ionicons
                  name="albums-outline"
                  size={16}
                  color={
                    detailReportType === "CATEGORY" ? "#fff" : Theme.primary
                  }
                />
                <Text
                  style={[
                    styles.reportSwitchText,
                    detailReportType === "CATEGORY" &&
                      styles.activeReportSwitchText,
                  ]}
                >
                  Category Sales Report
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleReportPress("DISH")}
                style={[
                  styles.reportSwitchBtn,
                  detailReportType === "DISH" && styles.activeReportSwitchBtn,
                ]}
              >
                <Ionicons
                  name="restaurant-outline"
                  size={16}
                  color={detailReportType === "DISH" ? "#fff" : Theme.primary}
                />
                <Text
                  style={[
                    styles.reportSwitchText,
                    detailReportType === "DISH" &&
                      styles.activeReportSwitchText,
                  ]}
                >
                  Item Sales Report
                </Text>
              </TouchableOpacity>
            </View>

            {renderDetailReport()}

            {/* Charts Section */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chartsScrollContent}
            >
              <View style={styles.chartsContainer}>
                {/* Pie Chart */}
                <View
                  style={[
                    styles.chartCard,
                    {
                      width:
                        SCREEN_W > 768
                          ? Math.max(300, (SCREEN_W - 64) / 3)
                          : 300,
                    },
                  ]}
                >
                  <View style={styles.chartCardHeader}>
                    <Text style={styles.cardTitle}>PAYMENT CHANNEL MIX</Text>
                    <Ionicons
                      name="pie-chart"
                      size={14}
                      color={Theme.primary}
                    />
                  </View>
                  <View style={styles.chartContainer}>
                    {filteredMetrics.TotalSales > 0 ? (
                      <View style={styles.pieChartWrapper}>
                        <PieChart
                          data={[
                            {
                              value: filteredMetrics.Cash,
                              color: "#22c55e",
                              label: "CASH",
                            },
                            {
                              value: filteredMetrics.Card,
                              color: "#818cf8",
                              label: "CARD",
                            },
                            {
                              value: filteredMetrics.Nets,
                              color: "#3b82f6",
                              label: "NETS",
                            },
                            {
                              value: filteredMetrics.PayNow,
                              color: "#f59e0b",
                              label: "DIGITAL",
                            },
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
                                <Text
                                  key={row.key}
                                  style={styles.pieDonutCenterLine}
                                  numberOfLines={1}
                                >
                                  <Text
                                    style={[
                                      styles.pieDonutCenterPct,
                                      { color: row.color },
                                    ]}
                                  >
                                    {row.pct.toFixed(0)}%
                                  </Text>
                                  <Text style={styles.pieDonutCenterTag}>
                                    {" "}
                                    {row.key}
                                  </Text>
                                </Text>
                              ))}
                            </View>
                          )}
                        />
                      </View>
                    ) : (
                      <View style={styles.emptyChartPlaceholder}>
                        <Ionicons
                          name="pie-chart-outline"
                          size={40}
                          color={Theme.textMuted}
                        />
                        <Text style={styles.emptyChartText}>No sales data</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View
                  style={[
                    styles.chartCard,
                    {
                      width:
                        SCREEN_W > 768
                          ? Math.max(300, (SCREEN_W - 64) / 3)
                          : 300,
                    },
                  ]}
                >
                  <View style={styles.chartCardHeader}>
                    <Text style={styles.cardTitle}>ORDER TYPES</Text>
                    <Ionicons
                      name="layers-outline"
                      size={14}
                      color={Theme.primary}
                    />
                  </View>
                  <View style={styles.orderTypeStats}>
                    {(() => {
                      const dineIn = sales.filter(
                        (s) => !s.OrderType || s.OrderType === "DINE-IN",
                      ).length;
                      const takeaway = sales.filter(
                        (s) => s.OrderType === "TAKEAWAY",
                      ).length;
                      const total = dineIn + takeaway;
                      return (
                        <>
                          <View style={styles.statRow}>
                            <View style={styles.statLabel}>
                              <Text style={styles.statIcon}>🪑</Text>
                              <Text style={styles.statName}>Dine-In</Text>
                            </View>
                            <Text
                              style={[
                                styles.statValue,
                                { color: Theme.primary },
                              ]}
                            >
                              {total > 0
                                ? ((dineIn / total) * 100).toFixed(0)
                                : 0}
                              %
                            </Text>
                          </View>
                          <View style={styles.statRow}>
                            <View style={styles.statLabel}>
                              <Text style={styles.statIcon}>🛍️</Text>
                              <Text style={styles.statName}>Takeaway</Text>
                            </View>
                            <Text
                              style={[
                                styles.statValue,
                                { color: Theme.warning },
                              ]}
                            >
                              {total > 0
                                ? ((takeaway / total) * 100).toFixed(0)
                                : 0}
                              %
                            </Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                </View>

                <View
                  style={[
                    styles.chartCard,
                    {
                      width:
                        SCREEN_W > 768
                          ? Math.max(300, (SCREEN_W - 64) / 3)
                          : 300,
                    },
                  ]}
                >
                  <View style={styles.chartCardHeader}>
                    <Text style={styles.cardTitle}>KEY METRICS</Text>
                    <Ionicons
                      name="bar-chart-outline"
                      size={14}
                      color={Theme.primary}
                    />
                  </View>
                  <View style={styles.metricsStats}>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Conversion</Text>
                      <Text style={styles.metricValueSmall}>
                        {filteredMetrics.TotalTransactions}
                      </Text>
                    </View>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Avg Items</Text>
                      <Text style={styles.metricValueSmall}>
                        {filteredMetrics.TotalTransactions > 0
                          ? (
                              filteredMetrics.TotalItems /
                              filteredMetrics.TotalTransactions
                            ).toFixed(1)
                          : 0}
                      </Text>
                    </View>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Per Item</Text>
                      <Text style={styles.metricValueSmall}>
                        {formatCurrency(
                          filteredMetrics.TotalItems > 0
                            ? filteredMetrics.TotalSales /
                                filteredMetrics.TotalItems
                            : 0,
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Breakdown */}
            <View style={styles.breakdownCard}>
              <View style={styles.chartCardHeader}>
                <Text style={styles.cardTitle}>PAYMENT BREAKDOWN</Text>
                <Ionicons
                  name="wallet-outline"
                  size={14}
                  color={Theme.primary}
                />
              </View>
              <View style={styles.breakdownRow}>
                {[
                  {
                    label: "CASH",
                    val: filteredMetrics.Cash,
                    icon: "💵",
                    color: "#22c55e",
                  },
                  {
                    label: "CARD",
                    val: filteredMetrics.Card,
                    icon: "💳",
                    color: "#818cf8",
                  },
                  {
                    label: "NETS",
                    val: filteredMetrics.Nets,
                    icon: "🔳",
                    color: "#3b82f6",
                  },
                  {
                    label: "DIGITAL",
                    val: filteredMetrics.PayNow,
                    icon: "📱",
                    color: "#f59e0b",
                  },
                ].map((item, idx) => (
                  <View key={idx} style={styles.breakdownItem}>
                    <Text style={styles.breakdownIcon}>{item.icon}</Text>
                    <Text style={styles.breakdownLabel}>{item.label}</Text>
                    <Text
                      style={[styles.breakdownValue, { color: item.color }]}
                    >
                      {formatCurrency(item.val)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Recent Transactions */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>RECENT TRANSACTIONS</Text>
              <TouchableOpacity onPress={() => fetchData()}>
                <Text style={styles.seeAllText}>REFRESH</Text>
              </TouchableOpacity>
            </View>

            {filteredSales.slice(0, 15).map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleOrderPress(item)}
                style={styles.transactionCard}
              >
                <View style={styles.txIconWrap}>
                  <Ionicons
                    name={
                      item.PayMode === "CASH" ? "cash-outline" : "card-outline"
                    }
                    size={16}
                    color={item.PayMode === "CASH" ? "#22c55e" : Theme.primary}
                  />
                </View>
                <View style={styles.txOrderInfo}>
                  <Text style={styles.txTitle}>
                    {item.OrderType === "TAKEAWAY"
                      ? "🛍️ Takeaway"
                      : `🪑 Table ${item.TableNo || "N/A"}`}
                  </Text>
                  <Text style={styles.txSmall}>
                    Order #{formatOrderId(item)} {item.SER_NAME ? ` • Waiter: ${item.SER_NAME}` : ""}
                  </Text>
                </View>
                <View style={styles.txTimeInfo}>
                  <Text style={styles.txDatetime}>
                    {new Date(item.SettlementDate).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {new Date(item.SettlementDate).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <View style={styles.txRightInfo}>
                  <Text style={styles.txAmount}>
                    {formatCurrency(item.SysAmount)}
                  </Text>
                  {item.VoidAmount > 0 && (
                    <Text style={{ color: "#dc2626", fontSize: 10, fontFamily: Fonts.bold }}>
                      VOID: {formatCurrency(item.VoidAmount)}
                    </Text>
                  )}
                  <View style={styles.paidBadgeSmall}>
                    <Ionicons
                      name="checkmark"
                      size={10}
                      color={Theme.success}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Modal Overlay */}
          <Modal visible={!!selectedOrder} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalDismiss}
                onPress={() => setSelectedOrder(null)}
              />
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={styles.modalTitle}>
                        Order #{formatOrderId(selectedOrder)}
                      </Text>
                      <View style={[styles.paidBadgeSmall, { backgroundColor: Theme.primary + '15', borderColor: Theme.primary + '30', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }]}>
                        <Text style={{ color: Theme.primary, fontFamily: Fonts.black, fontSize: 10 }}>
                          {selectedOrder?.PayMode || 'CASH'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 12 }}>
                      <Text style={styles.modalSub}>
                        {new Date(selectedOrder?.SettlementDate).toLocaleString()}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons 
                          name={selectedOrder?.OrderType === "TAKEAWAY" ? "bag-handle" : "restaurant"} 
                          size={12} 
                          color={Theme.textMuted} 
                        />
                        <Text style={[styles.modalSub, { color: Theme.textPrimary, fontFamily: Fonts.bold }]}>
                          {selectedOrder?.OrderType === "TAKEAWAY" 
                            ? "Takeaway" 
                            : `Table ${selectedOrder?.TableNo || "N/A"}${selectedOrder?.Section ? ` • ${selectedOrder.Section}` : ""}`}
                        </Text>
                      </View>
                      {selectedOrder?.SER_NAME && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Theme.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Ionicons name="person" size={10} color={Theme.primary} />
                          <Text style={{ color: Theme.primary, fontFamily: Fonts.bold, fontSize: 10 }}>
                            {selectedOrder.SER_NAME}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedOrder(null)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalDivider} />
                <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                  {loadingDetails ? (
                    <View style={{ paddingVertical: 20 }}>
                      <ActivityIndicator color={Theme.primary} />
                    </View>
                  ) : (
                    orderDetails.map((item, idx) => (
                      <View key={idx} style={[styles.orderItemRow, idx !== orderDetails.length - 1 && { borderBottomWidth: 1, borderBottomColor: Theme.border + '50', paddingBottom: 12 }]}>
                        <View style={[styles.qtyBadgeSmall, { backgroundColor: item.Status === 'VOIDED' ? '#fee2e2' : Theme.primary + '10' }]}>
                          <Text style={[styles.orderItemQty, { width: 'auto', color: item.Status === 'VOIDED' ? '#dc2626' : Theme.primary }]}>{item.Qty}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.orderItemName, item.Status === 'VOIDED' && { textDecorationLine: 'line-through', color: Theme.textMuted }]}>
                            {item.DishName}
                            {item.Status === 'VOIDED' && (
                              <Text style={{ color: '#dc2626', fontSize: 10, fontFamily: Fonts.bold }}> (VOIDED)</Text>
                            )}
                          </Text>
                          <Text style={{ color: Theme.textMuted, fontSize: 10, fontFamily: Fonts.bold }}>UNIT: ${(item.Price || 0).toFixed(2)}</Text>
                        </View>
                        <Text style={[styles.orderItemPrice, item.Status === 'VOIDED' && { textDecorationLine: 'line-through', color: Theme.textMuted }]}>
                          ${(item.Price * item.Qty).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.modalDivider} />
                <View style={[styles.totalRow, { backgroundColor: Theme.primary + '05', padding: 12, borderRadius: 12, marginBottom: 16 }]}>
                  <View>
                    <Text style={[styles.totalLabel, { fontSize: 10, color: Theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }]}>Total Amount</Text>
                    <Text style={[styles.totalValue, { fontSize: 22 }]}>
                      {formatCurrency(selectedOrder?.SysAmount)}
                    </Text>
                  </View>
                  <View style={[styles.paidBadgeSmall, { paddingHorizontal: 6, paddingVertical: 2 }]}>
                    <Ionicons name="checkmark-circle" size={14} color={Theme.success} />
                    <Text style={{ color: Theme.success, fontFamily: Fonts.black, fontSize: 10, marginLeft: 4 }}>PAID</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedOrder(null)}
                    style={[styles.premiumPrimaryBtn, { flex: 1, paddingVertical: 12 }]}
                  >
                    <Text style={[styles.premiumPrimaryBtnText, { fontSize: 14 }]}>CLOSE</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowPrintPrompt(true)}
                    style={[styles.premiumSecondaryBtn, { flex: 1.2, paddingVertical: 12 }]}
                  >
                    <Ionicons name="print" size={16} color={Theme.primary} />
                    <Text style={[styles.premiumSecondaryBtnText, { fontSize: 14 }]}>REPRINT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Sidebar Modal */}
          <Modal visible={showFilterPanel} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.sidebarDismiss}
                onPress={() => setShowFilterPanel(false)}
              />
              <View style={styles.sidebarContent}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarTitle}>ADVANCED FILTERS</Text>
                  <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>PAYMENT MODES</Text>
                    <View style={styles.chipRow}>
                      {["CASH", "CARD", "NETS", "PAYNOW"].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => togglePaymentMode(m)}
                          style={[
                            styles.chip,
                            activePaymentModes.includes(m) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activePaymentModes.includes(m) &&
                                styles.activeChipText,
                            ]}
                          >
                            {m}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>ORDER TYPE</Text>
                    <View style={styles.chipRow}>
                      {["DINE-IN", "TAKEAWAY"].map((t) => (
                        <TouchableOpacity
                          key={t}
                          onPress={() => toggleOrderType(t)}
                          style={[
                            styles.chip,
                            activeOrderTypes.includes(t) && styles.activeChip,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              activeOrderTypes.includes(t) &&
                                styles.activeChipText,
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.sidebarSection}>
                    <Text style={styles.sectionLabel}>SORT BY</Text>
                    {[
                      {
                        id: "NEWEST",
                        label: "Newest First",
                        icon: "time-outline",
                      },
                      {
                        id: "HIGHEST",
                        label: "Highest Amount",
                        icon: "trending-up-outline",
                      },
                    ].map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSortOrder(s.id as any)}
                        style={[
                          styles.sortBtn,
                          sortOrder === s.id && styles.activeSortBtn,
                        ]}
                      >
                        <Ionicons
                          name={s.icon as any}
                          size={18}
                          color={
                            sortOrder === s.id ? Theme.primary : Theme.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.sortText,
                            sortOrder === s.id && styles.activeSortText,
                          ]}
                        >
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.sidebarFooter}>
                  <TouchableOpacity
                    onPress={() => {
                      setActivePaymentModes(["CASH", "CARD", "NETS", "PAYNOW"]);
                      setActiveOrderTypes(["DINE-IN", "TAKEAWAY"]);
                      setSortOrder("NEWEST");
                    }}
                    style={styles.resetBtn}
                  >
                    <Text style={styles.resetText}>RESET ALL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowFilterPanel(false)}
                    style={styles.applyBtn}
                  >
                    <Text style={styles.applyText}>APPLY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <BillPrompt
            visible={showPrintPrompt}
            onClose={() => setShowPrintPrompt(false)}
            onSkip={() => setShowPrintPrompt(false)}
            onPrintBill={handleReprint}
            theme={Theme}
            t={{
              printBillReceipt: "Reprint Receipt?",
              totalAmount: "Total",
              printBillMessage: "Would you like to reprint the receipt for this order?",
              skipBill: "Cancel",
              printBill: "Print",
            }}
            total={String(selectedOrder?.SysAmount || 0)}
          />

          {showDatePicker && (
            <Modal transparent visible={showDatePicker} animationType="fade">
              <View style={styles.modalOverlay}>
                <TouchableOpacity 
                  style={styles.modalDismiss} 
                  onPress={() => setShowDatePicker(false)} 
                />
                <View style={[styles.modalContent, { width: SCREEN_W > 600 ? 340 : '90%', maxWidth: 360, padding: 12 }]}>
                  <View style={[styles.modalHeader, { marginBottom: 8 }]}>
                    <Text style={[styles.modalTitle, { fontSize: 14 }]}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Ionicons name="close" size={18} color={Theme.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.modeToggleBar, { marginBottom: 12 }]}>
                    <TouchableOpacity 
                      style={[styles.modeToggleBtn, selectionMode === 'SINGLE' && styles.activeModeToggleBtn]}
                      onPress={() => {
                        setSelectionMode('SINGLE');
                        setRangeStart(null);
                        setRangeEnd(null);
                      }}
                    >
                      <Text style={[styles.modeToggleText, selectionMode === 'SINGLE' && styles.activeModeToggleText]}>SINGLE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.modeToggleBtn, selectionMode === 'RANGE' && styles.activeModeToggleBtn]}
                      onPress={() => setSelectionMode('RANGE')}
                    >
                      <Text style={[styles.modeToggleText, selectionMode === 'RANGE' && styles.activeModeToggleText]}>RANGE</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.customCalendar}>
                    {calendarView === "DAYS" ? (
                      <>
                        <View style={[styles.calendarHeader, { marginBottom: 12 }]}>
                          <TouchableOpacity 
                            style={[styles.calendarNavBtn, { width: 30, height: 30 }]}
                            onPress={() => setViewDate(subMonths(viewDate, 1))}
                          >
                            <Ionicons name="chevron-back" size={16} color={Theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setCalendarView("MONTHS")}>
                            <Text style={[styles.calendarMonthText, { fontSize: 14 }]}>{format(viewDate, "MMMM yyyy")}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.calendarNavBtn, { width: 30, height: 30 }]}
                            onPress={() => setViewDate(addMonths(viewDate, 1))}
                          >
                            <Ionicons name="chevron-forward" size={16} color={Theme.primary} />
                          </TouchableOpacity>
                        </View>

                        <View style={[styles.calendarWeekRow, { marginBottom: 6 }]}>
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                            <Text key={d} style={[styles.calendarWeekText, { fontSize: 11 }]}>{d}</Text>
                          ))}
                        </View>

                        {(() => {
                          const monthStart = startOfMonth(viewDate);
                          const monthEnd = endOfMonth(monthStart);
                          const startDate = startOfWeek(monthStart);
                          const endDate = endOfWeek(monthEnd);

                          const rows = [];
                          let days = [];
                          let day = startDate;

                          while (day <= endDate) {
                            for (let i = 0; i < 7; i++) {
                              const currentDay = day;
                              const dateStr = format(currentDay, "yyyy-MM-dd");
                              
                              const isSelected = selectionMode === 'SINGLE' 
                                ? isSameDay(currentDay, new Date(selectedDate))
                                : (rangeStart === dateStr || rangeEnd === dateStr);
                              
                              const isInRange = selectionMode === 'RANGE' && rangeStart && rangeEnd && 
                                new Date(dateStr) >= new Date(rangeStart) && 
                                new Date(dateStr) <= new Date(rangeEnd);

                              const isCurrentMonth = isSameMonth(currentDay, monthStart);
                              const isToday = isSameDay(currentDay, new Date());
                              
                              days.push(
                                <TouchableOpacity
                                  key={currentDay.toString()}
                                  style={[
                                    styles.calendarDay,
                                    isSelected && styles.selectedDay,
                                    isInRange && !isSelected && styles.inRangeDay,
                                    isToday && !isSelected && !isInRange && styles.todayDay
                                  ]}
                                  onPress={() => {
                                    if (selectionMode === 'SINGLE') {
                                      setSelectedDate(dateStr);
                                      setSelectedFilter("DAILY");
                                      setShowDatePicker(false);
                                    } else {
                                      if (!rangeStart || (rangeStart && rangeEnd)) {
                                        setRangeStart(dateStr);
                                        setRangeEnd(null);
                                      } else {
                                        if (new Date(dateStr) < new Date(rangeStart)) {
                                          setRangeStart(dateStr);
                                          setRangeEnd(rangeStart);
                                        } else {
                                          setRangeEnd(dateStr);
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <Text style={[
                                    styles.calendarDayText,
                                    { fontSize: 12 },
                                    isSelected && styles.selectedDayText,
                                    !isCurrentMonth && styles.otherMonthDayText,
                                    isToday && !isSelected && !isInRange && { color: Theme.primary }
                                  ]}>
                                    {format(currentDay, "d")}
                                  </Text>
                                </TouchableOpacity>
                              );
                              day = addDays(day, 1);
                            }
                            rows.push(
                              <View key={day.toString()} style={styles.calendarRow}>
                                {days}
                              </View>
                            );
                            days = [];
                          }
                          return rows;
                        })()}
                      </>
                    ) : calendarView === "MONTHS" ? (
                      <View style={styles.pickerGrid}>
                        <View style={styles.pickerHeader}>
                          <Text style={styles.pickerTitle}>Select Month</Text>
                          <TouchableOpacity onPress={() => setCalendarView("YEARS")}>
                            <Text style={styles.pickerSubtitle}>{getYear(viewDate)}</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.gridRow}>
                          {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, idx) => (
                            <TouchableOpacity 
                              key={m} 
                              style={[styles.pickerItem, getMonth(viewDate) === idx && styles.activePickerItem]}
                              onPress={() => {
                                setViewDate(setMonth(viewDate, idx));
                                setCalendarView("DAYS");
                              }}
                            >
                              <Text style={[styles.pickerItemText, getMonth(viewDate) === idx && styles.activePickerItemText]}>{m}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View style={styles.pickerGrid}>
                        <View style={styles.pickerHeader}>
                          <Text style={styles.pickerTitle}>Select Year</Text>
                          <TouchableOpacity onPress={() => setCalendarView("MONTHS")}>
                            <Ionicons name="arrow-back" size={16} color={Theme.primary} />
                          </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                          <View style={styles.gridRow}>
                            {Array.from({ length: 11 }, (_, i) => 2020 + i).map(y => (
                              <TouchableOpacity 
                                key={y} 
                                style={[styles.pickerItem, getYear(viewDate) === y && styles.activePickerItem]}
                                onPress={() => {
                                  setViewDate(setYear(viewDate, y));
                                  setCalendarView("MONTHS");
                                }}
                              >
                                <Text style={[styles.pickerItemText, getYear(viewDate) === y && styles.activePickerItemText]}>{y}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {selectionMode === 'RANGE' && (
                    <TouchableOpacity
                      onPress={() => {
                        if (rangeStart && rangeEnd) {
                          setSelectedFilter("CUSTOM");
                          setShowDatePicker(false);
                        }
                      }}
                      disabled={!rangeStart || !rangeEnd}
                      style={[styles.premiumPrimaryBtn, { marginTop: 12, paddingVertical: 10, width: '100%', opacity: (!rangeStart || !rangeEnd) ? 0.5 : 1 }]}
                    >
                      <Text style={[styles.premiumPrimaryBtnText, { fontSize: 12 }]}>APPLY RANGE</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      const todayStr = format(new Date(), "yyyy-MM-dd");
                      setSelectedDate(todayStr);
                      setSelectedFilter("DAILY");
                      setSelectionMode("SINGLE");
                      setRangeStart(null);
                      setRangeEnd(null);
                      setShowDatePicker(false);
                    }}
                    style={[styles.premiumSecondaryBtn, { marginTop: selectionMode === 'RANGE' ? 6 : 10, paddingVertical: 10, width: '100%' }]}
                  >
                    <Text style={[styles.premiumSecondaryBtnText, { fontSize: 12 }]}>GO TO TODAY</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
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
  dashboardYear: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 14,
    marginBottom: 4,
  },
  dashboardTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 26,
  },
  dashboardSubtitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 4,
  },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  filterMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowSm,
  },
  backBtnLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  badgeText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  filterBar: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    padding: 4,
    backgroundColor: Theme.bgNav,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeFilterBtn: { backgroundColor: Theme.primary, ...Theme.shadowSm },
  filterText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 11,
  },
  activeFilterText: { color: "#fff" },
  dateControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
  },
  dateDisplay: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.bgCard,
  },
  dateText: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 16 },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  metricTile: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    backgroundColor: Theme.bgCard,
    ...Theme.shadowMd,
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  tileLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  tileValue: { fontFamily: Fonts.black, fontSize: 22 },
  reportSwitchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  reportSwitchBtn: {
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.primaryBorder,
    ...Theme.shadowSm,
  },
  activeReportSwitchBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  reportSwitchText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  activeReportSwitchText: { color: "#fff" },
  detailReportCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  detailReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  reportTitleContainer: { flex: 1, alignItems: "center" },
  reportHeaderActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2", // Light red background
    borderWidth: 1,
    borderColor: "#fecaca", // Light red border
  },
  reportSubText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    marginTop: 4,
  },
  reportLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyReport: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reportTable: {
    width: "100%",
    minWidth: 360,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.bgCard,
  },
  reportTableHeader: {
    flexDirection: "row",
    backgroundColor: Theme.bgMuted,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  reportTableRowAlt: {
    backgroundColor: Theme.bgMain,
  },
  reportCell: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 11,
    textTransform: "uppercase",
    textAlign: "center",
  },
  reportCellText: {
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
    textTransform: "none",
    textAlign: "center",
  },
  snoCell: {
    width: 45,
    textAlign: "center",
    flexShrink: 0,
  },
  dishNameCell: {
    minWidth: 150,
    flex: 2,
    textAlign: "center",
  },
  categoryNameCell: {
    minWidth: 120,
    flex: 1.5,
    textAlign: "center",
  },
  subCategoryNameCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "center",
  },
  qtyCell: {
    width: 70,
    textAlign: "center",
    flexShrink: 0,
  },
  amountCell: {
    width: 100,
    textAlign: "center",
    flexShrink: 0,
  },
  paymodeCell: {
    minWidth: 100,
    flex: 1,
    textAlign: "left",
  },
  sysAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  manualAmtCell: {
    width: 90,
    textAlign: "right",
    flexShrink: 0,
  },
  diffCell: {
    width: 80,
    textAlign: "right",
    flexShrink: 0,
  },
  chartsScrollContent: {
    paddingRight: 16, // Extra padding at the end for scrolling
    marginBottom: 24,
  },
  chartsContainer: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 12,
  },
  chartCard: {
    flex: 1,
    padding: 20,
    borderRadius: 20,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  chartCardWide: { width: "100%" },
  chartCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 12,
    letterSpacing: 1,
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pieChartWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  pieDonutCenter: { alignItems: "center", justifyContent: "center", gap: 4 },
  pieDonutCenterLine: { textAlign: "center" },
  pieDonutCenterPct: { fontFamily: Fonts.black, fontSize: 13 },
  pieDonutCenterTag: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  emptyChartPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyChartText: {
    color: Theme.textMuted,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  orderTypeStats: { gap: 12 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: { fontSize: 20 },
  statName: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 13 },
  statValue: { fontFamily: Fonts.black, fontSize: 16 },
  metricsStats: { gap: 10 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  metricLabel: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  metricValueSmall: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 15,
  },
  breakdownCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    ...Theme.shadowMd,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  breakdownItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  breakdownIcon: { fontSize: 24 },
  breakdownLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  breakdownValue: { fontFamily: Fonts.black, fontSize: 11 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.black,
    fontSize: 13,
    letterSpacing: 1,
  },
  seeAllText: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 12 },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: Theme.bgCard,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 12,
    ...Theme.shadowSm,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  txOrderInfo: { flex: 1 },
  txTitle: { color: Theme.textPrimary, fontFamily: Fonts.bold, fontSize: 14 },
  txSmall: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 10,
    marginTop: 2,
  },
  txTimeInfo: { flex: 1, alignItems: "center" },
  txDatetime: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  txRightInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  txAmount: { color: Theme.textPrimary, fontFamily: Fonts.black, fontSize: 15 },
  paidBadgeSmall: {
    backgroundColor: Theme.success + "20",
    padding: 4,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.success + "40",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    width: "80%",
    maxWidth: 400,
    backgroundColor: Theme.bgCard,
    borderRadius: 20,
    padding: 20,
    ...Theme.shadowLg,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  modalSub: {
    color: Theme.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Theme.border,
    marginVertical: 12,
  },
  itemsList: { maxHeight: 220 },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  orderItemQty: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
    width: 25,
  },
  orderItemName: {
    flex: 1,
    color: Theme.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  orderItemPrice: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  totalLabel: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  totalValue: { color: Theme.primary, fontFamily: Fonts.black, fontSize: 22 },
  doneBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  doneBtnText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  qtyBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 32,
  },
  premiumPrimaryBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: 'center',
    ...Theme.shadowMd,
  },
  premiumPrimaryBtnText: {
    color: "#fff",
    fontFamily: Fonts.black,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  premiumSecondaryBtn: {
    backgroundColor: Theme.primary + '10',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1.5,
    borderColor: Theme.primary + '20',
  },
  premiumSecondaryBtnText: {
    color: Theme.primary,
    fontFamily: Fonts.black,
    fontSize: 13,
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: "row-reverse",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sidebarDismiss: { flex: 1 },
  sidebarContent: {
    width: 320,
    height: "100%",
    backgroundColor: Theme.bgCard,
    padding: 24,
    paddingTop: 60,
    borderLeftWidth: 1,
    borderLeftColor: Theme.border,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  sidebarTitle: {
    color: Theme.textPrimary,
    fontFamily: Fonts.black,
    fontSize: 16,
  },
  sidebarSection: { marginBottom: 24 },
  sectionLabel: {
    color: Theme.textMuted,
    fontFamily: Fonts.black,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 12,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.bgMuted,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeChip: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  chipText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  activeChipText: { color: "#fff" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Theme.bgMuted,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activeSortBtn: {
    backgroundColor: Theme.primary + "10",
    borderColor: Theme.primary,
  },
  sortText: {
    color: Theme.textSecondary,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
  activeSortText: { color: Theme.primary },
  sidebarFooter: { marginTop: "auto", gap: 12 },
  applyBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    ...Theme.shadowMd,
  },
  applyText: { color: "#fff", fontFamily: Fonts.black, fontSize: 14 },
  resetBtn: { paddingVertical: 14, alignItems: "center" },
  resetText: { color: Theme.textMuted, fontFamily: Fonts.bold, fontSize: 12 },
  modeToggleBar: {
    flexDirection: 'row',
    backgroundColor: Theme.bgNav,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeModeToggleBtn: {
    backgroundColor: Theme.bgCard,
    ...Theme.shadowSm,
  },
  modeToggleText: {
    fontSize: 10,
    fontFamily: Fonts.black,
    color: Theme.textMuted,
  },
  activeModeToggleText: {
    color: Theme.primary,
  },
  inRangeDay: {
    backgroundColor: Theme.primary + '20',
    borderRadius: 0,
  },
  customCalendar: {
    paddingTop: 5,
  },
  pickerGrid: {
    paddingVertical: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  pickerTitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  pickerSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.black,
    color: Theme.primary,
    backgroundColor: Theme.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  pickerItem: {
    width: '30%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Theme.bgNav,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  activePickerItem: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  pickerItemText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Theme.textSecondary,
  },
  activePickerItemText: {
    color: '#fff',
    fontFamily: Fonts.black,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.bgMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  calendarMonthText: {
    fontSize: 16,
    fontFamily: Fonts.black,
    color: Theme.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  calendarWeekText: {
    flex: 1,
    textAlign: 'center',
    color: Theme.textMuted,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 1,
  },
  calendarDayText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Theme.textPrimary,
  },
  selectedDay: {
    backgroundColor: Theme.primary,
    ...Theme.shadowSm,
  },
  selectedDayText: {
    color: '#fff',
    fontFamily: Fonts.black,
  },
  todayDay: {
    backgroundColor: Theme.primary + '10',
    borderWidth: 1,
    borderColor: Theme.primary + '30',
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  otherMonthDayText: {
    color: Theme.textMuted,
  },
});
