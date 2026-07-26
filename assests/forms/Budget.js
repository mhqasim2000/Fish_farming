import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Calendar, DollarSign, Package } from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, StatCard } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

export default function BudgetExpensesScreen({ navigation, route }) {
  const initialPondId = String(
    route?.params?.initialPondId ??
    route?.params?.pond?.id ??
    route?.params?.pond?.PondId ??
    "",
  );
  const openedFromPondCard = route?.params?.source === "dashboard-card";
  const [stats, setStats] = useState({
    totalAllTime: 0,
    last30Days: 0,
    count30Days: 0,
    avgDaily: 0,
    highestCategory: "None",
    highestCategoryAmount: 0,
    categoryBreakdown: [],
    recentExpenses: [],
    totalRevenue: 0,
    netProfit: 0,
    status: "LOSS",
    roi: 0,
  });
  const [ponds, setPonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);

  const returnToDashboard = useCallback(() => {
    navigation.navigate("Dashboard");
  }, [navigation]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashboardData, pondData] = await Promise.all([farmApi.getBudgetDashboard(), farmApi.getPonds().catch(() => [])]);
      setStats((prev) => ({ ...prev, ...(dashboardData || {}) }));
      setPonds(pondData || []);
    } catch (error) {
      Alert.alert("Budget", error.message || "Failed to fetch budget dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (openedFromPondCard && route?.params?.action === "addExpense") {
      setShowAddExpense(true);
    }
  }, [openedFromPondCard, route?.params?.action, initialPondId]);

  useEffect(() => {
    if (!openedFromPondCard) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      returnToDashboard();
      return true;
    });
    return () => subscription.remove();
  }, [openedFromPondCard, returnToDashboard]);

  const handleAddExpense = async (expenseData) => {
    await farmApi.addExpense(expenseData);
    setShowAddExpense(false);
    await fetchDashboardData();
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  const handleCloseAddExpense = () => {
    setShowAddExpense(false);
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  return (
    <AppScaffold
      title="Budget & Expenses"
      subtitle="Track your farm costs and spending"
      navigation={navigation}
      currentRoute="BudgetE"
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          <PrimaryButton title="+ Add Expense" onPress={() => setShowAddExpense(true)} />
          <View style={styles.statsGrid}>
            <StatCard label="Total Expenses" value={`PKR ${Number(stats.totalAllTime || 0).toLocaleString()}`} />
            <StatCard label="Revenue" value={`PKR ${Number(stats.totalRevenue || stats.harvestRevenue || 0).toLocaleString()}`} accent="#059669" />
            <StatCard
              label={Number(stats.netProfit || stats.profit || 0) >= 0 ? "Profit" : "Loss"}
              value={`PKR ${Math.abs(Number(stats.netProfit || stats.profit || 0)).toLocaleString()}`}
              accent={Number(stats.netProfit || stats.profit || 0) >= 0 ? "#059669" : "#DC2626"}
            />
            <StatCard
              label="ROI"
              value={Number(stats.totalRevenue || stats.harvestRevenue || 0) > 0 ? `${Number(stats.roi || 0).toFixed(1)}%` : "No sales"}
              accent="#2563EB"
            />
            <StatCard label="Last 30 Days" value={`PKR ${Number(stats.last30Days || 0).toLocaleString()}`} accent="#059669" />
            <StatCard label="Avg Daily" value={`PKR ${Number(stats.avgDaily || 0).toLocaleString()}`} accent="#B45309" />
            <StatCard label="Highest Category" value={stats.highestCategory || "None"} accent="#7C3AED" />
          </View>

          <Card style={Number(stats.netProfit || stats.profit || 0) >= 0 ? styles.profitCard : styles.lossCard}>
            <Text style={styles.sectionTitle}>Profit & Loss</Text>
            <View style={styles.breakdownRow}>
              {Number(stats.totalRevenue || stats.harvestRevenue || 0) <= 0 && (
                <Text style={styles.emptyText}>ROI will calculate after fish are harvested/sold and revenue is recorded.</Text>
              )}
              <View style={styles.breakdownTop}>
                <Text style={styles.category}>Revenue from harvest</Text>
                <Text style={styles.amount}>PKR {Number(stats.totalRevenue || stats.harvestRevenue || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownTop}>
                <Text style={styles.category}>Total operating cost</Text>
                <Text style={styles.amount}>PKR {Number(stats.totalAllTime || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.breakdownTop}>
                <Text style={styles.category}>{Number(stats.netProfit || stats.profit || 0) >= 0 ? "Net profit" : "Net loss"}</Text>
                <Text style={styles.amount}>PKR {Math.abs(Number(stats.netProfit || stats.profit || 0)).toLocaleString()}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <View style={styles.headingRow}>
              <Package size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Expense Breakdown by Category</Text>
            </View>
            {(stats.categoryBreakdown || []).length === 0 ? (
              <Text style={styles.emptyText}>No category breakdown available.</Text>
            ) : (
              stats.categoryBreakdown.map((cat, idx) => (
                <View key={`${cat.category}-${idx}`} style={styles.breakdownRow}>
                  <View style={styles.breakdownTop}>
                    <Text style={styles.category}>{cat.category}</Text>
                    <Text style={styles.amount}>PKR {Number(cat.amount || 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(Number(cat.percentage || 0), 100)}%` }]} />
                  </View>
                  <Text style={styles.percentage}>{cat.percentage || 0}%</Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <View style={styles.headingRow}>
              <Calendar size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Recent Expenses</Text>
            </View>
            {(stats.recentExpenses || []).length === 0 ? (
              <EmptyState title="No recent expenses" text="Add expenses to start tracking farm spending." />
            ) : (
              stats.recentExpenses.map((expense) => (
                <View key={expense.ExpenseId || `${expense.Category}-${expense.Amount}`} style={styles.expenseRow}>
                  <View style={styles.expenseIcon}>
                    <DollarSign size={16} color="#2563EB" />
                  </View>
                  <View style={styles.expenseCopy}>
                    <Text style={styles.expenseCategory}>{expense.Category}</Text>
                    <Text style={styles.expenseMeta}>
                      {expense.PondName || "Farm"} | {expense.ExpenseDate ? new Date(expense.ExpenseDate).toLocaleDateString() : "Recent"}
                    </Text>
                    {!!expense.Description && <Text style={styles.expenseDesc}>{expense.Description}</Text>}
                  </View>
                  <Text style={styles.expenseAmount}>PKR {Number(expense.Amount || 0).toLocaleString()}</Text>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      <AddExpenseModal
        visible={showAddExpense}
        ponds={ponds}
        initialPondId={initialPondId}
        onClose={handleCloseAddExpense}
        onAdd={handleAddExpense}
      />
    </AppScaffold>
  );
}

function AddExpenseModal({ visible, ponds, initialPondId, onClose, onAdd }) {
  const [selectedPondId, setSelectedPondId] = useState("");
  const [category, setCategory] = useState("Feed");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && initialPondId) {
      setSelectedPondId(String(initialPondId));
    }
  }, [visible, initialPondId]);

  const lockedPond = initialPondId
    ? ponds.find((pond) => String(pond.PondId || pond.id) === String(initialPondId))
    : null;

  const submit = async () => {
    if (!selectedPondId) {
      Alert.alert("Expense", "Please select a pond for this expense.");
      return;
    }

    if (!amount) {
      Alert.alert("Expense", "Please enter an amount.");
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        pondId: selectedPondId,
        category,
        amount: Number(amount),
        description,
        expenseDate: new Date().toISOString().slice(0, 10),
      });
      setAmount("");
      setDescription("");
      setSelectedPondId(initialPondId ? String(initialPondId) : "");
    } catch (error) {
      Alert.alert("Expense", error.message || "Failed to add expense.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add Expense</Text>
          <Text style={styles.label}>Pond</Text>
          {initialPondId ? (
            <View style={styles.lockedPondBox}>
              <Text style={styles.lockedPondLabel}>Selected from pond card</Text>
              <Text style={styles.lockedPondName}>
                {lockedPond?.PondName || lockedPond?.pondName || "Selected pond"}
              </Text>
            </View>
          ) : (
            <View style={styles.pickerWrap}>
              <Picker selectedValue={selectedPondId} onValueChange={setSelectedPondId} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                <Picker.Item label="Select a pond" value="" />
                {ponds.map((pond) => {
                  const pondId = String(pond.PondId || pond.id || "");
                  return (
                    <Picker.Item
                      key={pondId}
                      label={pond.PondName || pond.pondName || "Pond"}
                      value={pondId}
                    />
                  );
                })}
              </Picker>
            </View>
          )}

          <Text style={styles.label}>Category</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
              <Picker.Item label="Feed" value="Feed" />
              <Picker.Item label="Fertilizer" value="Fertilizer" />
              <Picker.Item label="Fingerlings" value="Fingerlings" />
              <Picker.Item label="Labor" value="Labor" />
              <Picker.Item label="Maintenance" value="Maintenance" />
              <Picker.Item label="Other" value="Other" />
            </Picker>
          </View>

          <Text style={styles.label}>Amount</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.input} placeholder="PKR amount" />
          <Text style={styles.label}>Description</Text>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.textArea]} multiline />

          <PrimaryButton title={loading ? "Saving..." : "Save Expense"} onPress={submit} disabled={loading} />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 16,
  },
  breakdownRow: {
    marginBottom: 18,
  },
  breakdownTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  category: {
    color: "#111827",
    fontWeight: "900",
    textTransform: "capitalize",
  },
  amount: {
    color: "#111827",
    fontWeight: "900",
  },
  progressTrack: {
    height: 7,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: 7,
    backgroundColor: "#2563EB",
  },
  percentage: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingVertical: 12,
  },
  expenseIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  expenseCopy: {
    flex: 1,
    minWidth: 0,
  },
  expenseCategory: {
    color: "#111827",
    fontWeight: "900",
    textTransform: "capitalize",
  },
  expenseMeta: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 3,
  },
  expenseDesc: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 3,
  },
  expenseAmount: {
    color: "#111827",
    fontWeight: "900",
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 18,
    maxHeight: "92%",
  },
  modalTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 16,
  },
  label: {
    color: "#374151",
    fontWeight: "900",
    marginBottom: 7,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  picker: {
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  pickerItem: {
    color: "#111827",
  },
  lockedPondBox: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    padding: 12,
    marginBottom: 12,
  },
  lockedPondLabel: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 3,
  },
  lockedPondName: {
    color: "#111827",
    fontWeight: "900",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    color: "#111827",
    marginBottom: 12,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  closeButton: {
    padding: 15,
    alignItems: "center",
  },
  closeText: {
    color: "#6B7280",
    fontWeight: "900",
  },
  profitCard: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  lossCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
});
