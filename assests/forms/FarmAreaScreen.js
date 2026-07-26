// ======================================
// FILE: screens/FarmAreaScreen.js
// ======================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { farmApi } from '../integration/farmApi';

export default function FarmAreaScreen({ navigation }) {
  const [area, setArea] = useState('10');
  const [regionId, setRegionId] = useState('');
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await farmApi.getRegions();
        const list = Array.isArray(result)
          ? result
          : Array.isArray(result?.data)
          ? result.data
          : [];
        if (!cancelled) {
          setRegions(list);
          if (list.length > 0) {
            setRegionId(String(list[0].RegionId));
          }
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Regions', err.message || 'Could not load regions.');
        }
      } finally {
        if (!cancelled) {
          setLoadingRegions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNext = () => {
    const totalArea = Number(area);
    if (!totalArea || totalArea <= 0) {
      Alert.alert('Farm Area', 'Enter a valid total farm area in acres.');
      return;
    }
    if (!regionId) {
      Alert.alert('Farm Area', 'Please select your region.');
      return;
    }

    navigation.navigate('SpeciesSelection', {
      totalArea,
      regionId: Number(regionId),
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Setup Farm</Text>
            <Text style={styles.stepText}>
              Step 1 of 3: Farm Area & Location
            </Text>
          </View>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How It Works</Text>

          <Text style={styles.infoText}>
            Welcome! Tell us about your farm layout and we’ll automatically
            engineer perfect pond dimensions and multi-species polyculture
            stocking plans optimized for your region.
          </Text>
        </View>

        <Text style={styles.label}>Total Usable Area (acres)</Text>

        <TextInput
          value={area}
          onChangeText={setArea}
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 10"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Your Region</Text>

        {loadingRegions ? (
          <ActivityIndicator color="#2563EB" style={{ marginVertical: 12 }} />
        ) : (
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={regionId}
              onValueChange={value => setRegionId(String(value || ''))}
              style={styles.picker}
              dropdownIconColor="#6B7280"
            >
              <Picker.Item label="Select your region" value="" />
              {regions.map(region => (
                <Picker.Item
                  key={String(region.RegionId)}
                  label={
                    region.RegionName
                      ? `${region.RegionName}${
                          region.Province ? ` (${region.Province})` : ''
                        }`
                      : region.Name || 'Region'
                  }
                  value={String(region.RegionId)}
                />
              ))}
            </Picker>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>Next Step →</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Dashboard')}>
          <Text style={styles.skip}>Skip Setup</Text>
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

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 25,
  },

  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#101828',
  },

  stepText: {
    fontSize: 15,
    color: '#667085',
    marginTop: 4,
  },

  close: {
    fontSize: 22,
    color: '#98A2B3',
  },

  infoCard: {
    backgroundColor: '#EEF4FF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 24,
  },

  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 10,
  },

  infoText: {
    color: '#1D4ED8',
    lineHeight: 24,
    fontSize: 15,
  },

  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#344054',
    marginBottom: 10,
    marginTop: 12,
  },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    marginBottom: 10,
    color: '#111827',
  },

  pickerWrap: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },

  picker: {
    color: '#111827',
  },

  button: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 28,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  skip: {
    textAlign: 'center',
    marginTop: 20,
    color: '#667085',
    fontSize: 16,
  },
});
