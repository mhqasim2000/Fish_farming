import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";

export default function FishFarmingGuide() {
  const [activeTab, setActiveTab] = useState("Fish Species");

  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.menu}>≡</Text>
        <Text style={styles.logo}>🐟</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>DJ</Text>
        </View>
      </View>

      {/* TITLE */}
      <Text style={styles.title}>Pakistani Fish Farming Guide</Text>
      <Text style={styles.subtitle}>
        Complete guide from fingerlings to market-ready harvest
      </Text>

      {/* ADD BUTTON */}
      <TouchableOpacity style={styles.addBtn}>
        <Text style={styles.addText}>＋ Add Custom Species</Text>
      </TouchableOpacity>

      {/* TABS */}
      <View style={styles.tabs}>
        {["Fish Species", "Regional Guide", "Polyculture", "Growth Timeline"].map(
          (tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                activeTab === tab && styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeText,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* ALL TABS SHOW FISH SPECIES */}
      <FishSpeciesCard
        name="Rohu"
        region="Punjab, Sindh"
        temp="25–32°C"
        ph="6.5–8.5"
        oxygen="4+ mg/L"
        fingerling="3g"
        market="0.8 kg"
        harvest="10 months"
        stocking="4,000"
        survival="75–85%"
        price="PKR 320–380/kg"
        notes="Bottom feeder, herbivorous, high market value
Excellent with Catla and Mrigal"
      />

      <FishSpeciesCard
        name="Tilapia"
        region="All Pakistan"
        temp="26–30°C"
        ph="6.5–8.5"
        oxygen="4+ mg/L"
        fingerling="2g"
        market="0.5 kg"
        harvest="6 months"
        stocking="8,000"
        survival="85–95%"
        price="PKR 280–320/kg"
        notes="Fast growing, hardy, good for beginners
Good with all carp species"
      />

      <FishSpeciesCard
        name="Catla"
        region="Punjab, Sindh"
        temp="25–32°C"
        ph="6.5–8.5"
        oxygen="5+ mg/L"
        fingerling="5g"
        market="1.5 kg"
        harvest="14 months"
        stocking="2,500"
        survival="70–80%"
        price="PKR 340–400/kg"
        notes="Surface feeder, large size, good growth
Best with Rohu and Mrigal"
      />

      <FishSpeciesCard
        name="Mrigal"
        region="Punjab, Sindh, KPK"
        temp="24–30°C"
        ph="6.5–8.0"
        oxygen="4+ mg/L"
        fingerling="3g"
        market="0.7 kg"
        harvest="10 months"
        stocking="3,500"
        survival="75–80%"
        price="PKR 300–350/kg"
        notes="Bottom feeder, good for polyculture
Traditional with Rohu and Catla"
      />

      <FishSpeciesCard
        name="Grass Carp"
        region="Punjab, KPK"
        temp="20–30°C"
        ph="6.5–8.5"
        oxygen="5+ mg/L"
        fingerling="4g"
        market="1.2 kg"
        harvest="13 months"
        stocking="1,500"
        survival="70–75%"
        price="PKR 280–330/kg"
        notes="Herbivorous, weed control, large size
Natural weed control in ponds"
      />

      <FishSpeciesCard
        name="Silver Carp"
        region="Punjab, Sindh"
        temp="22–28°C"
        ph="6.0–8.5"
        oxygen="4+ mg/L"
        fingerling="3g"
        market="0.9 kg"
        harvest="9 months"
        stocking="3,000"
        survival="80–85%"
        price="PKR 260–300/kg"
        notes="Filter feeder, fast growing
Improves water quality"
      />

      <FishSpeciesCard
        name="Common Carp"
        region="All Pakistan, Best for KPK"
        temp="15–30°C"
        ph="6.5–9.0"
        oxygen="3+ mg/L"
        fingerling="3g"
        market="0.8 kg"
        harvest="10 months"
        stocking="5,000"
        survival="85–90%"
        price="PKR 300–350/kg"
        notes="Hardy, cold tolerant, high survival
Very adaptable to all combinations"
      />

      {/* QUICK TIPS */}
      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>⚡ Quick Tips for Success</Text>
        <Text style={styles.tip}>• Water quality is key – check daily</Text>
        <Text style={styles.tip}>• Feed regularly for consistent growth</Text>
        <Text style={styles.tip}>• Choose species based on your region</Text>
        <Text style={styles.tip}>
          • Harvest when market prices are good
        </Text>
      </View>
    </ScrollView>
  );
}

/* ================= CARD COMPONENT ================= */

function FishSpeciesCard(props) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🐟 {props.name}</Text>
      <Text style={styles.region}>{props.region}</Text>

      <Info label="Temperature" value={props.temp} />
      <Info label="pH Range" value={props.ph} />
      <Info label="Dissolved O₂" value={props.oxygen} />
      <Info label="Fingerling Size" value={props.fingerling} />
      <Info label="Market Size" value={props.market} />
      <Info label="Harvest Time" value={props.harvest} />
      <Info label="Stocking/Acre" value={props.stocking} />
      <Info label="Survival Rate" value={props.survival} />
      <Info label="Market Price" value={props.price} highlight />

      <Text style={styles.notes}>Notes:</Text>
      <Text style={styles.notesText}>{props.notes}</Text>
    </View>
  );
}

function Info({ label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={[styles.value, highlight && styles.green]}>
        {value}
      </Text>
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { backgroundColor: "#f4f7ff", padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  menu: { fontSize: 22 },
  logo: { fontSize: 22 },
  avatar: {
    backgroundColor: "#e5ebff",
    padding: 8,
    borderRadius: 20,
  },
  avatarText: { fontWeight: "bold" },

  title: { fontSize: 18, fontWeight: "bold" },
  subtitle: { color: "#666", marginBottom: 10 },

  addBtn: {
    backgroundColor: "#1e63ff",
    padding: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  addText: { color: "#fff", fontWeight: "bold" },

  tabs: { flexDirection: "row", marginBottom: 12, flexWrap: "wrap" },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#e9edff",
    borderRadius: 20,
    marginRight: 6,
    marginBottom: 6,
  },
  activeTab: { backgroundColor: "#1e63ff" },
  tabText: { fontSize: 12 },
  activeText: { color: "#fff" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontWeight: "bold", fontSize: 16 },
  region: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    borderRadius: 12,
    marginVertical: 6,
  },

  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: "#666" },
  value: { fontWeight: "500" },
  green: { color: "green" },

  notes: { marginTop: 6, fontWeight: "bold" },
  notesText: { color: "#1e63ff", fontSize: 12 },

  tips: {
    backgroundColor: "#fffbe6",
    padding: 14,
    borderRadius: 12,
    marginVertical: 16,
  },
  tipsTitle: { fontWeight: "bold", marginBottom: 6 },
  tip: { fontSize: 13 },
});
