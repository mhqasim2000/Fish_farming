import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  Activity as ActivityIcon,
  BarChart3,
  Calculator,
  Droplets,
  Fish,
  Leaf,
  MapPin,
  PackageOpen,
  ShoppingCart,
  Skull,
  Sprout,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, StatCard } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const timeframeTabs = [
  { id: "weekly", label: "7 Days" },
  { id: "monthly", label: "30 Days" },
  { id: "yearly", label: "1 Year" },
  { id: "all-time", label: "All Time" },
  { id: "custom", label: "Custom" },
];

const activityFilters = [
  { value: "all", label: "All Activities" },
  { value: "pond_created", label: "Pond Creation" },
  { value: "stocking", label: "Stocking" },
  { value: "feed", label: "Feed" },
  { value: "fertilizer", label: "Fertilizers" },
  { value: "mortality", label: "Mortality" },
  { value: "harvest", label: "Harvest" },
  { value: "water", label: "Water Parameters" },
  { value: "disease", label: "Disease" },
  { value: "treatment", label: "Treatment" },
  { value: "expense", label: "Expenses" },
  { value: "sale", label: "Sales" },
  { value: "marketplace_sale", label: "Marketplace Sales" },
  { value: "marketplace_purchase", label: "Marketplace Purchases" },
  { value: "stock_purchase", label: "Stock Purchases" },
];

const formatDateTime = value => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString();
};

const formatDate = value => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString();
};

const getEventIcon = type => {
  switch (type) {
    case "pond_created":
      return <MapPin size={18} color="#2563EB" />;
    case "stocking":
      return <Fish size={18} color="#4F46E5" />;
    case "feed":
      return <PackageOpen size={18} color="#D97706" />;
    case "fertilizer":
      return <Sprout size={18} color="#65A30D" />;
    case "mortality":
      return <Skull size={18} color="#DC2626" />;
    case "harvest":
      return <Waves size={18} color="#059669" />;
    case "marketplace_sale":
    case "marketplace_purchase":
    case "stock_purchase":
      return <ShoppingCart size={18} color="#0F766E" />;
    case "expense":
      return <TrendingDown size={18} color="#EA580C" />;
    case "sale":
      return <TrendingUp size={18} color="#059669" />;
    case "water":
      return <Droplets size={18} color="#0891B2" />;
    case "disease":
      return <ActivityIcon size={18} color="#E11D48" />;
    case "treatment":
      return <Leaf size={18} color="#7C3AED" />;
    default:
      return <ActivityIcon size={18} color="#6B7280" />;
  }
};

export default function ReportsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("reports");
  const [timeframe, setTimeframe] = useState("all-time");
  const [activityFilter, setActivityFilter] = useState("all");
  const [reportsPondFilter, setReportsPondFilter] = useState("all");
  const [roiPondFilter, setRoiPondFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [reportData, setReportData] = useState(null);
  const [roiData, setROIData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReports = async (timeframeOverride = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const useCustom = timeframeOverride === "custom";
      const res = await farmApi.getFarmReports(
        timeframeOverride,
        useCustom ? customStartDate || undefined : undefined,
        useCustom ? customEndDate || undefined : undefined,
      );
      if (res?.success) {
        setReportData(res);
      } else {
        setError(res?.error || "Failed to load reports data.");
      }
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchROIReport = async (timeframeOverride = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const useCustom = timeframeOverride === "custom";
      const res = await farmApi.getROIReport(
        timeframeOverride,
        useCustom ? customStartDate || undefined : undefined,
        useCustom ? customEndDate || undefined : undefined,
      );
      if (res?.success) {
        setROIData(res);
      } else {
        setError(res?.error || "Failed to load ROI data.");
      }
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "reports") {
      fetchReports();
    } else {
      fetchROIReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, activeTab]);

  const uniquePonds = useMemo(() => {
    if (!reportData?.activities?.length) return [];
    return [...new Set(reportData.activities.map(item => item.pondName).filter(Boolean))];
  }, [reportData]);

  const filteredActivities = useMemo(() => {
    const activities = reportData?.activities || [];
    return activities
      .filter(act => activityFilter === "all" || act.type === activityFilter)
      .filter(act => reportsPondFilter === "all" || act.pondName === reportsPondFilter);
  }, [activityFilter, reportsPondFilter, reportData]);

  const applyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      Alert.alert("Custom Range", "Enter both start and end dates (YYYY-MM-DD).");
      return;
    }
    if (timeframe !== "custom") {
      setTimeframe("custom");
    }
    if (activeTab === "reports") {
      fetchReports("custom");
    } else {
      fetchROIReport("custom");
    }
  };

  const summary = reportData?.summary || {};
  const roiSummary = roiData?.summary || {};
  const roiHarvests = roiData?.harvests || [];
  const roiPonds = [...new Set(roiHarvests.map(item => item.pondName).filter(Boolean))];
  const filteredRoiHarvests =
    roiPondFilter === "all"
      ? roiHarvests
      : roiHarvests.filter(item => item.pondName === roiPondFilter);

  return (
    <AppScaffold
      title="Farm Reports"
      subtitle="Comprehensive activity and financial tracking"
      navigation={navigation}
      currentRoute="Reports"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "reports" && styles.activeTab]}
          onPress={() => setActiveTab("reports")}
        >
          <BarChart3 size={16} color={activeTab === "reports" ? "#FFFFFF" : "#6B7280"} />
          <Text style={[styles.tabText, activeTab === "reports" && styles.activeTabText]}>Farm Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "roi" && styles.activeTab]}
          onPress={() => setActiveTab("roi")}
        >
          <Calculator size={16} color={activeTab === "roi" ? "#FFFFFF" : "#6B7280"} />
          <Text style={[styles.tabText, activeTab === "roi" && styles.activeTabText]}>ROI Report</Text>
        </TouchableOpacity>
      </ScrollView>

      <Card>
        <Text style={styles.sectionTitle}>Timeframe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeframeRow}>
          {timeframeTabs.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.timeframeChip, timeframe === tab.id && styles.activeTimeframeChip]}
              onPress={() => setTimeframe(tab.id)}
            >
              <Text style={[styles.timeframeText, timeframe === tab.id && styles.activeTimeframeText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Card>

      {timeframe === "custom" && (
        <Card>
          <Text style={styles.sectionTitle}>Custom Date Range</Text>
          <View style={styles.coordRow}>
            <TextInput
              value={customStartDate}
              onChangeText={setCustomStartDate}
              placeholder="Start YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              style={styles.coordInput}
            />
            <TextInput
              value={customEndDate}
              onChangeText={setCustomEndDate}
              placeholder="End YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              style={styles.coordInput}
            />
          </View>
          <PrimaryButton title="Apply Range" onPress={applyCustomRange} />
        </Card>
      )}

      {activeTab === "reports" && (
        <Card>
          <Text style={styles.sectionTitle}>Filters</Text>
          {uniquePonds.length > 0 && (
            <View style={styles.pickerBox}>
              <Picker
                selectedValue={reportsPondFilter}
                onValueChange={value => setReportsPondFilter(String(value || "all"))}
              >
                <Picker.Item label="All Ponds" value="all" />
                {uniquePonds.map(pond => (
                  <Picker.Item key={pond} label={pond} value={pond} />
                ))}
              </Picker>
            </View>
          )}
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={activityFilter}
              onValueChange={value => setActivityFilter(String(value || "all"))}
            >
              {activityFilters.map(option => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
        </Card>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton
            title="Try Again"
            onPress={activeTab === "reports" ? fetchReports : fetchROIReport}
          />
        </Card>
      ) : activeTab === "reports" ? (
        <>
          <View style={styles.statsGrid}>
            <StatCard label="Total Events" value={`${summary.totalEvents || 0}`} />
            <StatCard
              label="Revenue"
              value={`PKR ${Number(summary.totalRevenue || 0).toLocaleString()}`}
              accent="#059669"
            />
            <StatCard
              label="Expenses"
              value={`PKR ${Number(summary.totalExpense || 0).toLocaleString()}`}
              accent="#DC2626"
            />
            <StatCard
              label="Net Profit"
              value={`PKR ${Number(summary.netProfit || 0).toLocaleString()}`}
              accent={Number(summary.netProfit || 0) >= 0 ? "#059669" : "#DC2626"}
            />
          </View>

          {filteredActivities.length === 0 ? (
            <EmptyState
              title="No activities recorded"
              text="No activities were found for this period and filter selection."
            />
          ) : (
            filteredActivities.map((act, idx) => (
              <Card key={`${act.type}-${act.date}-${idx}`}>
                <View style={styles.activityTop}>
                  <View style={styles.activityTitleRow}>
                    {getEventIcon(act.type)}
                    <Text style={styles.activityTitle}>{act.title}</Text>
                  </View>
                  <Text style={styles.activityDate}>{formatDateTime(act.date)}</Text>
                </View>
                <Text style={styles.activityDescription}>{act.description}</Text>
                {!!act.pondName && <Text style={styles.activityMeta}>Pond: {act.pondName}</Text>}
              </Card>
            ))
          )}
        </>
      ) : (
        <>
          {roiPonds.length > 1 && (
            <Card>
              <Text style={styles.sectionTitle}>Pond Filter</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={roiPondFilter}
                  onValueChange={value => setRoiPondFilter(String(value || "all"))}
                >
                  <Picker.Item label="All Ponds" value="all" />
                  {roiPonds.map(pond => (
                    <Picker.Item key={pond} label={pond} value={pond} />
                  ))}
                </Picker>
              </View>
            </Card>
          )}

          <View style={styles.statsGrid}>
            <StatCard label="Harvests" value={`${roiSummary.totalHarvests || 0}`} />
            <StatCard
              label="Fish Harvested"
              value={`${Number(roiSummary.totalFishHarvested || 0).toLocaleString()}`}
              accent="#2563EB"
            />
            <StatCard
              label="Revenue"
              value={`PKR ${Number(roiSummary.totalRevenue || 0).toLocaleString()}`}
              accent="#059669"
            />
            <StatCard
              label="Weight Harvested"
              value={`${Number(roiSummary.totalWeightHarvested || 0).toLocaleString()} kg`}
              accent="#0891B2"
            />
            <StatCard
              label="Overall ROI"
              value={`${Number(roiSummary.overallROI || 0).toFixed(1)}%`}
              accent={Number(roiSummary.overallROI || 0) >= 0 ? "#059669" : "#DC2626"}
            />
            <StatCard
              label="Profitable"
              value={`${roiSummary.profitableHarvests || 0}`}
              accent="#059669"
            />
            <StatCard
              label="Unprofitable"
              value={`${roiSummary.unprofitableHarvests || 0}`}
              accent="#DC2626"
            />
            <StatCard
              label="Total Expenses"
              value={`PKR ${Number(roiSummary.totalAllocatedExpenses || 0).toLocaleString()}`}
              accent="#DC2626"
            />
            <StatCard
              label="Total Profit"
              value={`PKR ${Number(roiSummary.totalProfit || 0).toLocaleString()}`}
              accent={Number(roiSummary.totalProfit || 0) >= 0 ? "#059669" : "#DC2626"}
            />
          </View>

          {filteredRoiHarvests.length === 0 ? (
            <EmptyState
              title="No harvests recorded"
              text="Harvest your fish to see ROI analysis here."
            />
          ) : (
            filteredRoiHarvests.map(item => (
              <Card key={String(item.harvestId)}>
                <View style={styles.requestTop}>
                  <View style={styles.flexOne}>
                    <Text style={styles.activityTitle}>{item.speciesName}</Text>
                    <Text style={styles.activityMeta}>{item.pondName}</Text>
                  </View>
                  <Text
                    style={[
                      styles.roiBadge,
                      Number(item.roiPercent || 0) >= 0 ? styles.roiPositive : styles.roiNegative,
                    ]}
                  >
                    {Number(item.roiPercent || 0).toFixed(1)}% ROI
                  </Text>
                </View>
                <Text style={styles.activityMeta}>Date: {formatDate(item.harvestDate)}</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Quantity</Text>
                  <Text style={styles.detailValue}>{Number(item.quantity || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Weight</Text>
                  <Text style={styles.detailValue}>{Number(item.weightKg || 0).toLocaleString()} kg</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Revenue</Text>
                  <Text style={[styles.detailValue, styles.positiveText]}>
                    PKR {Number(item.revenue || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Fingerling</Text>
                  <Text style={styles.detailValue}>
                    PKR {Number(item.expenses?.fingerling || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Feed</Text>
                  <Text style={styles.detailValue}>
                    PKR {Number(item.expenses?.feed || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Fertilizer</Text>
                  <Text style={styles.detailValue}>
                    PKR {Number(item.expenses?.fertilizer || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Other</Text>
                  <Text style={styles.detailValue}>
                    PKR {Number(item.expenses?.other || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Total Expense</Text>
                  <Text style={[styles.detailValue, styles.negativeText]}>
                    PKR {Number(item.expenses?.total || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Profit / Loss</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      Number(item.profit || 0) >= 0 ? styles.positiveText : styles.negativeText,
                    ]}
                  >
                    PKR {Math.abs(Number(item.profit || 0)).toLocaleString()}
                  </Text>
                </View>
              </Card>
            ))
          )}
        </>
      )}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingBottom: 12 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  activeTab: { backgroundColor: "#111827" },
  tabText: { color: "#6B7280", fontWeight: "900" },
  activeTabText: { color: "#FFFFFF" },
  sectionTitle: { color: "#111827", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  timeframeRow: { gap: 8 },
  timeframeChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeTimeframeChip: { backgroundColor: "#2563EB" },
  timeframeText: { color: "#6B7280", fontWeight: "900", fontSize: 12 },
  activeTimeframeText: { color: "#FFFFFF" },
  pickerBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
    overflow: "hidden",
  },
  coordRow: { flexDirection: "row", gap: 8 },
  coordInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  statsGrid: { gap: 10, marginBottom: 10 },
  errorCard: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  errorText: { color: "#DC2626", fontWeight: "800", textAlign: "center", marginBottom: 12 },
  activityTop: { gap: 8, marginBottom: 8 },
  activityTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityTitle: { color: "#111827", fontSize: 16, fontWeight: "900", flex: 1 },
  activityDate: {
    alignSelf: "flex-start",
    color: "#111827",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "800",
  },
  activityDescription: { color: "#374151", lineHeight: 20 },
  activityMeta: { color: "#6B7280", marginTop: 6, fontWeight: "700" },
  requestTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  flexOne: { flex: 1 },
  roiBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
  },
  roiPositive: { color: "#166534", backgroundColor: "#DCFCE7" },
  roiNegative: { color: "#B91C1C", backgroundColor: "#FEE2E2" },
  detailRow: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  detailLabel: { color: "#6B7280", fontWeight: "700" },
  detailValue: { color: "#111827", fontWeight: "900" },
  positiveText: { color: "#059669" },
  negativeText: { color: "#DC2626" },
});
