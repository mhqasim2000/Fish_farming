import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Picker } from "@react-native-picker/picker";
import { ArrowLeft, Fish, Scale, TrendingUp } from "lucide-react-native";
import { Card, PrimaryButton } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const REVENUE_PER_KG = 300;

const groupAvailableBySpecies = rows => {
  const bySpecies = {};

  for (const row of rows || []) {
    const speciesId = row.SpeciesID ?? row.SpeciesId;
    if (!speciesId) continue;
    const key = String(speciesId);
    if (!bySpecies[key]) {
      bySpecies[key] = {
        ...row,
        SpeciesID: speciesId,
        SpeciesId: speciesId,
        Name: row.Name || row.SpeciesName || "Species",
        CurrentStock: 0,
        BatchCount: 0,
      };
    }
    bySpecies[key].CurrentStock += Number(row.CurrentStock ?? row.Quantity ?? 0);
    bySpecies[key].BatchCount += 1;
  }

  return Object.values(bySpecies).sort((a, b) =>
    String(a.Name || "").localeCompare(String(b.Name || "")),
  );
};

export default function HarvestFishScreen({ navigation, route }) {
  const pond = route?.params?.pond;
  const pondId = pond?.id ?? pond?.PondId;
  const initialSpeciesId = route?.params?.harvestSpeciesId;
  const initialQuantity = route?.params?.harvestQuantity;
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [speciesId, setSpeciesId] = useState(
    initialSpeciesId ? String(initialSpeciesId) : "",
  );
  const [quantity, setQuantity] = useState(
    initialQuantity ? String(initialQuantity) : "",
  );
  const [weightKg, setWeightKg] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAvailable = useCallback(async () => {
    if (!pondId) return;
    setLoading(true);
    try {
      const rows = await farmApi.getHarvestAvailable(pondId);
      setAvailable(groupAvailableBySpecies(Array.isArray(rows) ? rows : []));
    } catch (e) {
      setAvailable([]);
      Alert.alert("Harvest", e.message || "Could not load fish available to harvest.");
    } finally {
      setLoading(false);
    }
  }, [pondId]);

  useFocusEffect(
    useCallback(() => {
      loadAvailable();
    }, [loadAvailable]),
  );

  const selected = (available || []).find((r) => String(r.SpeciesID ?? r.SpeciesId) === String(speciesId));
  const maxQty = Number(selected?.CurrentStock ?? 0);
  const qtyNum = Math.floor(Number(quantity || 0));
  const weightNum = Number(weightKg || 0);
  const impliedRevenue = Number.isFinite(weightNum) && weightNum > 0 ? Math.round(weightNum * REVENUE_PER_KG) : 0;

  const submit = async () => {
    if (!pondId) {
      Alert.alert("Harvest", "Missing pond.");
      return;
    }
    if (!speciesId) {
      Alert.alert("Harvest", "Select a species to harvest.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      Alert.alert("Harvest", "Enter how many fish you harvested (whole number, greater than zero).");
      return;
    }
    if (qtyNum > maxQty) {
      Alert.alert("Harvest", `You only have ${maxQty.toLocaleString()} fish of this species in the pond.`);
      return;
    }
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      Alert.alert("Harvest", "Enter total harvest weight in kg (used for revenue on the Budget screen).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await farmApi.recordHarvest({
        pondId: Number(pondId),
        speciesId: Number(speciesId),
        quantity: qtyNum,
        weight: weightNum,
        note: note.trim() || `Harvest ${qtyNum} fish`,
      });
      const pkr = res?.estimatedRevenuePKR ?? impliedRevenue;
      Alert.alert(
        "Harvest recorded",
        `Stock was reduced by ${qtyNum.toLocaleString()} fish.\n\nEstimated sale value added to your budget totals: PKR ${Number(pkr).toLocaleString()} (PKR ${REVENUE_PER_KG}/kg × ${weightNum} kg).\n\nOpen Budget to see profit or loss versus all farm costs.`,
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert("Harvest", e.message || "Could not record harvest.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!pond || !pondId) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>No pond selected. Open Harvest from a pond card on the dashboard.</Text>
        <PrimaryButton title="Go back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#1D4ED8" />
        </TouchableOpacity>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle}>Record harvest</Text>
          <Text style={styles.topSubtitle}>{pond.pondName || pond.PondName}</Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Card style={styles.infoBanner}>
          <TrendingUp size={22} color="#059669" />
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>Profit and loss</Text>
            <Text style={styles.infoText}>
              You can harvest any stocked fish size when a customer asks for it. Targets only guide alerts; enter accurate landed
              weight so net profit and ROI stay meaningful.
            </Text>
          </View>
        </Card>

        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 24 }} />
        ) : available.length === 0 ? (
          <Card>
            <Fish size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No fish stock</Text>
            <Text style={styles.emptyText}>Add fish under Stock Management, then return here.</Text>
          </Card>
        ) : (
          <>
            <Text style={styles.label}>Species</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={speciesId} onValueChange={(v) => setSpeciesId(String(v || ""))} style={styles.picker}>
                <Picker.Item label="Select species" value="" />
                {available.map((row) => {
                  const sid = row.SpeciesID ?? row.SpeciesId;
                  const name = row.Name || "Species";
                  const stock = Number(row.CurrentStock ?? 0);
                  const batchSuffix =
                    Number(row.BatchCount || 0) > 1
                      ? ` across ${row.BatchCount} batches`
                      : "";
                  return (
                    <Picker.Item
                      key={String(sid)}
                      label={`${name} — ${stock.toLocaleString()} available${batchSuffix}`}
                      value={String(sid)}
                    />
                  );
                })}
              </Picker>
            </View>

            {!!selected && (
              <Card style={styles.stockCard}>
                <View style={styles.stockRow}>
                  <Scale size={18} color="#6B7280" />
                  <Text style={styles.stockTitle}>{selected.Name}</Text>
                </View>
                <Text style={styles.availableLine}>
                  Available at any size: <Text style={styles.availableStrong}>{maxQty.toLocaleString()} fish</Text>
                </Text>
                {Number(selected.BatchCount || 0) > 1 && (
                  <Text style={styles.availableHint}>
                    Combined from {selected.BatchCount} stocking batches. Harvest
                    will deduct oldest batches first.
                  </Text>
                )}
              </Card>
            )}

            <Text style={styles.label}>Number of fish harvested</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Total harvest weight (kg)</Text>
            <TextInput
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="e.g. 45.5"
              placeholderTextColor="#9CA3AF"
            />

            {impliedRevenue > 0 && (
              <Text style={styles.revenueHint}>
                Implied revenue for budget: PKR {impliedRevenue.toLocaleString()}
              </Text>
            )}

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              style={styles.input}
              placeholder="Buyer, grade, partial harvest…"
              placeholderTextColor="#9CA3AF"
            />

            <PrimaryButton title={submitting ? "Saving…" : "Record harvest"} onPress={submit} disabled={submitting} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
  },
  topSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  topSpacer: {
    width: 40,
  },
  body: {
    padding: 16,
    paddingBottom: 32,
  },
  infoBanner: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    marginBottom: 16,
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    fontWeight: "900",
    color: "#065F46",
    marginBottom: 4,
  },
  infoText: {
    color: "#047857",
    lineHeight: 20,
    fontSize: 13,
  },
  label: {
    color: "#374151",
    fontWeight: "900",
    marginBottom: 8,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  picker: {
    color: "#111827",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  revenueHint: {
    color: "#059669",
    fontWeight: "800",
    marginBottom: 16,
    fontSize: 14,
  },
  stockCard: {
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  stockTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  availableLine: {
    color: "#6B7280",
    fontSize: 14,
  },
  availableStrong: {
    color: "#111827",
    fontWeight: "900",
  },
  availableHint: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 17,
  },
  emptyTitle: {
    fontWeight: "900",
    color: "#111827",
    marginTop: 8,
  },
  emptyText: {
    color: "#6B7280",
    marginTop: 4,
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  fallbackText: {
    textAlign: "center",
    marginBottom: 16,
    color: "#6B7280",
  },
});
