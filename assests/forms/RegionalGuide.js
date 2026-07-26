import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";

export default function RegionalGuideScreen() {
  const [activeRegion, setActiveRegion] = useState("Punjab");

  return (
    <SafeAreaView style={styles.safe}>
      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <Text style={styles.menu}>≡</Text>
        <View style={styles.logoBox}>
          <Text style={styles.logo}>🐟</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>DJ</Text>
        </View>
      </View>

      {/* ================= CONTENT ================= */}
      <ScrollView contentContainerStyle={styles.container}>
        {/* REGION BUTTONS */}
        <View style={styles.regionTabs}>
          {["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan"].map(
            (region) => (
              <TouchableOpacity
                key={region}
                style={[
                  styles.regionBtn,
                  activeRegion === region && styles.activeRegion,
                ]}
                onPress={() => setActiveRegion(region)}
              >
                <Text
                  style={[
                    styles.regionText,
                    activeRegion === region && styles.activeText,
                  ]}
                >
                  {region}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        {/* REGION DATA */}
        {activeRegion === "Punjab" && <Punjab />}
        {activeRegion === "Sindh" && <Sindh />}
        {activeRegion === "Khyber Pakhtunkhwa" && <KPK />}
        {activeRegion === "Balochistan" && <Balochistan />}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ================= REGION COMPONENTS ================= */

function Punjab() {
  return (
    <Card title="Fish Farming Guide for Punjab">
      <Section title="Climate Conditions" text="Hot summers, mild winters" />
      <Section title="Water Availability" text="Canal irrigation, tube wells" />
      <Section title="Peak Farming Season" text="March to October" />
      <Section title="Recommended Pond Size" text="1–3 acres" />
      <Section
        title="Common Challenges"
        text="High summer temperatures, water shortage in some areas"
      />
      <Section
        title="Expert Tips"
        text="Use aerators during summer, maintain water level, polyculture recommended"
      />
      <Species
        title="Best Species for Punjab"
        list={[
          ["Rohu", "10mo"],
          ["Catla", "14mo"],
          ["Mrigal", "10mo"],
          ["Grass Carp", "13mo"],
          ["Common Carp", "10mo"],
        ]}
      />
    </Card>
  );
}

function Sindh() {
  return (
    <Card title="Fish Farming Guide for Sindh">
      <Section title="Climate Conditions" text="Very hot, dry climate" />
      <Section
        title="Water Availability"
        text="Indus irrigation system, good water supply"
      />
      <Section
        title="Peak Farming Season"
        text="Year-round, best March to November"
      />
      <Section title="Recommended Pond Size" text="2–5 acres" />
      <Section
        title="Common Challenges"
        text="Extreme heat, high evaporation"
      />
      <Section
        title="Expert Tips"
        text="Deep ponds (5–6 feet), good aeration essential, shade trees helpful"
      />
      <Species
        title="Best Species for Sindh"
        list={[
          ["Tilapia", "6mo"],
          ["Rohu", "10mo"],
          ["Catla", "14mo"],
          ["Silver Carp", "9mo"],
        ]}
      />
    </Card>
  );
}

function KPK() {
  return (
    <Card title="Fish Farming Guide for Khyber Pakhtunkhwa">
      <Section
        title="Climate Conditions"
        text="Moderate climate, cold winters"
      />
      <Section
        title="Water Availability"
        text="Natural springs, rivers, good quality water"
      />
      <Section title="Peak Farming Season" text="April to October" />
      <Section title="Recommended Pond Size" text="0.5–2 acres" />
      <Section
        title="Common Challenges"
        text="Cold winters slow growth, limited season"
      />
      <Section
        title="Expert Tips"
        text="Cold-tolerant species essential, covered ponds for winter, shorter growth cycle"
      />
      <Species
        title="Best Species for Khyber Pakhtunkhwa"
        list={[
          ["Common Carp", "10mo"],
          ["Grass Carp", "13mo"],
          ["Mrigal", "10mo"],
          ["Tilapia", "6mo"],
        ]}
      />
    </Card>
  );
}

function Balochistan() {
  return (
    <Card title="Fish Farming Guide for Balochistan">
      <Section
        title="Climate Conditions"
        text="Arid, extreme temperatures"
      />
      <Section
        title="Water Availability"
        text="Limited, tube wells, water conservation critical"
      />
      <Section title="Peak Farming Season" text="April to September" />
      <Section title="Recommended Pond Size" text="1–2 acres" />
      <Section
        title="Common Challenges"
        text="Water scarcity, extreme temperatures"
      />
      <Section
        title="Expert Tips"
        text="Hardy species only, water recycling systems, greenhouse-style ponds"
      />
      <Species
        title="Best Species for Balochistan"
        list={[
          ["Common Carp", "10mo"],
          ["Tilapia", "6mo"],
        ]}
      />
    </Card>
  );
}

/* ================= REUSABLE ================= */

function Card({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📍 {title}</Text>
      {children}
    </View>
  );
}

function Section({ title, text }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );
}

function Species({ title, list }) {
  return (
    <>
      <Text style={styles.subTitle}>{title}</Text>
      <View style={styles.speciesRow}>
        {list.map(([name, time]) => (
          <View key={name} style={styles.speciesBadge}>
            <Text style={styles.speciesText}>{name}</Text>
            <Text style={styles.time}>{time}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 56,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  menu: { fontSize: 22 },
  logoBox: {
    backgroundColor: "#1e63ff",
    padding: 6,
    borderRadius: 8,
  },
  logo: { color: "#fff" },
  avatar: {
    backgroundColor: "#e5ebff",
    padding: 6,
    borderRadius: 20,
  },
  avatarText: { fontWeight: "bold" },

  container: {
    backgroundColor: "#f4f7ff",
    padding: 16,
  },

  regionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  regionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d0d8ff",
    marginRight: 6,
    marginBottom: 6,
  },
  activeRegion: {
    backgroundColor: "#1e63ff",
    borderColor: "#1e63ff",
  },
  regionText: { fontSize: 12 },
  activeText: { color: "#fff", fontWeight: "bold" },

  card: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
  },
  cardTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },

  section: { marginBottom: 8 },
  sectionTitle: { fontWeight: "600", fontSize: 13 },
  sectionText: { fontSize: 13, color: "#444" },

  subTitle: { fontWeight: "bold", marginTop: 10, marginBottom: 6 },

  speciesRow: { flexDirection: "row", flexWrap: "wrap" },
  speciesBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f4ff",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    marginRight: 6,
    marginBottom: 6,
  },
  speciesText: { fontSize: 12, marginRight: 6 },
  time: { fontSize: 11, color: "#666" },
});
