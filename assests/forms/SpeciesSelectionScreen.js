// ===========================================
// FILE: screens/SpeciesSelectionScreen.js
// ===========================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { farmApi } from '../integration/farmApi';

const normalizeText = value => String(value || '').trim().toLowerCase();

const getRegionLabel = region =>
  region?.RegionName || region?.Name || region?.Province || 'Selected region';

const getRegionQueryName = region =>
  region?.Province || region?.RegionName || region?.Name || '';

const getRegionClimateText = region =>
  [
    region?.Climate,
    region?.climate,
    region?.Description,
    region?.description,
    region?.RegionName,
    region?.Name,
    region?.Province,
  ]
    .filter(Boolean)
    .join(' ');

const getRegionClimateType = region => {
  const text = normalizeText(getRegionClimateText(region));

  if (
    text.includes('cold') ||
    text.includes('winter') ||
    text.includes('moderate') ||
    text.includes('khyber') ||
    text.includes('kpk') ||
    text.includes('gilgit') ||
    text.includes('mountain')
  ) {
    return 'cold';
  }

  if (
    text.includes('very hot') ||
    text.includes('hot') ||
    text.includes('dry') ||
    text.includes('arid') ||
    text.includes('extreme') ||
    text.includes('sindh') ||
    text.includes('baloch') ||
    text.includes('punjab')
  ) {
    return 'warm';
  }

  return 'balanced';
};

const getSpeciesClimateType = species => {
  const name = normalizeText(species?.Name);
  const minTemp = Number(species?.MinTemp);
  const maxTemp = Number(species?.MaxTemp);

  if (
    name.includes('trout') ||
    name.includes('common carp') ||
    name.includes('grass carp') ||
    name.includes('mrigal') ||
    (Number.isFinite(minTemp) && minTemp <= 18)
  ) {
    return 'cold';
  }

  if (
    name.includes('tilapia') ||
    name.includes('rohu') ||
    name.includes('catla') ||
    name.includes('silver carp') ||
    (Number.isFinite(minTemp) && minTemp >= 22) ||
    (Number.isFinite(maxTemp) && maxTemp >= 30)
  ) {
    return 'warm';
  }

  return 'balanced';
};

const isSpeciesRecommendedForRegion = (species, climateType) => {
  const speciesClimate = getSpeciesClimateType(species);
  return (
    climateType === 'balanced' ||
    speciesClimate === climateType ||
    speciesClimate === 'balanced'
  );
};

const sortSpeciesForRegion = (list, climateType) =>
  [...list].sort((first, second) => {
    const firstRecommended = isSpeciesRecommendedForRegion(first, climateType)
      ? 1
      : 0;
    const secondRecommended = isSpeciesRecommendedForRegion(second, climateType)
      ? 1
      : 0;

    if (firstRecommended !== secondRecommended) {
      return secondRecommended - firstRecommended;
    }

    return String(first.Name || '').localeCompare(String(second.Name || ''));
  });

export default function SpeciesSelectionScreen({ navigation, route }) {
  const totalArea = route?.params?.totalArea;
  const regionId = route?.params?.regionId;
  const [speciesList, setSpeciesList] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selected, setSelected] = useState([]);
  const [intensity, setIntensity] = useState('Semi-Intensive');
  const [loading, setLoading] = useState(true);
  const [compatibilityMap, setCompatibilityMap] = useState({});
  const [checkingCompat, setCheckingCompat] = useState(false);

  const loadSpecies = useCallback(async () => {
    setLoading(true);
    try {
      const regionsData = await farmApi.getRegions().catch(() => []);
      const regions = Array.isArray(regionsData)
        ? regionsData
        : Array.isArray(regionsData?.data)
        ? regionsData.data
        : [];
      const currentRegion =
        regions.find(region => Number(region.RegionId) === Number(regionId)) ||
        null;
      const regionName = currentRegion ? getRegionQueryName(currentRegion) : '';
      const climateType = getRegionClimateType(currentRegion);

      const data = regionName
        ? await farmApi
            .getRegionalSpecies(regionName)
            .catch(() => farmApi.getApprovedSpecies())
        : await farmApi.getApprovedSpecies();
      const list = Array.isArray(data) ? data : [];

      setSelectedRegion(currentRegion);
      setSpeciesList(sortSpeciesForRegion(list, climateType));
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to load species.');
    } finally {
      setLoading(false);
    }
  }, [regionId]);

  useFocusEffect(
    useCallback(() => {
      loadSpecies();
    }, [loadSpecies]),
  );

  // Build compatibility map whenever selected species change
  useEffect(() => {
    if (selected.length < 2) {
      setCompatibilityMap({});
      return;
    }

    let cancelled = false;
    setCheckingCompat(true);

    farmApi
      .checkBulkCompatibility(selected)
      .then(result => {
        if (cancelled) return;
        const map = {};
        (result.pairs || []).forEach(pair => {
          const keyA = `${pair.speciesIdA}-${pair.speciesIdB}`;
          const keyB = `${pair.speciesIdB}-${pair.speciesIdA}`;
          map[keyA] = pair.compatible;
          map[keyB] = pair.compatible;
        });
        setCompatibilityMap(map);
      })
      .catch(() => {
        if (cancelled) setCompatibilityMap({});
      })
      .finally(() => {
        if (!cancelled) setCheckingCompat(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Check if a species is compatible with all currently selected species
  const isCompatibleWithSelection = speciesId => {
    if (selected.length === 0) return true;
    if (selected.includes(speciesId)) return true; // already selected

    for (const selId of selected) {
      const key = `${speciesId}-${selId}`;
      if (compatibilityMap[key] === false) return false;
    }
    return true;
  };

  // Get reason why a species is incompatible
  const getIncompatibleSpecies = speciesId => {
    const incompatible = [];
    for (const selId of selected) {
      const key = `${speciesId}-${selId}`;
      if (compatibilityMap[key] === false) {
        const sp = speciesList.find(s => s.SpeciesId === selId);
        if (sp) incompatible.push(sp.Name);
      }
    }
    return incompatible;
  };

  const toggleSpecies = id => {
    if (selected.includes(id)) {
      setSelected(selected.filter(item => item !== id));
    } else {
      if (selected.length >= 3) {
        Alert.alert(
          'Limit Reached',
          'You can select up to 3 species for polyculture.',
        );
        return;
      }
      if (!isCompatibleWithSelection(id)) {
        const incompatible = getIncompatibleSpecies(id);
        Alert.alert(
          'Incompatible Species',
          `This species cannot live with: ${incompatible.join(
            ', ',
          )}. Please deselect the incompatible species first.`,
        );
        return;
      }
      setSelected([...selected, id]);
    }
  };

  const getSelectedNames = () => {
    return speciesList
      .filter(s => selected.includes(s.SpeciesId))
      .map(s => s.Name);
  };

  const climateType = getRegionClimateType(selectedRegion);
  const recommendedCount = speciesList.filter(species =>
    isSpeciesRecommendedForRegion(species, climateType),
  ).length;
  const climateLabel =
    climateType === 'cold'
      ? 'cold-water'
      : climateType === 'warm'
      ? 'warm-water'
      : 'local';

  const handleContinue = () => {
    if (selected.length === 0) {
      Alert.alert('No Species', 'Please select at least one species.');
      return;
    }
    const selectedData = speciesList.filter(s =>
      selected.includes(s.SpeciesId),
    );
    navigation.navigate('Stocking', {
      selectedSpecies: selectedData,
      intensity,
      totalArea,
      regionId,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading species...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Setup Farm</Text>
            <Text style={styles.stepText}>Step 2 of 3: Species Selection</Text>
          </View>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topCard}>
          <Text style={styles.regionTitle}>
            {getRegionLabel(selectedRegion)}
          </Text>
          <Text style={styles.recommendationText}>
            Recommended {climateLabel} fish are shown first for this selected
            area.
          </Text>
          <Text style={styles.recommendationMeta}>
            {recommendedCount} of {speciesList.length} species match this
            climate.
          </Text>

          <Text style={styles.topText}>
            Choose your farming intensity to calculate stock densities
            correctly.
          </Text>

          <View style={styles.tabs}>
            {['Extensive', 'Semi-Intensive', 'Intensive'].map(item => (
              <TouchableOpacity
                key={item}
                style={[styles.tab, intensity === item && styles.activeTab]}
                onPress={() => setIntensity(item)}
              >
                <Text
                  style={[
                    styles.tabText,
                    intensity === item && styles.activeTabText,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Polyculture Rules</Text>

          <Text style={styles.rule}>
            • Select up to 3 compatible species to grow together.
          </Text>

          <Text style={styles.rule}>
            • Incompatible species will be locked automatically.
          </Text>

          <Text style={styles.rule}>
            • Species that cannot live together will show a warning.
          </Text>
        </View>

        {selected.length > 0 && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedBarText}>
              Selected: {getSelectedNames().join(', ') || 'None'}
            </Text>
            {checkingCompat && (
              <ActivityIndicator
                size="small"
                color="#2563EB"
                style={{ marginLeft: 8 }}
              />
            )}
          </View>
        )}

        {speciesList.map(item => {
          const isSelected = selected.includes(item.SpeciesId);
          const compat = isCompatibleWithSelection(item.SpeciesId);
          const isLocked = !isSelected && !compat && selected.length > 0;
          const isRecommended = isSpeciesRecommendedForRegion(
            item,
            climateType,
          );
          const incompatibleWith = isLocked
            ? getIncompatibleSpecies(item.SpeciesId)
            : [];

          return (
            <TouchableOpacity
              key={item.SpeciesId}
              style={[
                styles.speciesCard,
                isSelected && styles.selectedCard,
                isLocked && styles.lockedCard,
              ]}
              onPress={() => toggleSpecies(item.SpeciesId)}
              disabled={isLocked}
              activeOpacity={isLocked ? 1 : 0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  isSelected && styles.checkboxSelected,
                  isLocked && styles.checkboxLocked,
                ]}
              >
                {isSelected && <Text style={{ color: '#fff' }}>✓</Text>}
                {isLocked && <Text style={{ color: '#DC2626' }}>✕</Text>}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.speciesName, isLocked && styles.lockedText]}
                >
                  {item.Name}
                </Text>
                <Text style={styles.speciesType}>
                  {item.FeedingZone || 'General'}
                </Text>
                <Text
                  style={[
                    styles.climateNote,
                    isRecommended
                      ? styles.recommendedNote
                      : styles.otherClimateNote,
                  ]}
                >
                  {isRecommended
                    ? `Suggested for ${climateLabel} areas`
                    : `Better for ${getSpeciesClimateType(item)} areas`}
                </Text>
                {isLocked && (
                  <Text style={styles.incompatNote}>
                    Cannot live with: {incompatibleWith.join(', ')}
                  </Text>
                )}
              </View>

              {isLocked && (
                <View style={styles.lockBadge}>
                  <Text style={styles.lockBadgeText}>Incompatible</Text>
                </View>
              )}
              {!isLocked && isRecommended && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>Suggested</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[
            styles.button,
            selected.length === 0 && styles.buttonDisabled,
          ]}
          onPress={handleContinue}
          disabled={selected.length === 0}
        >
          <Text style={styles.buttonText}>Plan Stock →</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#667085',
    fontSize: 16,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#101828',
  },

  stepText: {
    marginTop: 4,
    color: '#667085',
  },

  close: {
    fontSize: 22,
    color: '#98A2B3',
  },

  topCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
  },

  regionTitle: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },

  recommendationText: {
    color: '#166534',
    fontWeight: '600',
    lineHeight: 22,
  },

  recommendationMeta: {
    color: '#667085',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },

  topText: {
    color: '#475467',
    lineHeight: 22,
    marginBottom: 18,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F2F4F7',
    borderRadius: 12,
    padding: 5,
  },

  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  activeTab: {
    backgroundColor: '#fff',
  },

  tabText: {
    color: '#667085',
    fontWeight: '600',
  },

  activeTabText: {
    color: '#166534',
  },

  rulesCard: {
    backgroundColor: '#EEF4FF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },

  rulesTitle: {
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 12,
    fontSize: 18,
  },

  rule: {
    color: '#1D4ED8',
    marginBottom: 8,
    lineHeight: 22,
  },

  selectedBar: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  selectedBarText: {
    color: '#1D4ED8',
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },

  speciesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EAECF0',
  },

  selectedCard: {
    borderColor: '#2563EB',
    borderWidth: 2,
  },

  lockedCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    opacity: 0.7,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  checkboxSelected: {
    backgroundColor: '#2563EB',
  },

  checkboxLocked: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },

  speciesName: {
    fontWeight: '700',
    fontSize: 16,
    color: '#101828',
  },

  lockedText: {
    color: '#991B1B',
  },

  speciesType: {
    color: '#667085',
    marginTop: 4,
  },

  climateNote: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },

  recommendedNote: {
    color: '#166534',
  },

  otherClimateNote: {
    color: '#B45309',
  },

  incompatNote: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },

  lockBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  lockBadgeText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },

  recommendedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  recommendedBadgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
  },

  button: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
  },

  buttonDisabled: {
    backgroundColor: '#93C5FD',
  },

  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  back: {
    textAlign: 'center',
    marginTop: 20,
    color: '#667085',
    fontSize: 16,
  },
});
