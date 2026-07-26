import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react-native";
import { AppScaffold, Card, EmptyState } from "../compoents/AppScaffold";
import { farmApi } from "../integration/farmApi";

const tabs = [
  { id: "complete-guides", label: "Complete Guides" },
  { id: "faq", label: "FAQ" },
  { id: "quick-tips", label: "Quick Tips" },
];

export default function InformationScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("complete-guides");
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});

  const fetchGuides = async () => {
    setLoading(true);
    try {
      const data = await farmApi.getKnowledgeGuides();
      setGuides(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuides();
  }, []);

  const displayGuides = guides.filter((guide) => guide.TabCategory?.toLowerCase().replace(/\s+/g, "-") === activeTab);

  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  return (
    <AppScaffold
      title="Knowledge Center"
      subtitle="Complete guides and resources for successful aquaculture farming"
      navigation={navigation}
      currentRoute="Info"
    >
      <Card style={styles.banner}>
        <BookOpen size={28} color="#2563EB" />
        <View style={styles.bannerCopy}>
          <Text style={styles.bannerTitle}>Fish Farming Knowledge Center</Text>
          <Text style={styles.bannerText}>Guides, FAQs, and quick tips from the database.</Text>
        </View>
      </Card>

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

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : displayGuides.length === 0 ? (
        <EmptyState title="No content available" text="No knowledge guides have been added for this section yet." />
      ) : (
        displayGuides.map((guide) => (
          <Card key={guide.GuideId}>
            <View style={styles.guideTitleRow}>
              <BookOpen size={18} color="#2563EB" />
              <Text style={styles.guideTitle}>{guide.Title}</Text>
            </View>

            {(guide.sections || []).length === 0 ? (
              <Text style={styles.emptyGuideText}>No sections have been written for this guide yet.</Text>
            ) : (
              guide.sections.map((section) => {
                const isExpanded = !!expandedSections[section.SectionId];
                return (
                  <View key={section.SectionId} style={styles.sectionBlock}>
                    <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.SectionId)}>
                      <Text style={[styles.sectionTitle, isExpanded && styles.sectionTitleActive]}>{section.Title}</Text>
                      {isExpanded ? <ChevronUp size={17} color="#2563EB" /> : <ChevronDown size={17} color="#6B7280" />}
                    </TouchableOpacity>
                    {isExpanded && <Text style={styles.sectionText}>{section.ContentText || "Content is empty in database."}</Text>}
                  </View>
                );
              })
            )}
          </Card>
        ))
      )}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  bannerCopy: {
    flex: 1,
  },
  bannerTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
  bannerText: {
    color: "#6B7280",
    marginTop: 4,
  },
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
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
  },
  tabText: {
    color: "#6B7280",
    fontWeight: "900",
    fontSize: 12,
  },
  activeTabText: {
    color: "#111827",
  },
  guideTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  guideTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    flex: 1,
  },
  emptyGuideText: {
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 16,
  },
  sectionBlock: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  sectionTitle: {
    color: "#374151",
    fontWeight: "900",
    flex: 1,
  },
  sectionTitleActive: {
    color: "#2563EB",
  },
  sectionText: {
    color: "#4B5563",
    lineHeight: 21,
    paddingBottom: 16,
  },
});
