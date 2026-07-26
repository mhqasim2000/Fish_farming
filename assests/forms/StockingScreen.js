// =====================================
// FILE: screens/StockingScreen.js
// =====================================

import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { farmApi } from '../integration/farmApi';

const mapIntensityToCultivation = intensity => {
  const value = String(intensity || '').toLowerCase();
  if (value.includes('intensive') && !value.includes('semi')) {
    return 'Intensive';
  }
  if (value.includes('semi')) {
    return 'Semi-Intensive';
  }
  return 'Extensive';
};

const buildPondSpecsPayload = (specs, intensity) => {
  if (!specs) {
    return null;
  }

  const cultivationType =
    specs.cultivationType || mapIntensityToCultivation(intensity);

  return {
    targetArea: Number(specs.targetArea || 1),
    stage: specs.stage === 'Nursery' ? 'Nursery' : 'Grown-out',
    cultivationType,
    cultureType: specs.cultureType || 'Polyculture',
    pondType: specs.pondType || 'Earthen Pond',
    pondName: specs.pondName || 'Polyculture Pond 1',
    recommendedLengthFeet: specs.recommendedLengthFeet,
    recommendedWidthFeet: specs.recommendedWidthFeet,
    recommendedDepthFeet: specs.recommendedDepthFeet,
    estimatedVolumeLiters: specs.estimatedVolumeLiters,
    estimatedVolumeGallons: specs.estimatedVolumeGallons,
    fixedNurseryArea: specs.fixedNurseryArea ?? null,
  };
};

export default function StockingScreen({ navigation, route }) {
  const selectedSpecies = useMemo(
    () => route?.params?.selectedSpecies || [],
    [route?.params?.selectedSpecies],
  );
  const intensity = route?.params?.intensity || 'Semi-Intensive';
  const totalArea = Number(route?.params?.totalArea || 1);
  const regionId = route?.params?.regionId;

  const [quantities, setQuantities] = useState({});
  const [pondSpecs, setPondSpecs] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Initialize quantities
  useEffect(() => {
    const initial = {};
    selectedSpecies.forEach(sp => {
      initial[sp.SpeciesId] = '';
    });
    setQuantities(initial);
  }, [selectedSpecies]);

  const setQuantity = (speciesId, value) => {
    setQuantities(prev => ({ ...prev, [speciesId]: value }));
  };

  const handleCalculate = async () => {
    const speciesList = selectedSpecies.map(sp => ({
      speciesId: sp.SpeciesId,
      quantity: parseInt(quantities[sp.SpeciesId], 10) || 0,
    }));

    const totalFish = speciesList.reduce((sum, s) => sum + s.quantity, 0);
    if (totalFish === 0) {
      Alert.alert(
        'No Fish',
        'Please enter quantities for at least one species.',
      );
      return;
    }

    setCalculating(true);
    try {
      const result = await farmApi.calculatePondSpecs(
        speciesList,
        totalArea,
        'Grown-out',
        mapIntensityToCultivation(intensity),
      );
      if (!result?.success || !result?.data) {
        throw new Error(result?.error || 'Could not calculate pond specs.');
      }
      if (
        Number(result.data.totalCapacity || 0) > 0 &&
        totalFish > Number(result.data.totalCapacity || 0)
      ) {
        Alert.alert(
          'Stocking Limit Exceeded',
          `You entered ${totalFish.toLocaleString()} fish, but the calculated stocking limit is ${Number(
            result.data.totalCapacity,
          ).toLocaleString()} fish.`,
        );
        setPondSpecs(null);
        return;
      }
      setPondSpecs(result.data);
    } catch (err) {
      Alert.alert(
        'Calculation Error',
        err.message || 'Failed to calculate pond specs.',
      );
    } finally {
      setCalculating(false);
    }
  };

  const handleProvision = async () => {
    if (!pondSpecs) {
      Alert.alert(
        'Calculate First',
        'Please calculate pond specs before provisioning.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const pondPlan = selectedSpecies.map(sp => ({
        speciesId: sp.SpeciesId,
        quantity: parseInt(quantities[sp.SpeciesId], 10) || 0,
      }));

      const pondSpecsPayload = buildPondSpecsPayload(pondSpecs, intensity);
      if (!pondSpecsPayload) {
        throw new Error('Pond specifications are missing. Calculate again.');
      }

      const totalFish = pondPlan.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      );
      const totalCapacity = Number(pondSpecs.totalCapacity || 0);
      if (totalCapacity > 0 && totalFish > totalCapacity) {
        Alert.alert(
          'Stocking Limit Exceeded',
          `You entered ${totalFish.toLocaleString()} fish, but the stocking limit is ${totalCapacity.toLocaleString()} fish.`,
        );
        return;
      }

      if (Number(pondSpecsPayload.targetArea || 0) > totalArea) {
        Alert.alert(
          'Farm Area Exceeded',
          `This pond requires ${Number(
            pondSpecsPayload.targetArea,
          ).toFixed(2)} acres, but the overview farm area is ${Number(
            totalArea,
          ).toFixed(2)} acres.`,
        );
        return;
      }

      let farmProfile = null;
      try {
        farmProfile = await farmApi.getFarmDetails();
      } catch {
        farmProfile = null;
      }

      if (!farmProfile?.FarmId) {
        if (!regionId || !totalArea) {
          throw new Error(
            'Farm area and region are required. Go back to step 1 and complete farm setup.',
          );
        }
        await farmApi.setupFarm({
          totalArea,
          regionId: Number(regionId),
        });
      }

      const result = await farmApi.provisionPond({
        pondPlan,
        pondSpecs: pondSpecsPayload,
      });

      if (result?.success === false) {
        throw new Error(result?.error || 'Provisioning failed.');
      }

      Alert.alert('Success', 'Farm provisioned successfully!', [
        {
          text: 'Go to Dashboard',
          onPress: () =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Dashboard', params: { firstLogin: true } }],
            }),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to provision farm.');
    } finally {
      setSubmitting(false);
    }
  };

  if (selectedSpecies.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No species selected.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>← Go back and select species</Text>
          </TouchableOpacity>
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
            <Text style={styles.stepText}>
              Step 3 of 3: Stocking Quantities
            </Text>
          </View>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.description}>
          Enter how many fingerlings of each species you want to stock.
          Intensity: <Text style={{ fontWeight: '700' }}>{intensity}</Text>
        </Text>

        <View style={styles.inputCard}>
          {selectedSpecies.map(sp => (
            <StockRow
              key={sp.SpeciesId}
              label={sp.Name}
              subtitle={sp.FeedingZone || 'General'}
              value={quantities[sp.SpeciesId] || ''}
              setValue={val => setQuantity(sp.SpeciesId, val)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.calcButton, calculating && styles.buttonDisabled]}
          onPress={handleCalculate}
          disabled={calculating}
        >
          {calculating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Calculate Pond Specs</Text>
          )}
        </TouchableOpacity>

        {pondSpecs && (
          <View style={styles.resultCard}>
            <Text style={styles.resultHeading}>Engineered Pond Dimensions</Text>

            <InfoItem
              label="STOCK CAPACITY"
              value={`${Number(pondSpecs.totalCapacity || 0).toLocaleString()} fish`}
            />
            <InfoItem
              label="POND AREA"
              value={`${Number(pondSpecs.targetArea || 0).toFixed(2)} acres`}
            />
            <InfoItem
              label="PHYSICAL SIZE"
              value={`L: ${pondSpecs.recommendedLengthFeet || '—'}' × W: ${
                pondSpecs.recommendedWidthFeet || '—'
              }'`}
            />
            <InfoItem
              label="DEEPEST POINT"
              value={`${pondSpecs.recommendedDepthFeet || '—'} ft`}
            />
            <InfoItem
              label="WATER VOLUME"
              value={`${Number(pondSpecs.estimatedVolumeLiters || 0).toLocaleString()} L`}
            />
          </View>
        )}

        {pondSpecs && (
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleProvision}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>✓ Provision Farm</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StockRow({ label, subtitle, value, setValue }) {
  return (
    <View style={styles.stockRow}>
      <View style={styles.stockLabelRow}>
        <Text style={styles.stockLabel}>{label}</Text>
        {subtitle && <Text style={styles.stockSubtitle}>{subtitle}</Text>}
      </View>

      <View style={styles.inputWrapper}>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          style={styles.stockInput}
          placeholder="0"
          placeholderTextColor="#9CA3AF"
        />
        <Text style={styles.fishText}>fish</Text>
      </View>
    </View>
  );
}

function InfoItem({ label, value }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#667085',
    marginBottom: 12,
  },
  backLink: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
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

  description: {
    color: '#475467',
    lineHeight: 24,
    marginBottom: 24,
  },

  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 22,
  },

  stockRow: {
    marginBottom: 18,
  },

  stockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  stockLabel: {
    fontWeight: '700',
    color: '#101828',
    fontSize: 16,
  },

  stockSubtitle: {
    color: '#667085',
    fontSize: 12,
    marginLeft: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  inputWrapper: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },

  stockInput: {
    flex: 1,
    fontSize: 16,
    color: '#101828',
    paddingVertical: 14,
  },

  fishText: {
    color: '#667085',
  },

  calcButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 22,
  },

  resultCard: {
    backgroundColor: '#ECFDF3',
    borderRadius: 18,
    padding: 20,
    marginBottom: 25,
  },

  resultHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 25,
  },

  infoLabel: {
    color: '#047857',
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 13,
  },

  infoValue: {
    color: '#065F46',
    fontSize: 18,
    fontWeight: '600',
  },

  button: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 18,
  },

  buttonDisabled: {
    opacity: 0.6,
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
