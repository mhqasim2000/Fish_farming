import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Check, Lightbulb, Waves } from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, StatCard, Tag } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const normalizeSpeciesName = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const hasKnownSpeciesConflict = (firstName, secondName) => {
  const pair = [normalizeSpeciesName(firstName), normalizeSpeciesName(secondName)].sort().join("|");
  return pair === "rohu|tilapia";
};

export default function FarmPlannerScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [farmDetails, setFarmDetails] = useState(null);
  const [ponds, setPonds] = useState([]);
  const [areaUsage, setAreaUsage] = useState(null);
  const [regions, setRegions] = useState([]);
  const [setupTotalArea, setSetupTotalArea] = useState("");
  const [setupRegionId, setSetupRegionId] = useState("");
  const [settingUpFarm, setSettingUpFarm] = useState(false);
  const [pondStage, setPondStage] = useState("Grow-out");
  const [cultivationType, setCultivationType] = useState("Extensive");
  const [availableSpecies, setAvailableSpecies] = useState([]);
  const [selectedSpecies, setSelectedSpecies] = useState([]);
  const [compatibilityMap, setCompatibilityMap] = useState({});
  const [pondPlan, setPondPlan] = useState([]);
  const [pondSpecs, setPondSpecs] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [details, pondData, usageData, regionData] = await Promise.all([
        farmApi.getFarmDetails().catch(() => null),
        farmApi.getPonds().catch(() => []),
        farmApi.getAreaUsage().catch(() => null),
        farmApi.getRegions().catch(() => []),
      ]);

      setFarmDetails(details);
      setPonds(pondData || []);
      setAreaUsage(usageData?.data || usageData);
      setRegions(regionData || []);

      const region = details?.RegionName || "Punjab";
      const species = await farmApi.getRegionalSpecies(region).catch(() => farmApi.getApprovedSpecies().catch(() => []));
      setAvailableSpecies(species || []);
      const compMap = {};
      for (const sp of species || []) {
        try {
          const compData = await farmApi.getSpeciesCompatibility(sp.SpeciesId);
          compMap[sp.SpeciesId] = (compData || [])
            .map((item) =>
              item.MainSpeciesName === sp.Name
                ? species.find((s) => s.Name === item.CompatibleSpeciesName)?.SpeciesId
                : species.find((s) => s.Name === item.MainSpeciesName)?.SpeciesId,
            )
            .filter(Boolean);
        } catch {
          compMap[sp.SpeciesId] = [];
        }
      }
      setCompatibilityMap(compMap);
    } catch (err) {
      Alert.alert("Planner", err.message || "Failed to load planner data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalArea = areaUsage?.totalArea || farmDetails?.TotalAreaAcres || 0;
  const usedArea = areaUsage?.usedArea ?? ponds.reduce((sum, pond) => sum + Number(pond.Size || pond.size || 0), 0);
  const availableArea = areaUsage?.remainingArea ?? Math.max(0, Number(totalArea) - Number(usedArea));
  const hasFarm = Boolean(farmDetails?.FarmId);
  const totalFish = ponds.reduce(
    (sum, pond) => sum + (pond.species || []).reduce((inner, fish) => inner + Number(fish.Quantity || fish.quantity || 0), 0),
    0,
  );

  useEffect(() => {
    if (!hasFarm) {
      setPondSpecs(null);
      return;
    }

    if (selectedSpecies.length === 0) {
      setPondSpecs(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setCalculating(true);
      try {
        const result = await farmApi.calculatePondSpecs(pondPlan, totalArea, pondStage, cultivationType);
        if (result?.success) {
          setPondSpecs(result.data);
          setError("");
        } else {
          setPondSpecs(null);
          setError(result?.error || "Could not calculate pond dimensions.");
        }
      } catch (err) {
        setPondSpecs(null);
        setError(err.message || "Could not calculate pond dimensions.");
      } finally {
        setCalculating(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [hasFarm, pondPlan, selectedSpecies.length, pondStage, cultivationType, totalArea]);

  const handleFarmSetup = async () => {
    if (!setupTotalArea || Number(setupTotalArea) <= 0) {
      Alert.alert("Farm Setup", "Please enter a valid total farm area.");
      return;
    }

    if (!setupRegionId) {
      Alert.alert("Farm Setup", "Please select a region.");
      return;
    }

    setSettingUpFarm(true);
    try {
      await farmApi.setupFarm({
        totalArea: Number(setupTotalArea),
        regionId: Number(setupRegionId),
      });
      Alert.alert("Farm Setup", "Farm profile created successfully.");
      setSetupTotalArea("");
      setSetupRegionId("");
      fetchData();
    } catch (err) {
      Alert.alert("Farm Setup", err.message || "Failed to create farm profile.");
    } finally {
      setSettingUpFarm(false);
    }
  };

  const isSpeciesAllowed = (speciesId) => {
    if (selectedSpecies.length === 0) return true;
    if (selectedSpecies.length >= 3 && !selectedSpecies.some((item) => item.SpeciesId === speciesId)) return false;
    const candidate = availableSpecies.find((item) => item.SpeciesId === speciesId);
    if (candidate && selectedSpecies.some((item) => hasKnownSpeciesConflict(item.Name, candidate.Name))) {
      return false;
    }
    const mainSpecies = selectedSpecies[0];
    const allowedIds = compatibilityMap[mainSpecies.SpeciesId] || [];
    return mainSpecies.SpeciesId === speciesId || allowedIds.includes(speciesId);
  };

  const toggleSpecies = (species) => {
    const selected = selectedSpecies.some((item) => item.SpeciesId === species.SpeciesId);
    if (selected) {
      setSelectedSpecies((prev) => prev.filter((item) => item.SpeciesId !== species.SpeciesId));
      setPondPlan((prev) => prev.filter((item) => item.speciesId !== species.SpeciesId));
    } else if (selectedSpecies.length < 3) {
      if (!isSpeciesAllowed(species.SpeciesId)) {
        Alert.alert("Planner", `${species.Name} is not compatible with the selected polyculture mix.`);
        return;
      }
      setSelectedSpecies((prev) => [...prev, species]);
      setPondPlan((prev) => [...prev, { speciesId: species.SpeciesId, quantity: 1000 }]);
    }
  };

  const updateQuantity = (speciesId, quantity) => {
    setPondPlan((prev) => prev.map((item) => (item.speciesId === speciesId ? { ...item, quantity: Number(quantity || 0) } : item)));
  };

  const provisionPond = async () => {
    if (!pondSpecs) return;
    if (pondPlan.some((item) => Number(item.quantity || 0) <= 0)) {
      Alert.alert("Planner", "Please enter a valid quantity for each selected species.");
      return;
    }
    setProvisioning(true);
    setError("");
    try {
      const result = await farmApi.provisionPond({ pondPlan, pondSpecs: { ...pondSpecs, cultivationType } });
      if (result?.success || result?.pondId) {
        navigation.navigate("Dashboard");
      } else {
        setError(result?.error || "Provisioning failed.");
      }
    } catch (err) {
      setError(err.message || "Failed to provision new pond.");
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <AppScaffold
      title="Farm Planner"
      subtitle="Design and provision an optimal pond"
      navigation={navigation}
      currentRoute="FarmPlanner"
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard label="Total Ponds" value={ponds.length} />
            <StatCard label="Total Area" value={`${Number(totalArea || 0).toFixed(1)} acres`} accent="#059669" />
            <StatCard label="Used Area" value={`${Number(usedArea || 0).toFixed(1)} acres`} accent="#2563EB" />
            <StatCard label="Available Area" value={`${Number(availableArea || 0).toFixed(1)} acres`} accent="#B45309" />
          </View>

          {!!error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          {!hasFarm && (
            <Card>
              <View style={styles.headingRow}>
                <Lightbulb size={20} color="#6B7280" />
                <Text style={styles.sectionTitle}>Set Up Your Farm First</Text>
              </View>
              <Text style={styles.specText}>
                New accounts need a farm profile before ponds, stocking, and dashboard data can work correctly.
              </Text>
              <Text style={styles.label}>Total Farm Area (acres)</Text>
              <TextInput
                value={setupTotalArea}
                onChangeText={setSetupTotalArea}
                keyboardType="numeric"
                style={styles.quantityInput}
                placeholder="e.g. 5"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.label}>Region</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={setupRegionId} onValueChange={setSetupRegionId} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                  <Picker.Item label="Select region" value="" />
                  {regions.map((region) => (
                    <Picker.Item
                      key={region.RegionId}
                      label={region.RegionName || region.Name || region.Province || "Region"}
                      value={String(region.RegionId)}
                    />
                  ))}
                </Picker>
              </View>
              <PrimaryButton title={settingUpFarm ? "Creating Farm..." : "Create Farm Profile"} onPress={handleFarmSetup} disabled={settingUpFarm} />
            </Card>
          )}

          {hasFarm && (
            <>
          <Card>
            <View style={styles.headingRow}>
              <Lightbulb size={20} color="#6B7280" />
              <Text style={styles.sectionTitle}>Polyculture Designer</Text>
            </View>
            <Text style={styles.label}>Pond Stage</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={pondStage} onValueChange={setPondStage} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                <Picker.Item label="Grow-out Pond" value="Grow-out" />
                <Picker.Item label="Nursery Pond" value="Nursery" />
              </Picker>
            </View>

            <Text style={styles.label}>Cultivation Type</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={cultivationType} onValueChange={setCultivationType} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
                <Picker.Item label="Extensive" value="Extensive" />
                <Picker.Item label="Semi-Intensive" value="Semi-Intensive" />
                <Picker.Item label="Intensive" value="Intensive" />
              </Picker>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Select Species (Max 3)</Text>
          {availableSpecies.length === 0 ? (
            <EmptyState title="No species available" text="Add or approve species to use the planner." />
          ) : (
            availableSpecies.map((species) => {
              const selected = selectedSpecies.some((item) => item.SpeciesId === species.SpeciesId);
              const allowed = isSpeciesAllowed(species.SpeciesId);
              return (
                <TouchableOpacity
                  key={species.SpeciesId}
                  style={[
                    styles.speciesOption,
                    selected && styles.selectedSpecies,
                    !allowed && styles.disabledSpecies,
                  ]}
                  onPress={() => allowed && toggleSpecies(species)}
                  disabled={!allowed}
                >
                  <View style={[styles.checkBox, selected && styles.checkBoxActive]}>
                    {selected && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <View style={styles.speciesCopy}>
                    <Text style={styles.speciesName}>{species.Name}</Text>
                    <Text style={styles.speciesMeta}>
                      {species.FeedingZone || "Mixed Zone"}
                      {!allowed ? " | Not compatible with selected species" : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {selectedSpecies.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Target Quantities</Text>
              {selectedSpecies.map((species) => {
                const plan = pondPlan.find((item) => item.speciesId === species.SpeciesId);
                return (
                  <View key={species.SpeciesId} style={styles.quantityRow}>
                    <Text style={styles.quantityName}>{species.Name}</Text>
                    <TextInput
                      value={String(plan?.quantity || "")}
                      onChangeText={(value) => updateQuantity(species.SpeciesId, value)}
                      keyboardType="numeric"
                      style={styles.quantityInput}
                    />
                  </View>
                );
              })}

              <Card style={styles.specsCard}>
                <View style={styles.headingRow}>
                  <Waves size={20} color="#2563EB" />
                  <Text style={styles.specTitle}>{calculating ? "Calculating..." : "Calculated Dimensions"}</Text>
                </View>
                {pondSpecs ? (
                  <>
                    <Metric label="Required Area" value={`${pondSpecs.targetArea} acres`} />
                    <Metric label="Depth" value={`${pondSpecs.recommendedDepthFeet} ft`} />
                    <Metric label="Length" value={`${pondSpecs.recommendedLengthFeet} ft`} />
                    <Metric label="Width" value={`${pondSpecs.recommendedWidthFeet} ft`} />
                    {Number(pondSpecs.targetArea || 0) > Number(availableArea || 0) && (
                      <Text style={styles.warning}>This plan exceeds your available farm area.</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.specText}>Select species and quantities to see recommendations.</Text>
                )}
              </Card>

              <PrimaryButton
                title={provisioning ? "Provisioning..." : "Provision & Stock New Pond"}
                onPress={provisionPond}
                disabled={provisioning || !pondSpecs || Number(pondSpecs.targetArea || 0) > Number(availableArea || 0)}
              />
            </Card>
          )}

          <Card>
            <Text style={styles.sectionTitle}>Current Farm Snapshot</Text>
            <Metric label="Total fish stocked" value={Number(totalFish || 0).toLocaleString()} />
            <Metric label="Region" value={farmDetails?.RegionName || "Not set"} />
            <Tag>{cultivationType}</Tag>
          </Card>
            </>
          )}
        </>
      )}
    </AppScaffold>
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
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
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
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  errorText: {
    color: "#DC2626",
    fontWeight: "800",
    lineHeight: 20,
  },
  speciesOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  selectedSpecies: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  disabledSpecies: {
    borderColor: "#F3F4F6",
    backgroundColor: "#F9FAFB",
    opacity: 0.55,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkBoxActive: {
    borderColor: "#2563EB",
    backgroundColor: "#2563EB",
  },
  speciesCopy: {
    flex: 1,
  },
  speciesName: {
    color: "#111827",
    fontWeight: "900",
  },
  speciesMeta: {
    color: "#6B7280",
    marginTop: 3,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  quantityName: {
    color: "#111827",
    fontWeight: "900",
    flex: 1,
  },
  quantityInput: {
    width: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 44,
    textAlign: "right",
    color: "#111827",
  },
  specsCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  specTitle: {
    color: "#1D4ED8",
    fontWeight: "900",
  },
  specText: {
    color: "#1D4ED8",
  },
  warning: {
    color: "#DC2626",
    fontWeight: "900",
    marginTop: 8,
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
});
