import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { AlertTriangle, ArrowLeft, Fish, Skull } from 'lucide-react-native';
import { Card, PrimaryButton } from '../compoents/AppScaffold';
import { farmApi } from '../integration/farmApi';

export default function LogMortalityScreen({ navigation, route }) {
  const pond = route?.params?.pond;
  const batches = useMemo(() => pond?.species || [], [pond]);
  const [stockId, setStockId] = useState('');
  const [deadCount, setDeadCount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selected = batches.find(b => String(b.id) === String(stockId));
  const available = Number(selected?.quantity ?? selected?.Quantity ?? 0);

  const submit = async () => {
    if (!pond?.id) {
      Alert.alert('Summary', 'Missing pond.');
      return;
    }
    if (!stockId) {
      Alert.alert('Summary', 'Select the  species / batch.');
      return;
    }
    const n = Number(deadCount || 0);
    // if (!Number.isFinite(n) || n <= 0) {
    //   Alert.alert("Summary", "Enter the number of dead fish (greater than zero).");
    //   return;
    // }
    if (n > available) {
      Alert.alert(
        'Mortality',
        `You only have ${available} fish in this batch.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await farmApi.addMortality({
        pondId: Number(pond.id),
        speciesId: Number(stockId),
        quantity: Math.floor(n),
      });
      Alert.alert('Mortality', 'Mortality logged. Stock has been reduced.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Mortality', e.message || 'Could not log mortality.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pond) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>No pond selected.</Text>
        <PrimaryButton title="Go back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={22} color="#1D4ED8" />
        </TouchableOpacity>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle}>Log mortality</Text>
          <Text style={styles.topSubtitle}>
            {pond.pondName || pond.PondName}
          </Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.warningBanner}>
          <AlertTriangle size={22} color="#B45309" />
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>Permanent change</Text>
            <Text style={styles.warningText}>
              This will show the summary of specific pond.
            </Text>
          </View>
        </Card>

        {batches.length === 0 ? (
          <Card>
            <Fish size={32} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No fish in this pond</Text>
            <Text style={styles.emptyText}>
              Stock fish first, then you can record mortality.
            </Text>
          </Card>
        ) : (
          <>
            <Text style={styles.label}>Select Batch</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={stockId}
                onValueChange={v => setStockId(String(v || ''))}
                style={styles.picker}
              >
                <Picker.Item label="Select Pond" value="" />
                {batches.map(b => (
                  <Picker.Item
                    key={String(b.id)}
                    label={`${b.RegionId || b.SpeciesName} — ${Number(
                      b.quantity ?? b.Quantity ?? 0,
                    ).toLocaleString()} available`}
                    value={String(b.id)}
                  />
                ))}
              </Picker>
            </View>

            {!!selected && (
              <Card style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Skull size={18} color="#6B7280" />
                  <Text style={styles.infoTitle}>
                    {selected.species || selected.SpeciesName}
                  </Text>
                </View>
                <Text style={styles.availableLine}>
                  Available in pond:{' '}
                  <Text style={styles.availableStrong}>
                    {available.toLocaleString()} fish
                  </Text>
                </Text>
              </Card>
            )}

            {/* <Text style={styles.label}>Number of dead fish</Text>
            <TextInput
              value={deadCount}
              onChangeText={setDeadCount}
              keyboardType="number-pad"
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            /> */}

            <PrimaryButton
              title={submitting ? 'Saving…' : 'Show Summary '}
              onPress={() => navigation.goBack()}
              disabled={submitting}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
  },
  topSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  topSpacer: {
    width: 40,
  },
  body: {
    padding: 16,
    paddingBottom: 32,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  warningCopy: {
    flex: 1,
  },
  warningTitle: {
    fontWeight: '900',
    color: '#92400E',
    marginBottom: 4,
  },
  warningText: {
    color: '#92400E',
    lineHeight: 20,
    fontSize: 13,
  },
  label: {
    color: '#374151',
    fontWeight: '900',
    marginBottom: 8,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  picker: {
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  availableLine: {
    color: '#6B7280',
    fontSize: 14,
  },
  availableStrong: {
    color: '#111827',
    fontWeight: '900',
  },
  emptyTitle: {
    fontWeight: '900',
    color: '#111827',
    marginTop: 8,
  },
  emptyText: {
    color: '#6B7280',
    marginTop: 4,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  fallbackText: {
    textAlign: 'center',
    marginBottom: 16,
    color: '#6B7280',
  },
});
