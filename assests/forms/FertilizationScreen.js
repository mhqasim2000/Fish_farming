import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { FlaskConical } from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, StatCard } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

function formatApplicationDate(value) {
  if (value == null || value === "") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export default function FertilizationScreen({ navigation, route }) {
  const initialPondId = String(
    route?.params?.initialPondId ??
    route?.params?.pond?.id ??
    route?.params?.pond?.PondId ??
    "",
  );
  const initialPond = route?.params?.pond;
  const openedFromPondCard = route?.params?.source === "dashboard-card";
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [stats, setStats] = useState({ monthCost: 0, applications: 0, efficiency: 0 });
  const [inputs, setInputs] = useState({ size: "3", type: "Concrete", intensity: "Semi-Intensive" });
  const [result, setResult] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [options, setOptions] = useState({ pondTypes: [], cultivationTypes: [] });
  const [ponds, setPonds] = useState([]);
  const [fertilizerStock, setFertilizerStock] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const returnToDashboard = useCallback(() => {
    navigation.navigate("Dashboard");
  }, [navigation]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [dash, history, opts, pondData, stockData] = await Promise.all([
        farmApi.getFertilizerDashboard().catch(() => null),
        farmApi.getRecentFertilizations().catch(() => []),
        farmApi.getFertilizerOptions().catch(() => null),
        farmApi.getPonds().catch(() => []),
        farmApi.getFertilizerStock().catch(() => []),
      ]);
      if (dash) setStats(dash);
      setRecentLogs(history || []);
      setPonds(pondData || []);
      setFertilizerStock(stockData || []);
      if (opts) {
        setOptions(opts);
        setInputs((prev) => ({
          ...prev,
          type: opts.pondTypes?.[0] || prev.type,
          intensity: opts.cultivationTypes?.[0] || prev.intensity,
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (openedFromPondCard && route?.params?.action === "applyFertilizer") {
      setIsFormOpen(true);
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

  const handleCloseFertilizer = () => {
    setIsFormOpen(false);
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  const handleFertilizerSaved = () => {
    setIsFormOpen(false);
    fetchInitialData();
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  useEffect(() => {
    const selected =
      initialPond ||
      ponds.find(
        (pond) => String(pond.PondId || pond.id) === String(initialPondId),
      );
    if (!selected) return;

    setInputs((prev) => ({
      ...prev,
      size: String(selected.Size || selected.size || prev.size),
      type: selected.PondType || selected.pondType || prev.type,
      intensity:
        selected.CultivationType || selected.cultivationType || prev.intensity,
    }));
  }, [initialPond, initialPondId, ponds]);

  const calculate = async () => {
    setCalculating(true);
    try {
      const data = await farmApi.getFertilizerCalculation(inputs.size, inputs.type, inputs.intensity);
      setResult(data);
    } catch (error) {
      Alert.alert("Fertilization", error.message || "Calculation failed.");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <AppScaffold
      title="Fertilization Guide"
      subtitle="Get personalized fertilization recommendations for your pond"
      navigation={navigation}
      currentRoute="Fertilization"
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          <PrimaryButton title={isFormOpen ? "Close Details" : "+ Apply Fertilizer"} onPress={() => setIsFormOpen(!isFormOpen)} />
          <View style={styles.statsGrid}>
            <StatCard label="This Month" value={`PKR ${Number(stats.monthCost || 0).toLocaleString()}`} />
            <StatCard label="Applications" value={stats.applications || 0} accent="#059669" />
            <StatCard label="Estimated Cost" value={`PKR ${Number(result?.total_cost || 0).toLocaleString()}`} accent="#B45309" />
          </View>

          {isFormOpen && (
            <ApplyFertilizerForm
              ponds={ponds}
              stock={fertilizerStock}
              initialPondId={initialPondId}
              onClose={handleCloseFertilizer}
              onSaved={handleFertilizerSaved}
            />
          )}

          <Card>
            <Text style={styles.sectionTitle}>Calculate Fertilization Requirements</Text>
            <Text style={styles.sectionText}>Enter your pond details to get customized fertilization recommendations.</Text>

            <Text style={styles.label}>Pond Size (Acres)</Text>
            <TextInput
              value={inputs.size}
              onChangeText={(size) => setInputs((prev) => ({ ...prev, size }))}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.label}>Pond Type</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={inputs.type} onValueChange={(type) => setInputs((prev) => ({ ...prev, type }))} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                {(options.pondTypes?.length ? options.pondTypes : ["Concrete Pond", "Earthen Pond", "Lined Pond"]).map((type) => (
                  <Picker.Item key={type} label={type} value={type} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Cultivation Intensity</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={inputs.intensity} onValueChange={(intensity) => setInputs((prev) => ({ ...prev, intensity }))} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                {(options.cultivationTypes?.length ? options.cultivationTypes : ["Extensive", "Semi-Intensive", "Intensive"]).map((type) => (
                  <Picker.Item key={type} label={type} value={type} />
                ))}
              </Picker>
            </View>

            <PrimaryButton title={calculating ? "Generating..." : "Generate Fertilization Guide"} onPress={calculate} disabled={calculating} />
          </Card>

          {result && (
            <>
              <Card style={styles.resultBanner}>
                <Text style={styles.resultBannerText}>
                  Based on your inputs ({inputs.size} acres, {inputs.type}, {inputs.intensity}), here are your recommendations.
                </Text>
              </Card>
              <FertilizerResult title="Organic Fertilizer" data={result.organic} accent="#059669" />
              <FertilizerResult title="Inorganic Fertilizer" data={result.inorganic} accent="#2563EB" />
              <FertilizerResult title="Supplementary Fertilizer" data={result.supplementary} accent="#B45309" />
            </>
          )}

          <Text style={styles.recentTitle}>Recent Applications</Text>
          {recentLogs.length === 0 ? (
            <EmptyState title="No fertilization logs" text="Recent pond fertilization history will appear here." />
          ) : (
            recentLogs.slice(0, 8).map((log) => (
              <Card key={log.LogId || `${log.PondName}-${log.ApplicationDate}`}>
                <Text style={styles.logTitle}>{log.PondName || "Pond"}</Text>
                {!!formatApplicationDate(log.ApplicationDate) && (
                  <Text style={styles.logDate}>Applied {formatApplicationDate(log.ApplicationDate)}</Text>
                )}
                <Text style={styles.logMeta}>
                  {log.FertilizerType || log.Type} | {log.Quantity || log.QuantityKg || 0} kg | PKR {Number(log.Cost || 0).toLocaleString()}
                </Text>
              </Card>
            ))
          )}
        </>
      )}
    </AppScaffold>
  );
}

function FertilizerResult({ title, data, accent }) {
  if (!data) return null;

  return (
    <Card style={[styles.resultCard, { borderColor: accent }]}>
      <View style={styles.resultHeader}>
        <FlaskConical size={20} color={accent} />
        <Text style={[styles.resultTitle, { color: accent }]}>{title}</Text>
      </View>
      <Metric label="Recommended Product" value={data.product} />
      <Metric label="Quantity" value={`${data.quantity_kg || 0} kg`} />
      <Metric label="Cost" value={`PKR ${Number(data.cost_pkr || 0).toLocaleString()}`} />
      <Metric label="Frequency" value={data.instruction} />
      {!!data.benefits && <Text style={styles.benefits}>{data.benefits.split(";").map((item) => item.trim()).join("\n")}</Text>}
    </Card>
  );
}

function ApplyFertilizerForm({ ponds, stock, initialPondId, onSaved, onClose }) {
  const availableStock = (stock || []).filter((item) => Number(item.CurrentQuantity_kg || 0) > 0);
  const [formData, setFormData] = useState({ pondId: "", stockId: "", quantity: "" });
  const [submitting, setSubmitting] = useState(false);
  const selectedStock = availableStock.find((item) => String(item.StockId) === String(formData.stockId));
  const availableKg = Number(selectedStock?.CurrentQuantity_kg || 0);
  const unitCost = Number(selectedStock?.CostPerKg || 0);
  const totalCost = Number(formData.quantity || 0) * unitCost;
  const lockedPond = initialPondId
    ? ponds.find((pond) => String(pond.PondId || pond.id) === String(initialPondId))
    : null;

  useEffect(() => {
    if (initialPondId) {
      setFormData((prev) => ({ ...prev, pondId: String(initialPondId) }));
    }
  }, [initialPondId]);

  const submit = async () => {
    if (!formData.pondId || !selectedStock || Number(formData.quantity || 0) <= 0) {
      Alert.alert("Fertilization", "Please select pond, fertilizer stock, and quantity.");
      return;
    }

    if (Number(formData.quantity || 0) > availableKg) {
      Alert.alert("Fertilization", `Only ${availableKg.toFixed(2)} kg is available for this fertilizer.`);
      return;
    }

    setSubmitting(true);
    try {
      await farmApi.logFertilizer({
        pondId: Number(formData.pondId),
        fertilizerType: selectedStock.Category,
        productName: selectedStock.ProductName,
        quantity: Number(formData.quantity),
        remarks: `Applied ${selectedStock.ProductName || selectedStock.Category}`,
      });
      Alert.alert("Fertilization", "Fertilizer application saved.");
      setFormData({ pondId: initialPondId ? String(initialPondId) : "", stockId: "", quantity: "" });
      onSaved();
    } catch (error) {
      Alert.alert("Fertilization", error.message || "Could not save fertilizer application.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <Text style={styles.sectionTitle}>Apply Fertilizer to Pond</Text>
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
          <Picker selectedValue={formData.pondId} onValueChange={(pondId) => setFormData((prev) => ({ ...prev, pondId }))} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
            <Picker.Item label="Select pond" value="" />
            {(ponds || []).map((pond) => {
              const pondId = String(pond.PondId || pond.id || "");
              return (
                <Picker.Item key={pondId} label={pond.PondName || pond.pondName || "Pond"} value={pondId} />
              );
            })}
          </Picker>
        </View>
      )}

      <Text style={styles.label}>Fertilizer Stock</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={formData.stockId} onValueChange={(stockId) => setFormData((prev) => ({ ...prev, stockId }))} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
          <Picker.Item label="Select fertilizer" value="" />
          {availableStock.map((item) => (
            <Picker.Item
              key={item.StockId}
              label={`${item.ProductName || item.Category} (${item.Category}) - ${Number(item.CurrentQuantity_kg || 0).toFixed(1)} kg`}
              value={item.StockId}
            />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Quantity Applied (kg)</Text>
      <TextInput
        value={formData.quantity}
        onChangeText={(quantity) => setFormData((prev) => ({ ...prev, quantity }))}
        keyboardType="numeric"
        style={styles.input}
      />

      {!!selectedStock && (
        <Card style={styles.stockCard}>
          <Metric label="Available Stock" value={`${availableKg.toFixed(2)} kg`} />
          <Metric label="Estimated Cost" value={`PKR ${Number(totalCost || 0).toLocaleString()}`} />
        </Card>
      )}

      <PrimaryButton title={submitting ? "Saving..." : "Save Application"} onPress={submit} disabled={submitting} />
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value || "N/A"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionText: {
    color: "#6B7280",
    marginTop: 5,
    marginBottom: 18,
  },
  label: {
    color: "#374151",
    fontWeight: "900",
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 46,
    color: "#111827",
    marginBottom: 12,
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
  resultBanner: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  resultBannerText: {
    color: "#1D4ED8",
    fontWeight: "800",
    textAlign: "center",
  },
  resultCard: {
    borderWidth: 2,
  },
  stockCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    marginBottom: 12,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: "900",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  metricLabel: {
    color: "#6B7280",
  },
  metricValue: {
    color: "#111827",
    fontWeight: "900",
    flex: 1,
    textAlign: "right",
  },
  benefits: {
    color: "#4B5563",
    lineHeight: 20,
    marginTop: 12,
  },
  recentTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    marginVertical: 10,
  },
  logTitle: {
    color: "#111827",
    fontWeight: "900",
  },
  logDate: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 13,
    marginTop: 6,
  },
  logMeta: {
    color: "#6B7280",
    marginTop: 5,
  },
});
