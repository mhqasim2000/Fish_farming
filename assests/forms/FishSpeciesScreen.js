import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Calendar, Fish, ShieldCheck, TrendingUp } from "lucide-react-native";
import { AppScaffold, Card, EmptyState, PrimaryButton, Tag } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const tabs = [
  { id: "fish-species", label: "Fish Species" },
  { id: "regional-guide", label: "Regional Guide" },
  { id: "polyculture", label: "Polyculture" },
  { id: "growth-timeline", label: "Growth Timeline" },
];

export default function FishSpeciesScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("fish-species");
  const [species, setSpecies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [polycultureMixes, setPolycultureMixes] = useState([]);
  const [feedingGuidelines, setFeedingGuidelines] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [speciesData, regionsData, polyData, feedData] = await Promise.all([
        farmApi.getApprovedSpecies(),
        farmApi.getRegions().catch(() => []),
        farmApi.getPolycultureMixes().catch(() => []),
        farmApi.getGenericFeedingGuidelines().catch(() => []),
      ]);
      setSpecies(speciesData || []);
      setRegions(regionsData || []);
      setPolycultureMixes(polyData || []);
      setFeedingGuidelines(feedData || []);
      setSelectedRegion(regionsData?.find((r) => r.Name === "Punjab") || regionsData?.[0] || null);
    } catch (err) {
      Alert.alert("Fish Species", err.message || "Failed to load species data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const submitSpecies = async (data) => {
    await farmApi.addCustomSpecies(data);
    Alert.alert("Submitted", "Species submitted successfully. It will be visible after admin approval.");
    setShowAdd(false);
    fetchData();
  };

  return (
    <AppScaffold
      title="Fish Species"
      subtitle="Species, regional advice, polyculture mixes, and growth timelines"
      navigation={navigation}
      currentRoute="FishSpecies"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <PrimaryButton title="+ Submit New Species" onPress={() => setShowAdd(true)} style={styles.addButton} />

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          {activeTab === "fish-species" && <SpeciesGrid species={species} />}
          {activeTab === "regional-guide" && (
            <RegionalGuide regions={regions} selectedRegion={selectedRegion} onSelect={setSelectedRegion} />
          )}
          {activeTab === "polyculture" && <Polyculture mixes={polycultureMixes} />}
          {activeTab === "growth-timeline" && <GrowthTimeline species={species} guidelines={feedingGuidelines} />}
        </>
      )}

      <AddSpeciesModal visible={showAdd} onClose={() => setShowAdd(false)} onSubmit={submitSpecies} />
    </AppScaffold>
  );
}

function SpeciesGrid({ species }) {
  if (!species.length) {
    return <EmptyState title="No approved species found" text="Submitted species will appear after admin approval." />;
  }

  return species.map((item) => (
    <Card key={item.SpeciesId || item.Name}>
      <View style={styles.imageWrap}>
        {item.ImageUrl ? (
          <Image source={{ uri: item.ImageUrl }} style={styles.speciesImage} />
        ) : (
          <Fish size={48} color="#BFDBFE" />
        )}
      </View>
      <Text style={styles.cardTitle}>{item.Name}</Text>
      <View style={styles.regionWrap}>
        {(item.CompatibleRegions || "Punjab").split(",").map((region, idx) => (
          <Tag key={`${region}-${idx}`} color="#F3F4F6" textColor="#4B5563">
            {region.trim()}
          </Tag>
        ))}
      </View>

      <Metric label="Temperature" value={`${item.MinTemp}-${item.MaxTemp} C`} />
      <Metric label="pH Range" value={`${item.MinPH}-${item.MaxPH}`} />
      <Metric label="Dissolved O2" value={`${item.MinDO}+ mg/L`} />
      <Metric label="Fingerling Size" value={`${item.FingerlingSizeG}g`} />
      <Metric label="Market Size" value={`${item.MarketSizeKG} kg`} />
      <Metric label="Harvest Time" value={`${item.HarvestTimeMonths} months`} />
      <Metric label="Stocking/Acre" value={Number(item.MaxStockingDensity || 0).toLocaleString()} />
      <Metric label="Survival Rate" value={`${item.SurvivalRateLower}-${item.SurvivalRateUpper}%`} />
      <Metric
        label="Market Price"
        value={`PKR ${Number(item.MinMarketPrice || 0).toLocaleString()}-${Number(item.MaxMarketPrice || 0).toLocaleString()}/kg`}
        highlight
      />
      {!!item.Description && <Text style={styles.notes}>{item.Description}</Text>}
    </Card>
  ));
}

function RegionalGuide({ regions, selectedRegion, onSelect }) {
  if (!regions.length) {
    return <EmptyState title="No regional data" text="Regional farming data is not available yet." />;
  }

  const info = {
    climate: selectedRegion?.climate || selectedRegion?.Climate || "Check back soon for more data on this region.",
    pondSize: selectedRegion?.pondSize || selectedRegion?.PondSize || "To be confirmed",
    water: selectedRegion?.water || selectedRegion?.Water || "To be confirmed",
    challenges: selectedRegion?.challenges || selectedRegion?.Challenges || "To be confirmed",
    season: selectedRegion?.season || selectedRegion?.Season || "To be confirmed",
    tips: selectedRegion?.tips || selectedRegion?.Tips || "Consult with a local expert.",
  };

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionTabs}>
        {regions.map((region) => (
          <TouchableOpacity
            key={region.RegionId || region.Name}
            style={[styles.regionTab, selectedRegion?.RegionId === region.RegionId && styles.activeRegionTab]}
            onPress={() => onSelect(region)}
          >
            <Text style={[styles.regionTabText, selectedRegion?.RegionId === region.RegionId && styles.activeRegionText]}>
              {region.Name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Card>
        <View style={styles.headingRow}>
          <ShieldCheck size={20} color="#2563EB" />
          <Text style={styles.cardTitle}>Fish Farming Guide for {selectedRegion?.Name}</Text>
        </View>
        <InfoBlock title="Climate Conditions" text={info.climate} />
        <InfoBlock title="Water Availability" text={info.water} />
        <InfoBlock title="Peak Farming Season" text={info.season} />
        <InfoBlock title="Recommended Pond Size" text={info.pondSize} />
        <InfoBlock title="Common Challenges" text={info.challenges} />
        <InfoBlock title="Practical Tips" text={info.tips} />
      </Card>
    </>
  );
}

function Polyculture({ mixes }) {
  if (!mixes.length) {
    return <EmptyState title="No polyculture mixes yet" text="Compatible mix recommendations will appear here." />;
  }

  return mixes.map((mix, index) => (
    <Card key={mix.MixId || index}>
      <View style={styles.headingRow}>
        <TrendingUp size={20} color="#059669" />
        <Text style={styles.cardTitle}>{mix.Name || mix.MixName || `Polyculture Mix ${index + 1}`}</Text>
      </View>
      <Text style={styles.notes}>{mix.Description || mix.description || "Compatible species mix for balanced production."}</Text>
      <Metric label="Species" value={mix.SpeciesNames || mix.species || "Multiple"} />
      <Metric label="Stocking Ratio" value={mix.Ratio || mix.stockingRatio || "As recommended"} />
      <Metric label="Best For" value={mix.RegionName || mix.bestFor || "Local ponds"} />
    </Card>
  ));
}

function GrowthTimeline({ species, guidelines }) {
  const rows = species.length ? species : guidelines;

  if (!rows.length) {
    return <EmptyState title="No timeline data" text="Growth and feeding timelines will appear when data is available." />;
  }

  return rows.slice(0, 12).map((item, index) => (
    <Card key={item.SpeciesId || item.RuleId || index}>
      <View style={styles.headingRow}>
        <Calendar size={20} color="#B45309" />
        <Text style={styles.cardTitle}>{item.Name || item.SpeciesName || `Growth Stage ${index + 1}`}</Text>
      </View>
      <Metric label="Fingerling" value={`${item.FingerlingSizeG || item.MinSizeInch || "1"} ${item.FingerlingSizeG ? "g" : "inch"}`} />
      <Metric label="Target Market Size" value={`${item.MarketSizeKG || item.MaxSizeInch || "10"} ${item.MarketSizeKG ? "kg" : "inch"}`} />
      <Metric label="Harvest Time" value={`${item.HarvestTimeMonths || item.DurationMonths || "2-3"} months`} />
      <Metric label="Feed Rate" value={item.FeedRate || item.FeedPercentage || "Follow feed recommendation"} />
    </Card>
  ));
}

function Metric({ label, value, highlight }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, highlight && styles.highlight]}>{value}</Text>
    </View>
  );
}

function InfoBlock({ title, text }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function AddSpeciesModal({ visible, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    Name: "",
    Description: "",
    MinTemp: "",
    MaxTemp: "",
    MinPH: "",
    MaxPH: "",
    MinDO: "",
    FingerlingSizeG: "",
    MarketSizeKG: "",
    HarvestTimeMonths: "",
    MaxStockingDensity: "",
    SurvivalRateLower: "",
    SurvivalRateUpper: "",
    MinMarketPrice: "",
    MaxMarketPrice: "",
    CompatibleRegions: "Punjab",
    ImageUrl: "",
  });
  const [loading, setLoading] = useState(false);

  const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
        <Text style={styles.modalTitle}>Submit New Species</Text>
        <Text style={styles.modalSubtitle}>The admin panel will review this before publishing.</Text>
        <Input label="Species Name" value={formData.Name} onChangeText={(v) => setField("Name", v)} />
        <Input label="Image URL" value={formData.ImageUrl} onChangeText={(v) => setField("ImageUrl", v)} />
        <Input label="Description" value={formData.Description} onChangeText={(v) => setField("Description", v)} multiline />
        <Input label="Minimum Temp" value={formData.MinTemp} onChangeText={(v) => setField("MinTemp", v)} keyboardType="numeric" />
        <Input label="Maximum Temp" value={formData.MaxTemp} onChangeText={(v) => setField("MaxTemp", v)} keyboardType="numeric" />
        <Input label="Minimum pH" value={formData.MinPH} onChangeText={(v) => setField("MinPH", v)} keyboardType="numeric" />
        <Input label="Maximum pH" value={formData.MaxPH} onChangeText={(v) => setField("MaxPH", v)} keyboardType="numeric" />
        <Input label="Minimum DO" value={formData.MinDO} onChangeText={(v) => setField("MinDO", v)} keyboardType="numeric" />
        <Input label="Fingerling Size (g)" value={formData.FingerlingSizeG} onChangeText={(v) => setField("FingerlingSizeG", v)} keyboardType="numeric" />
        <Input label="Market Size (kg)" value={formData.MarketSizeKG} onChangeText={(v) => setField("MarketSizeKG", v)} keyboardType="numeric" />
        <Input label="Harvest Months" value={formData.HarvestTimeMonths} onChangeText={(v) => setField("HarvestTimeMonths", v)} keyboardType="numeric" />
        <Input label="Stocking Density / Acre" value={formData.MaxStockingDensity} onChangeText={(v) => setField("MaxStockingDensity", v)} keyboardType="numeric" />
        <Input label="Survival Lower %" value={formData.SurvivalRateLower} onChangeText={(v) => setField("SurvivalRateLower", v)} keyboardType="numeric" />
        <Input label="Survival Upper %" value={formData.SurvivalRateUpper} onChangeText={(v) => setField("SurvivalRateUpper", v)} keyboardType="numeric" />
        <Input label="Minimum Market Price" value={formData.MinMarketPrice} onChangeText={(v) => setField("MinMarketPrice", v)} keyboardType="numeric" />
        <Input label="Maximum Market Price" value={formData.MaxMarketPrice} onChangeText={(v) => setField("MaxMarketPrice", v)} keyboardType="numeric" />

        <Text style={styles.inputLabel}>Compatible Region</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={formData.CompatibleRegions} onValueChange={(v) => setField("CompatibleRegions", v)} style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor="#6B7280">
            <Picker.Item label="Punjab" value="Punjab" />
            <Picker.Item label="Sindh" value="Sindh" />
            <Picker.Item label="KPK" value="KPK" />
            <Picker.Item label="Balochistan" value="Balochistan" />
          </Picker>
        </View>

        <PrimaryButton title={loading ? "Submitting..." : "Submit Species"} onPress={submit} disabled={loading} />
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

function Input({ label, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput style={[styles.input, props.multiline && styles.textArea]} placeholderTextColor="#9CA3AF" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  tabText: {
    color: "#6B7280",
    fontWeight: "900",
    fontSize: 12,
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  addButton: {
    marginBottom: 14,
  },
  imageWrap: {
    height: 170,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    overflow: "hidden",
  },
  speciesImage: {
    width: "100%",
    height: "100%",
  },
  cardTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
  },
  regionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingVertical: 9,
  },
  metricLabel: {
    color: "#6B7280",
    fontSize: 13,
  },
  metricValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    flex: 1,
    textAlign: "right",
  },
  highlight: {
    color: "#059669",
  },
  notes: {
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  regionTabs: {
    gap: 8,
    paddingBottom: 12,
  },
  regionTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  activeRegionTab: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  regionTabText: {
    color: "#6B7280",
    fontWeight: "900",
  },
  activeRegionText: {
    color: "#1D4ED8",
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  infoBlock: {
    marginTop: 12,
  },
  infoTitle: {
    color: "#111827",
    fontWeight: "900",
    marginBottom: 4,
  },
  infoText: {
    color: "#6B7280",
    lineHeight: 20,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalContent: {
    padding: 18,
    paddingBottom: 34,
  },
  modalTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 18,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: "#374151",
    fontWeight: "900",
    fontSize: 13,
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    color: "#111827",
    paddingHorizontal: 12,
    minHeight: 46,
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  pickerWrap: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  picker: {
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  pickerItem: {
    color: "#111827",
  },
  closeButton: {
    alignItems: "center",
    padding: 16,
  },
  closeText: {
    color: "#6B7280",
    fontWeight: "900",
  },
});
