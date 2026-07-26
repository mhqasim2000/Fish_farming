import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { farmApi } from '../integration/farmApi';

export default function AddPondScreen({ navigation, route }) {
  const editingPond = route?.params?.pond || null;
  const isEditMode = Boolean(editingPond?.id || editingPond?.PondId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [farmDetails, setFarmDetails] = useState(null);
  const [areaUsage, setAreaUsage] = useState(null);
  const [regions, setRegions] = useState([]);
  const [pondOptions, setPondOptions] = useState(null);

  const [pondName, setPondName] = useState('');
  const [size, setSize] = useState('');
  const [pondStage, setPondStage] = useState('Grown-out');
  const [pondStructure, setPondStructure] = useState('Earthen Pond');
  const [intensity, setIntensity] = useState('Extensive');
  const [cultureType, setCultureType] = useState('Monoculture');

  const [setupTotalArea, setSetupTotalArea] = useState('');
  const [setupRegionId, setSetupRegionId] = useState('');

  const hasFarm = Boolean(farmDetails?.FarmId);
  const totalArea = Number(
    areaUsage?.totalArea || farmDetails?.TotalAreaAcres || setupTotalArea || 0,
  );
  const usedArea = Number(areaUsage?.usedArea || 0);
  const availableArea = useMemo(() => {
    if (hasFarm) {
      return Number(
        areaUsage?.remainingArea ?? Math.max(0, totalArea - usedArea),
      );
    }

    return Number(setupTotalArea || 0);
  }, [areaUsage?.remainingArea, hasFarm, setupTotalArea, totalArea, usedArea]);

  const stageOptions = pondOptions?.stages?.length
    ? pondOptions.stages
    : ['Grown-out', 'Nursery', 'Juveline'];
  const pondTypeOptions = pondOptions?.pondTypes?.length
    ? pondOptions.pondTypes
    : ['Earthen Pond', 'Concrete Pond', 'Lined Pond'];
  const cultivationOptions = pondOptions?.cultivationTypes?.length
    ? pondOptions.cultivationTypes
    : ['Extensive', 'Semi-Intensive', 'Intensive'];
  const cultureOptions = pondOptions?.cultureTypes?.length
    ? pondOptions.cultureTypes
    : ['Monoculture', 'Polyculture'];

  const loadScreenData = useCallback(async () => {
    setLoading(true);
    try {
      const [details, usageData, regionData, optionsData] = await Promise.all([
        farmApi.getFarmDetails().catch(() => null),
        farmApi.getAreaUsage().catch(() => null),
        farmApi.getRegions().catch(() => []),
        farmApi.getPondOptions().catch(() => null),
      ]);

      setFarmDetails(details);
      setAreaUsage(usageData?.data || usageData);
      setRegions(regionData || []);
      setPondOptions(optionsData);
      if (isEditMode) {
        setPondName(editingPond.pondName || editingPond.PondName || '');
        setSize(String(editingPond.size || editingPond.Size || ''));
        setPondStage(editingPond.Stage || pondStage);
        setPondStructure(
          editingPond.pondType || editingPond.PondType || pondStructure,
        );
        setIntensity(editingPond.CultivationType || intensity);
        setCultureType(editingPond.CultureType || cultureType);
      }
    } catch (error) {
      Alert.alert(
        'Pond Setup',
        error.message || 'Failed to load pond setup data.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    cultureType,
    editingPond,
    intensity,
    isEditMode,
    pondStage,
    pondStructure,
  ]);

  useEffect(() => {
    loadScreenData();
  }, [loadScreenData]);

  const resetForm = () => {
    setPondName('');
    setSize('');
    setPondStage('Grown-out');
    setPondStructure('Earthen Pond');
    setIntensity('Extensive');
    setCultureType('Monoculture');
  };

  const ensureFarm = async () => {
    if (hasFarm) {
      return farmDetails.FarmId;
    }

    if (!setupTotalArea || Number(setupTotalArea) <= 0) {
      throw new Error('Please enter a valid total farm area first.');
    }

    if (!setupRegionId) {
      throw new Error('Please select a region first.');
    }

    const result = await farmApi.setupFarm({
      totalArea: Number(setupTotalArea),
      regionId: Number(setupRegionId),
    });

    const createdFarmId = result?.farmId;
    if (!createdFarmId) {
      throw new Error('Farm setup completed, but no farm ID was returned.');
    }

    setFarmDetails(prev => ({
      ...prev,
      FarmId: createdFarmId,
      TotalAreaAcres: Number(setupTotalArea),
    }));
    setAreaUsage({
      totalArea: Number(setupTotalArea),
      usedArea: 0,
      remainingArea: Number(setupTotalArea),
    });

    return createdFarmId;
  };

  const handleAddPond = async () => {
    if (
      !pondName ||
      !size ||
      !pondStage ||
      !pondStructure ||
      !intensity ||
      !cultureType
    ) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    if (Number(size) <= 0) {
      Alert.alert('Error', 'Please enter a valid pond size.');
      return;
    }

    if (Number(size) > Number(availableArea || 0)) {
      Alert.alert(
        'Error',
        `Maximum allowed area is ${Number(availableArea || 0).toFixed(
          2,
        )} acres.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const farmId = isEditMode ? farmDetails?.FarmId : await ensureFarm();

      if (isEditMode) {
        await farmApi.updatePond(editingPond.id || editingPond.PondId, {
          PondName: pondName.trim(),
          Stage: pondStage,
          CultureType: cultureType,
          PondType: pondStructure,
          Size: Number(size),
          CultivationType: intensity,
        });
      } else {
        await farmApi.provisionPond({
          pondPlan: [],
          pondSpecs: {
            pondName: pondName.trim(),
            stage: pondStage,
            cultureType,
            pondType: pondStructure,
            cultivationType: intensity,
            targetArea: Number(size),
            // recommendedLengthFeet: undefined,
            // recommendedWidthFeet: undefined,
            // recommendedDepthFeet: undefined,
            // estimatedVolumeLiters: undefined,
            // estimatedVolumeGallons: undefined,
          },
        });
      }

      Alert.alert(
        'Success',
        isEditMode
          ? 'Pond updated successfully.'
          : hasFarm
          ? 'Pond added successfully.'
          : 'Farm and pond created successfully.',
      );
      resetForm();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Pond Setup', error.message || 'Failed to save pond.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.modal}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>
              {isEditMode ? 'Edit Pond' : 'Add New Pond'}
            </Text>
            <Text style={styles.subtitle}>
              {isEditMode
                ? 'Update your pond details'
                : 'Enter your pond details to start tracking'}
            </Text>

            {!hasFarm && !isEditMode && (
              <View style={styles.setupCard}>
                <Text style={styles.setupTitle}>
                  Create Your Farm Profile First
                </Text>
                <Text style={styles.setupText}>
                  New accounts need a farm profile before ponds can be saved and
                  shown on the dashboard.
                </Text>

                <Text style={styles.label}>Total Farm Area (acres)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 5"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={setupTotalArea}
                  onChangeText={setSetupTotalArea}
                />

                <Text style={styles.label}>Region</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={setupRegionId}
                    onValueChange={setSetupRegionId}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    dropdownIconColor="#6B7280"
                  >
                    <Picker.Item label="Select region..." value="" />
                    {regions.map(region => (
                      <Picker.Item
                        key={region.RegionId}
                        label={region.Name}
                        value={String(region.RegionId)}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
            )}

            <View style={styles.areaCard}>
              <Text style={styles.areaText}>
                Available Area: {Number(availableArea || 0).toFixed(2)} acres
              </Text>
              <Text style={styles.areaSubText}>
                Total: {Number(totalArea || 0).toFixed(2)} acres • Used:{' '}
                {Number(usedArea || 0).toFixed(2)} acres
              </Text>
            </View>

            <Text style={styles.label}>Pond Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Main Pond 1"
              placeholderTextColor="#9CA3AF"
              value={pondName}
              onChangeText={setPondName}
            />

            <Text style={styles.label}>Size (acres)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 1.5"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={size}
              onChangeText={setSize}
            />
            <Text style={styles.helperText}>
              Maximum: {Number(availableArea || 0).toFixed(2)} acres
            </Text>

            <Text style={styles.label}>Pond Stage</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={pondStage}
                onValueChange={setPondStage}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                dropdownIconColor="#6B7280"
              >
                {stageOptions.map(option => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Pond Structure</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={pondStructure}
                onValueChange={setPondStructure}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                dropdownIconColor="#6B7280"
              >
                {pondTypeOptions.map(option => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Cultivation Intensity</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={intensity}
                onValueChange={setIntensity}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                dropdownIconColor="#6B7280"
              >
                {cultivationOptions.map(option => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Culture Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={cultureType}
                onValueChange={setCultureType}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                dropdownIconColor="#6B7280"
              >
                {cultureOptions.map(option => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Add fish later: after creating the pond, use the Add Fish button
                to stock it with fingerlings.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.addButton, submitting && styles.buttonDisabled]}
              onPress={handleAddPond}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.addButtonText}>
                  {isEditMode
                    ? 'Save Pond Changes'
                    : hasFarm
                    ? '+ Add Pond'
                    : 'Create Farm & Add Pond'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation?.goBack()}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
  },
  modal: {
    flex: 1,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: 15,
  },
  setupCard: {
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  setupTitle: {
    color: '#111827',
    fontWeight: '700',
    marginBottom: 6,
  },
  setupText: {
    color: '#4B5563',
    marginBottom: 10,
    fontSize: 13,
  },
  areaCard: {
    backgroundColor: '#E6F0FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  areaText: {
    fontWeight: '700',
    color: '#1D4ED8',
  },
  areaSubText: {
    fontSize: 12,
    color: '#4B5563',
  },
  label: {
    fontWeight: '600',
    marginTop: 10,
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginTop: 5,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 5,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    marginTop: 5,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: {
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  pickerItem: {
    color: '#111827',
  },
  infoBox: {
    backgroundColor: '#E6F0FF',
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
  },
  infoText: {
    fontSize: 13,
    color: '#1D4ED8',
  },
  addButton: {
    backgroundColor: '#2563EB',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#2563EB',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cancelButton: {
    padding: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: '#6B7280',
  },
});
