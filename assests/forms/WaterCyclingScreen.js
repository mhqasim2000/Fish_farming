import React, { useMemo, useState } from "react";
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
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Droplets,
  Filter,
  Info,
} from "lucide-react-native";
import { AppScaffold, Card, StatCard, Tag } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const WATER_PARAMETERS = [
  {
    key: "current_ph",
    label: "pH Level",
    unit: "pH",
    recommended: "6.5 - 8.5",
    placeholder: "e.g. 7.5",
    min: 6.5,
    max: 8.5,
    required: true,
  },
  {
    key: "current_do",
    label: "Oxygen Level",
    unit: "mg/L",
    recommended: "5.0 mg/L or higher",
    placeholder: "e.g. 6.5",
    min: 5,
    required: true,
  },
  {
    key: "current_temp",
    label: "Temperature",
    unit: "°C",
    recommended: "24 - 32 °C",
    placeholder: "e.g. 28",
    min: 24,
    max: 32,
    required: true,
  },
  {
    key: "current_ammonia",
    label: "Ammonia",
    unit: "mg/L",
    recommended: "Below 0.05 mg/L",
    placeholder: "e.g. 0.02",
    max: 0.05,
    required: true,
  },
  {
    key: "current_nitrate",
    label: "Nitrate",
    unit: "mg/L",
    recommended: "Below 40 mg/L",
    placeholder: "e.g. 10",
    max: 40,
    required: true,
  },
  {
    key: "current_nitrite",
    label: "Nitrite",
    unit: "mg/L",
    recommended: "Below 0.2 mg/L",
    placeholder: "e.g. 0.1",
    max: 0.2,
    required: true,
  },
];

const emptyReadings = WATER_PARAMETERS.reduce(
  (acc, item) => ({ ...acc, [item.key]: "" }),
  {},
);

const toNumber = value => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getReadingStatus = (parameter, value) => {
  const num = toNumber(value);
  if (num === null) return "empty";
  if (parameter.min !== undefined && num < parameter.min) return "bad";
  if (parameter.max !== undefined && num > parameter.max) return "bad";
  return "good";
};

export default function WaterCyclingScreen({ navigation, route }) {
  const selectedPond = route?.params?.pond;
  const pondId =
    route?.params?.initialPondId || selectedPond?.id || selectedPond?.PondId;
  const isRecordMode =
    route?.name === "RecordWaterCycle" ||
    route?.params?.mode === "record" ||
    route?.params?.source === "dashboard-card";
  const [readings, setReadings] = useState(emptyReadings);
  const [saving, setSaving] = useState(false);

  const allRequiredFilled = useMemo(
    () =>
      WATER_PARAMETERS.every(
        item => !item.required || String(readings[item.key] || "").trim() !== "",
      ),
    [readings],
  );

  const failingParameters = WATER_PARAMETERS.filter(
    item => getReadingStatus(item, readings[item.key]) === "bad",
  );

  const updateReading = (key, value) => {
    setReadings(prev => ({
      ...prev,
      [key]: value.replace(/[^0-9.]/g, ""),
    }));
  };

  const submit = async () => {
    if (!pondId) {
      Alert.alert(
        "Water Cycle",
        "Open Water Cycle from a pond card so the pond is selected automatically.",
      );
      return;
    }

    if (!allRequiredFilled) {
      Alert.alert("Water Cycle", "Please enter all water readings.");
      return;
    }

    const payload = { PondId: Number(pondId) };
    for (const parameter of WATER_PARAMETERS) {
      const value = toNumber(readings[parameter.key]);
      if (value === null) {
        Alert.alert("Water Cycle", `${parameter.label} must be a valid number.`);
        return;
      }
      payload[parameter.key] = value;
    }

    setSaving(true);
    try {
      await farmApi.recordWaterQuality(payload);
      Alert.alert(
        "Water Cycle",
        failingParameters.length
          ? `Water readings saved. ${failingParameters.length} parameter(s) are outside recommended levels.`
          : "Water readings saved. All parameters are within recommended levels.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      Alert.alert(
        "Water Cycle",
        error.message || "Failed to record water quality.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isRecordMode) {
    return (
      <AppScaffold
        title="Water Cycle Guide"
        subtitle="Learn how to maintain and cycle pond water"
        navigation={navigation}
        currentRoute="WaterQuality"
      >
        <GuideIntro />
        <WaterGuideContent />
      </AppScaffold>
    );
  }

  return (
    <AppScaffold
      title="Record Water Cycle"
      subtitle="Log water quality activity for the selected pond"
      navigation={navigation}
      currentRoute="WaterQuality"
    >
      <Card style={styles.selectedPondCard}>
        <Text style={styles.selectedPondLabel}>Selected pond</Text>
        <Text style={styles.selectedPondName}>
          {selectedPond?.pondName || selectedPond?.PondName || "No pond selected"}
        </Text>
        <Text style={styles.selectedPondMeta}>
          {selectedPond
            ? `${Number(selectedPond.size || selectedPond.Size || 0).toLocaleString()} acres${
                selectedPond.pondType || selectedPond.PondType
                  ? ` | ${selectedPond.pondType || selectedPond.PondType}`
                  : ""
              }`
            : "Use the Water action from a pond card to auto-select a pond."}
        </Text>
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.formHeader}>
          <Droplets size={22} color="#2563EB" />
          <View style={styles.formTitleWrap}>
            <Text style={styles.formTitle}>Water Quality Readings</Text>
            <Text style={styles.formSubtitle}>
              Recommended levels are shown with every parameter.
            </Text>
          </View>
        </View>

        {WATER_PARAMETERS.map(parameter => {
          const status = getReadingStatus(parameter, readings[parameter.key]);
          return (
            <View key={parameter.key} style={styles.inputBlock}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.label}>{parameter.label}</Text>
                <Tag
                  color={status === "bad" ? "#FEE2E2" : "#ECFDF5"}
                  textColor={status === "bad" ? "#B91C1C" : "#047857"}
                >
                  {parameter.recommended}
                </Tag>
              </View>
              <TextInput
                value={readings[parameter.key]}
                onChangeText={value => updateReading(parameter.key, value)}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  status === "good" && styles.inputGood,
                  status === "bad" && styles.inputBad,
                ]}
                placeholder={parameter.placeholder}
                placeholderTextColor="#9CA3AF"
              />
              <Text
                style={[
                  styles.helperText,
                  status === "bad" && styles.helperTextBad,
                ]}
              >
                Unit: {parameter.unit}. Recommended: {parameter.recommended}.
              </Text>
            </View>
          );
        })}

        {failingParameters.length > 0 && (
          <Card style={styles.warningCard}>
            <Info size={18} color="#B45309" />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>Outside recommended range</Text>
              <Text style={styles.warningText}>
                {failingParameters.map(item => item.label).join(", ")} may need
                correction. Consider water exchange, aeration, reduced feeding,
                or filtration depending on the failed parameter.
              </Text>
            </View>
          </Card>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!allRequiredFilled || saving || !pondId) && styles.saveButtonDisabled,
          ]}
          onPress={submit}
          disabled={!allRequiredFilled || saving || !pondId}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Droplets size={16} color="#FFFFFF" />
          )}
          <Text style={styles.saveButtonText}>
            {saving ? "Recording..." : "Record Water Cycle"}
          </Text>
        </TouchableOpacity>
      </Card>

    </AppScaffold>
  );
}

function GuideIntro() {
  return (
    <Card style={styles.guideIntroCard}>
      <View style={styles.formHeader}>
        <Droplets size={22} color="#2563EB" />
        <View style={styles.formTitleWrap}>
          <Text style={styles.formTitle}>Water cycle guide</Text>
          <Text style={styles.formSubtitle}>
            This page is only for learning. To log readings, use Record Water
            Cycle from a pond card on the dashboard.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function WaterGuideContent() {
  return (
    <>
      <MethodCard
        title="Fresh Water Exchange"
        subtitle="Use when ammonia, nitrite, turbidity, or oxygen stress appears."
        tag="Tubewell / Canal"
        color="#2563EB"
        steps={[
          {
            icon: ArrowDownCircle,
            title: "Add Fresh Water",
            items: [
              "Open inlet gate or valve",
              "Add water slowly to avoid disturbing fish",
              "Replace 10-30% of pond water depending on severity",
            ],
          },
          {
            icon: ArrowUpCircle,
            title: "Drain Old Water",
            items: [
              "Use mesh at outlet to prevent fish escape",
              "Drain old water to irrigation or drainage area",
              "Close outlet when target level is reached",
            ],
          },
        ]}
        when={[
          "High ammonia or nitrite",
          "Low oxygen emergency",
          "After heavy feeding",
          "Weekly maintenance",
        ]}
        stats={[
          { label: "Frequency", value: "Weekly" },
          { label: "Water Change", value: "10-30%" },
        ]}
      />

      <MethodCard
        title="Filtration & Aeration"
        subtitle="Use to stabilize oxygen and reduce suspended waste."
        tag="Recirculation"
        color="#059669"
        steps={[
          {
            icon: Filter,
            title: "Filter Water",
            items: [
              "Use mechanical filtration for solid waste",
              "Use biological media to reduce ammonia",
              "Clean filters weekly",
            ],
          },
          {
            icon: ArrowDownCircle,
            title: "Return Oxygenated Water",
            items: [
              "Return water with splash or waterfall effect",
              "Run aeration during hot weather and nighttime",
              "Monitor dissolved oxygen after treatment",
            ],
          },
        ]}
        when={[
          "Low dissolved oxygen",
          "Intensive culture systems",
          "Limited fresh water availability",
          "Long-term water stability",
        ]}
        stats={[
          { label: "Frequency", value: "Daily" },
          { label: "Best Time", value: "Night/Morning" },
        ]}
      />
    </>
  );
}

function MethodCard({ title, subtitle, tag, color, steps, when, stats }) {
  return (
    <Card style={[styles.methodCard, { borderColor: color }]}>
      <View style={styles.methodHeader}>
        <View style={styles.methodTitleRow}>
          <Droplets size={21} color={color} />
          <Text style={[styles.methodTitle, { color }]}>{title}</Text>
        </View>
        <Tag color={color} textColor="#FFFFFF">
          {tag}
        </Tag>
      </View>
      <Text style={[styles.methodSubtitle, { color }]}>{subtitle}</Text>

      {steps.map(step => {
        const Icon = step.icon;
        return (
          <Card key={step.title} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <Icon size={20} color={color} />
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            {step.items.map(item => (
              <Bullet key={item} text={item} color={color} />
            ))}
          </Card>
        );
      })}

      <Card style={styles.whenCard}>
        <View style={styles.stepHeader}>
          <Info size={18} color={color} />
          <Text style={styles.stepTitle}>When to Use</Text>
        </View>
        {when.map(item => (
          <View key={item} style={styles.checkRow}>
            <CheckCircle2 size={16} color={color} />
            <Text style={styles.checkText}>{item}</Text>
          </View>
        ))}
      </Card>

      <View style={styles.statsGrid}>
        {stats.map(item => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            accent={color}
          />
        ))}
      </View>
    </Card>
  );
}

function Bullet({ text, color }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bullet, { color }]}>{"\u2022"}</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  guideIntroCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  selectedPondCard: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    marginBottom: 14,
  },
  selectedPondLabel: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  selectedPondName: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  selectedPondMeta: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  formCard: {
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  formTitleWrap: {
    flex: 1,
  },
  formTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
  },
  formSubtitle: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  inputBlock: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 7,
  },
  label: {
    flex: 1,
    color: "#374151",
    fontWeight: "900",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    fontWeight: "800",
  },
  inputGood: {
    borderColor: "#10B981",
    backgroundColor: "#F0FDF4",
  },
  inputBad: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  helperText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  helperTextBad: {
    color: "#B91C1C",
  },
  warningCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    marginBottom: 14,
  },
  warningCopy: {
    flex: 1,
  },
  warningTitle: {
    color: "#92400E",
    fontWeight: "900",
    marginBottom: 3,
  },
  warningText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 14,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },
  methodCard: {
    borderWidth: 2,
    marginBottom: 18,
  },
  methodHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  methodTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  methodTitle: {
    fontSize: 19,
    fontWeight: "900",
  },
  methodSubtitle: {
    fontWeight: "800",
    lineHeight: 20,
    marginBottom: 12,
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
  },
  whenCard: {
    backgroundColor: "#F8FAFC",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  stepTitle: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    color: "#4B5563",
    fontWeight: "700",
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  checkText: {
    flex: 1,
    color: "#374151",
    fontWeight: "800",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
});
