import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { BookOpen, Fish } from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, StatCard, Tag } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

export default function FeedingGuideScreen({ navigation, route }) {
  const initialPondId = String(
    route?.params?.initialPondId ??
    route?.params?.pond?.id ??
    route?.params?.pond?.PondId ??
    "",
  );
  const openedFromPondCard = route?.params?.source === "dashboard-card";
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [stats, setStats] = useState({ fedTodayKg: 0, costToday: 0, pondsFedCount: 0, activePonds: 0 });
  const [rulesAll, setRulesAll] = useState([]);
  const [ponds, setPonds] = useState([]);
  const [feedTypes, setFeedTypes] = useState(["Floating Pellets", "Sinking Pellets", "Powder Feed", "Live Feed"]);
  const [feedStock, setFeedStock] = useState([]);
  const [recentFeedLogs, setRecentFeedLogs] = useState([]);

  const returnToDashboard = useCallback(() => {
    navigation.navigate("Dashboard");
  }, [navigation]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashStats, rules, pondData, typesDb, feedStockData] = await Promise.all([
        farmApi.getFeedDashboard().catch(() => ({ fedTodayKg: 0, costToday: 0, pondsFedCount: 0, activePonds: 0 })),
        farmApi.getFeedRulesAll().catch(() => []),
        farmApi.getPonds().catch(() => []),
        farmApi.getFeedTypes().catch(() => []),
        farmApi.getFeedStock().catch(() => []),
      ]);
      setStats(dashStats || {});
      setRulesAll(rules || []);
      setPonds(pondData || []);
      if (typesDb?.length) setFeedTypes(typesDb);
      setFeedStock(feedStockData || []);
      const histories = await Promise.all(
        (pondData || []).map(async (pond) => {
          const pondId = pond.PondId || pond.id;
          const rows = await farmApi.getFeedHistory(pondId).catch(() => []);
          return (rows || []).map((row) => ({
            ...row,
            PondName: row.PondName || pond.PondName || pond.pondName || "Pond",
          }));
        }),
      );
      setRecentFeedLogs(
        histories
          .flat()
          .sort((a, b) => new Date(b.FeedDate || 0).getTime() - new Date(a.FeedDate || 0).getTime())
          .slice(0, 8),
      );
    } catch (error) {
      Alert.alert("Feeding", error.message || "Failed to load feeding data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (openedFromPondCard && route?.params?.action === "addFeed") {
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

  const handleCloseFeeding = () => {
    setIsFormOpen(false);
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  const handleFeedSaved = () => {
    setIsFormOpen(false);
    fetchData();
    if (openedFromPondCard) {
      returnToDashboard();
    }
  };

  return (
    <AppScaffold
      title="Feeding Management"
      subtitle="Track feeding schedules and manage fish nutrition"
      navigation={navigation}
      currentRoute="FeedGuide"
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          <PrimaryButton title={isFormOpen ? "Close Details" : "+ Add Feeding"} onPress={() => setIsFormOpen(!isFormOpen)} />
          <View style={styles.statsGrid}>
            <StatCard label="Fed Today" value={`${Number(stats.fedTodayKg || 0).toFixed(1)} kg`} />
            <StatCard label="Ponds Fed" value={`${stats.pondsFedCount || 0}/${stats.activePonds || 0}`} accent="#059669" />
            <StatCard label="Cost Today" value={`PKR ${Number(stats.costToday || 0).toLocaleString()}`} accent="#B45309" />
            <StatCard label="Active Ponds" value={stats.activePonds || 0} accent="#7C3AED" />
          </View>

          {isFormOpen && (
            <FeedingForm
              ponds={ponds}
              feedTypes={feedTypes}
              feedStock={feedStock}
              initialPondId={initialPondId}
              onSaved={handleFeedSaved}
              onClose={handleCloseFeeding}
            />
          )}

          <Card>
            <View style={styles.headingRow}>
              <Fish size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Pond Feeding Status</Text>
            </View>
            {Number(stats.pondsFedCount || 0) === 0 ? (
              <EmptyState title="No ponds fed today" text="Record a feeding session to update today's status." />
            ) : (
              <Text style={styles.statusText}>
                Successfully fed {stats.pondsFedCount} ponds today. {(stats.activePonds || 0) - (stats.pondsFedCount || 0)} remaining.
              </Text>
            )}
          </Card>

          <Card>
            <View style={styles.headingRow}>
              <Fish size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Recent Feeding Records</Text>
            </View>
            {recentFeedLogs.length === 0 ? (
              <EmptyState title="No feeding records" text="Saved feeding sessions will appear here by pond." />
            ) : (
              recentFeedLogs.map((log) => (
                <View key={log.LogId || `${log.PondName}-${log.FeedDate}`} style={styles.feedLogRow}>
                  <View style={styles.feedLogCopy}>
                    <Text style={styles.feedLogTitle}>{log.PondName || "Pond"}</Text>
                    <Text style={styles.feedLogMeta}>
                      {log.SpeciesName || "Fish"} | {log.FeedTypeUsed || log.feedType || "Feed"} | {Number(log.Quantity_kg || 0).toFixed(2)} kg
                    </Text>
                  </View>
                  <Text style={styles.feedLogCost}>PKR {Number(log.TotalCost || 0).toLocaleString()}</Text>
                </View>
              ))
            )}
          </Card>

          <View style={styles.headingRow}>
            <BookOpen size={22} color="#B45309" />
            <View>
              <Text style={styles.bigTitle}>Species Feeding Habits</Text>
              <Text style={styles.subText}>Nutritional requirements stored in your database</Text>
            </View>
          </View>

          {rulesAll.length === 0 ? (
            <EmptyState title="No feeding rules" text="Feeding rules will appear once species data is configured." />
          ) : (
            rulesAll.map((species) => (
              <Card key={species.SpeciesId || species.Name}>
                <View style={styles.speciesHeader}>
                  <View style={styles.speciesCopy}>
                    <Text style={styles.cardTitle}>{species.Name}</Text>
                    <Tag>{species.Rules?.length || 0} Registered Stages</Tag>
                  </View>
                  <View style={styles.thumb}>
                    {species.ImageUrl ? <Image source={{ uri: species.ImageUrl }} style={styles.thumbImage} /> : <Fish size={26} color="#BFDBFE" />}
                  </View>
                </View>
                {(species.Rules || []).length === 0 ? (
                  <Text style={styles.emptyText}>No feeding rules defined.</Text>
                ) : (
                  species.Rules.map((rule) => (
                    <View key={rule.RuleId || rule.Stage} style={styles.ruleBlock}>
                      <View style={styles.ruleTop}>
                        <Text style={styles.ruleStage}>{rule.Stage}</Text>
                        <Tag color="#ECFDF5" textColor="#047857">
                          {rule.Rate}% Body Wt
                        </Tag>
                      </View>
                      <Metric label="Size Range" value={`${rule.MinSize}" - ${rule.MaxSize}"`} />
                      <Metric label="Frequency" value={rule.Frequency} />
                      <Metric label="Feed Type" value={rule.FeedType} />
                    </View>
                  ))
                )}
              </Card>
            ))
          )}

          <Card style={styles.practiceCard}>
            <Text style={styles.practiceTitle}>Best Feeding Practices</Text>
            <Text style={styles.practiceText}>Feed at consistent times daily, usually morning and evening.</Text>
            <Text style={styles.practiceText}>Adjust the amount based on fish appetite and weather.</Text>
            <Text style={styles.practiceText}>Reduce feeding during cold weather or low oxygen levels.</Text>
            <Text style={styles.practiceText}>Remove uneaten feed after 30 minutes to maintain water quality.</Text>
          </Card>
        </>
      )}
    </AppScaffold>
  );
}

function FeedingForm({ ponds, feedTypes, feedStock, initialPondId, onSaved, onClose }) {
  const [formData, setFormData] = useState({ pondId: "", feedType: "", quantity: "", cost: "" });
  const [recommendations, setRecommendations] = useState([]);
  const [activeSpeciesId, setActiveSpeciesId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalizeFeedName = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[%()[\]-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const selectedFeedName = normalizeFeedName(formData.feedType);
  const feedBatches = (feedStock || []).filter((item) => {
    const stockName = normalizeFeedName(item.FeedType);
    return (
      Number(item.CurrentQuantity_kg || 0) > 0 &&
      (stockName === selectedFeedName || stockName.includes(selectedFeedName) || selectedFeedName.includes(stockName))
    );
  });
  const availableStockKg = feedBatches.reduce((sum, item) => sum + Number(item.CurrentQuantity_kg || 0), 0);
  const weightedUnitCost =
    availableStockKg > 0
      ? feedBatches.reduce((sum, item) => sum + Number(item.CurrentQuantity_kg || 0) * Number(item.CostPerKg || 0), 0) / availableStockKg
      : 0;
  const lockedPond = initialPondId
    ? ponds.find((pond) => String(pond.PondId || pond.id) === String(initialPondId))
    : null;

  useEffect(() => {
    if (!formData.feedType || !formData.quantity) {
      setFormData((prev) => ({ ...prev, cost: "" }));
      return;
    }

    const qty = Number(formData.quantity || 0);
    const totalCost = qty > 0 ? qty * weightedUnitCost : 0;
    setFormData((prev) => ({ ...prev, cost: totalCost ? totalCost.toFixed(2) : "" }));
  }, [formData.feedType, formData.quantity, weightedUnitCost]);

  const handlePondChange = useCallback(async (pondId) => {
    setFormData((prev) => ({ ...prev, pondId, feedType: "", quantity: "" }));
    setRecommendations([]);
    setActiveSpeciesId("");

    try {
      const data = await farmApi.getFeedRecommendation(pondId);
      const recs = data?.recommendations || [];
      setRecommendations(recs);
      if (recs[0]?.recommendation) {
        setActiveSpeciesId(`${recs[0].speciesId}-0`);
        setFormData((prev) => ({
          ...prev,
          feedType: recs[0].recommendation.feedType,
          quantity: String(recs[0].recommendation.dailyQty_kg || ""),
        }));
      }
    } catch {
      setRecommendations([]);
    }
  }, []);

  useEffect(() => {
    if (initialPondId && ponds.length > 0) {
      handlePondChange(String(initialPondId));
    }
  }, [initialPondId, ponds.length, handlePondChange]);

  const handleSpeciesChange = (value) => {
    setActiveSpeciesId(value);
    const idx = Number(value.split("-")[1]);
    const rec = recommendations[idx];
    if (rec?.recommendation) {
      setFormData((prev) => ({
        ...prev,
        feedType: rec.recommendation.feedType,
        quantity: String(rec.recommendation.dailyQty_kg || ""),
      }));
    }
  };

  const submit = async () => {
    if (!formData.pondId || !formData.feedType || Number(formData.quantity || 0) <= 0) {
      Alert.alert("Feeding", "Please select pond, feed type, and enter a valid quantity.");
      return;
    }

    const quantity = Number(formData.quantity || 0);
    if (quantity > availableStockKg) {
      const availableTypes = (feedStock || [])
        .filter((item) => Number(item.CurrentQuantity_kg || 0) > 0)
        .map((item) => item.FeedType)
        .filter(Boolean)
        .join(", ");
      Alert.alert(
        "Feeding",
        availableStockKg > 0
          ? `Only ${availableStockKg.toFixed(2)} kg is available for this feed type.`
          : `No stock is available for "${formData.feedType}". Add this feed in Stock Management or choose an available stock type${availableTypes ? `: ${availableTypes}` : "."}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const speciesId = activeSpeciesId ? activeSpeciesId.split("-")[0] : 0;
      await farmApi.logFeed({
        pondId: formData.pondId,
        speciesId,
        feedType: formData.feedType,
        quantity,
        cost: Number(formData.cost || 0),
      });

      let remaining = quantity;
      for (const batch of feedBatches) {
        if (remaining <= 0) break;
        const currentQty = Number(batch.CurrentQuantity_kg || 0);
        const deduction = Math.min(currentQty, remaining);
        const newQty = currentQty - deduction;
        const stockId = batch.StockId || batch.FeedStockId || batch.Id;
        if (stockId) {
          await farmApi.updateFeedStock(stockId, {
            currentQuantity_kg: Number(newQty.toFixed(3)),
          });
        }
        remaining -= deduction;
      }

      Alert.alert("Feeding", "Feeding logged successfully.");
      setFormData({ pondId: initialPondId ? String(initialPondId) : "", feedType: "", quantity: "", cost: "" });
      onSaved();
    } catch (error) {
      Alert.alert("Feeding", error.message || "Failed to log feeding session.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeRec = activeSpeciesId ? recommendations[Number(activeSpeciesId.split("-")[1])] : null;

  return (
    <Card>
      <Text style={styles.sectionTitle}>Record Feeding</Text>
      <Text style={styles.label}>Select Pond</Text>
      {initialPondId ? (
        <View style={styles.lockedPondBox}>
          <Text style={styles.lockedPondLabel}>Selected from pond card</Text>
          <Text style={styles.lockedPondName}>
            {lockedPond?.PondName || lockedPond?.pondName || "Selected pond"}
          </Text>
        </View>
      ) : (
        <View style={styles.pickerWrap}>
          <Picker selectedValue={formData.pondId} onValueChange={handlePondChange} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
            <Picker.Item label="Choose a pond" value="" />
            {ponds.map((pond) => {
              const pondId = String(pond.PondId || pond.id || "");
              return (
                <Picker.Item
                  key={pondId}
                  label={`${pond.PondName || pond.pondName || "Pond"} (${pond.PondType || pond.pondType || "Pond"})`}
                  value={pondId}
                />
              );
            })}
          </Picker>
        </View>
      )}

      {recommendations.length > 0 && (
        <>
          <Text style={styles.label}>Select Species to Feed</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={activeSpeciesId} onValueChange={handleSpeciesChange} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
              {recommendations.map((rec, idx) => (
                <Picker.Item key={`${rec.speciesId}-${idx}`} label={`${rec.speciesName} (${rec.currentSize})`} value={`${rec.speciesId}-${idx}`} />
              ))}
            </Picker>
          </View>
        </>
      )}

      {activeRec?.recommendation && (
        <Card style={styles.recommendationCard}>
          <Text style={styles.recommendationTitle}>Recommendation: {activeRec.speciesName}</Text>
          <Metric label="Optimal Feed" value={activeRec.recommendation.feedType} />
          <Metric label="Daily Qty" value={`${activeRec.recommendation.dailyQty_kg} kg`} />
          <Metric label="Frequency" value={activeRec.recommendation.frequency} />
          <Metric label="Biomass" value={`${activeRec.totalBiomass_kg} kg`} />
        </Card>
      )}

      <Text style={styles.label}>Feed Type</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={formData.feedType} onValueChange={(v) => setFormData((prev) => ({ ...prev, feedType: v }))} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
          <Picker.Item label="Choose feed type" value="" />
          {feedTypes.map((feedType) => (
            <Picker.Item key={feedType} label={feedType} value={feedType} />
          ))}
        </Picker>
      </View>
      <Text style={styles.label}>Quantity Used (kg)</Text>
      <TextInput
        value={formData.quantity}
        onChangeText={(v) => setFormData((prev) => ({ ...prev, quantity: v }))}
        keyboardType="numeric"
        style={styles.input}
      />
      {!!formData.feedType && (
        <Card style={styles.stockCard}>
          <Metric label="Available Stock" value={`${availableStockKg.toFixed(2)} kg`} />
          <Metric label="Unit Cost (Weighted Avg)" value={`PKR ${weightedUnitCost.toFixed(2)} / kg`} />
        </Card>
      )}
      <Text style={styles.label}>Total Cost (PKR)</Text>
      <TextInput value={formData.cost} editable={false} style={[styles.input, styles.readOnlyInput]} />
      <PrimaryButton title={submitting ? "Saving..." : "Save Record"} onPress={submit} disabled={submitting} />
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
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
    gap: 10,
    marginVertical: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 10,
  },
  statusText: {
    color: "#111827",
    fontWeight: "800",
    lineHeight: 21,
  },
  feedLogRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingVertical: 11,
    gap: 10,
  },
  feedLogCopy: {
    flex: 1,
    minWidth: 0,
  },
  feedLogTitle: {
    color: "#111827",
    fontWeight: "900",
  },
  feedLogMeta: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 3,
  },
  feedLogCost: {
    color: "#111827",
    fontWeight: "900",
  },
  bigTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "900",
  },
  subText: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  speciesHeader: {
    flexDirection: "row",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 14,
    marginBottom: 12,
  },
  speciesCopy: {
    flex: 1,
    gap: 8,
  },
  cardTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "900",
  },
  thumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  emptyText: {
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 14,
  },
  ruleBlock: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
    marginTop: 8,
  },
  ruleTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ruleStage: {
    color: "#111827",
    fontWeight: "900",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    gap: 10,
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
  practiceCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  practiceTitle: {
    color: "#1D4ED8",
    fontWeight: "900",
    marginBottom: 8,
  },
  practiceText: {
    color: "#1D4ED8",
    marginBottom: 5,
  },
  label: {
    color: "#374151",
    fontWeight: "900",
    marginBottom: 7,
  },
  pickerWrap: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
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
  recommendationCard: {
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  recommendationTitle: {
    color: "#1D4ED8",
    fontWeight: "900",
    marginBottom: 8,
  },
  stockCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    marginBottom: 12,
  },
  readOnlyInput: {
    backgroundColor: "#F9FAFB",
    color: "#374151",
  },
});
