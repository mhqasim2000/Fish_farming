import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import {
  CalendarDays,
  Fish,
  Leaf,
  Syringe,
  Tag as TagIcon,
  Trash2,
  Wheat,
} from 'lucide-react-native';
import {
  AppScaffold,
  Card,
  EmptyState,
  PrimaryButton,
  StatCard,
  Tag,
} from '../compoents/AppScaffold';
import { farmApi } from '../integration/farmApi';

const tabs = [
  { id: 'fish', label: 'Fish Inventory', icon: Fish },
  { id: 'feed', label: 'Feed Stock', icon: Wheat },
  { id: 'fertilizer', label: 'Fertilizer Stock', icon: Leaf },
  { id: 'treatment', label: 'Disease Treatment', icon: Syringe },
];

const FERTILIZER_CATEGORIES = ['Organic', 'Inorganic', 'Lime'];

const getStockRowId = item => item.InventoryId || item.StockId || item.Id;
const getStockPondId = item =>
  item.PondId || item.CurrentPondId || item.currentPondId || item.pondId;
const getStockSpeciesId = item =>
  item.SpeciesId || item.SpeciesID || item.speciesId;

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const getStockingLimitError = (preview, requestedQuantity) => {
  const payload = preview?.data || preview?.preview || preview || {};
  if (payload.success === false || preview?.success === false) {
    return (
      payload.error ||
      preview?.error ||
      'This stocking quantity is not allowed by the current stocking rules.'
    );
  }

  const allowed =
    payload.allowed ??
    payload.canStock ??
    payload.withinCapacity ??
    payload.isAllowed;
  if (allowed === false) {
    return (
      payload.message ||
      payload.reason ||
      'This stocking quantity exceeds the allowed pond capacity.'
    );
  }

  if (
    payload.exceedsCapacity ||
    payload.overCapacity ||
    payload.isOverCapacity
  ) {
    return (
      payload.message ||
      payload.reason ||
      'This stocking quantity exceeds the allowed pond capacity.'
    );
  }

  const requested = firstFiniteNumber(
    payload.requestedQuantity,
    payload.quantity,
    requestedQuantity,
  );
  const remaining = firstFiniteNumber(
    payload.remainingCapacity,
    payload.remaining,
    payload.availableCapacity,
    payload.available,
    payload.canAdd,
  );
  if (remaining !== null && requested !== null && requested > remaining) {
    return `Only ${Math.max(
      0,
      Math.floor(remaining),
    ).toLocaleString()} more fish can be added to this pond.`;
  }

  const capacity = firstFiniteNumber(
    payload.maxAllowed,
    payload.totalCapacity,
    payload.capacity,
    payload.maxCapacity,
    payload.maxTotalFish,
    payload.recommendedMaxFish,
    payload.limit,
  );
  const current = firstFiniteNumber(
    payload.currentStock,
    payload.currentQuantity,
    payload.totalStocked,
    payload.currentPondStock,
    payload.currentFish,
  );
  if (
    capacity !== null &&
    requested !== null &&
    current !== null &&
    current + requested > capacity
  ) {
    return `This would stock ${(current + requested).toLocaleString()} fish, but the pond limit is ${Math.floor(
      capacity,
    ).toLocaleString()} fish.`;
  }

  return null;
};

const normalizeFishStockRow = item => {
  const stockId = getStockRowId(item);
  return {
    ...item,
    InventoryId: stockId,
    StockId: item.StockId || stockId,
    PondId: getStockPondId(item),
    SpeciesId: getStockSpeciesId(item),
    SpeciesName: item.SpeciesName || item.Name || item.speciesName || 'Fish',
    Quantity: Number(item.Quantity || item.quantity || 0),
    CurrentSizeInches:
      item.CurrentSizeInches ??
      item.currentSizeInches ??
      item.CurrentSizeInch ??
      item.currentSize,
    TargetSizeInches:
      item.TargetSizeInches ??
      item.targetSizeInches ??
      item.TargetSizeInch ??
      item.targetSize,
    PondName: item.PondName || item.CurrentPondName || item.pondName,
  };
};

const mergeFishStockRows = (...groups) => {
  const byStockId = {};
  groups
    .flat()
    .filter(Boolean)
    .map(normalizeFishStockRow)
    .forEach(item => {
      const stockId = getStockRowId(item);
      if (!stockId || !item.PondId || item.Quantity <= 0) return;
      byStockId[String(stockId)] = {
        ...(byStockId[String(stockId)] || {}),
        ...item,
      };
    });
  return Object.values(byStockId);
};

function formatStockDate(value) {
  if (value == null || value === '') return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function StockManagementScreen({ navigation, route }) {
  const initialPondId =
    route?.params?.initialPondId ??
    route?.params?.transferFromPondId ??
    route?.params?.pond?.id ??
    route?.params?.pond?.PondId ??
    '';
  const openedFromPondCard = route?.params?.source === 'dashboard-card';
  const [activeTab, setActiveTab] = useState('fish');
  const [inventory, setInventory] = useState([]);
  const [feedStock, setFeedStock] = useState([]);
  const [fertilizerStock, setFertilizerStock] = useState([]);
  const [treatmentStock, setTreatmentStock] = useState([]);
  const [stats, setStats] = useState({
    totalStock: 0,
    totalValue: 0,
    speciesVariety: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [saleModal, setSaleModal] = useState(null);
  const [ponds, setPonds] = useState([]);
  const [knownSpecies, setKnownSpecies] = useState([]);
  const [feedTypes, setFeedTypes] = useState([]);
  const [fertilizerProducts, setFertilizerProducts] = useState([]);
  const [treatmentTypes, setTreatmentTypes] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        summary,
        fishItems,
        feeds,
        fertilizers,
        treatments,
        pondItems,
        speciesItems,
        feedTypeItems,
        fertProducts,
        stockingItems,
        treatmentTypeItems,
      ] = await Promise.all([
        farmApi.getInventorySummary().catch(() => ({})),
        farmApi.getInventory().catch(() => []),
        farmApi.getFeedStock().catch(() => []),
        farmApi.getFertilizerStock().catch(() => []),
        farmApi.getTreatmentStock().catch(() => []),
        farmApi.getPonds().catch(() => []),
        farmApi.getApprovedSpecies().catch(() => []),
        farmApi.getFeedTypes().catch(() => []),
        farmApi.getFertilizerProducts().catch(() => []),
        farmApi.getStocking().catch(() => []),
        farmApi.getTreatmentTypes().catch(() => []),
      ]);
      setStats({
        totalStock: summary.TotalStock || 0,
        totalValue: summary.TotalValue || 0,
        speciesVariety: summary.SpeciesVariety || 0,
      });
      setInventory(mergeFishStockRows(fishItems || [], stockingItems || []));
      setFeedStock(feeds || []);
      setFertilizerStock(fertilizers || []);
      setTreatmentStock(treatments || []);
      setPonds(pondItems || []);
      setKnownSpecies(speciesItems || []);
      setFeedTypes(feedTypeItems || []);
      setFertilizerProducts(fertProducts || []);
      setTreatmentTypes(treatmentTypeItems || []);
    } catch (error) {
      Alert.alert('Stock', error.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!openedFromPondCard) return;
    setActiveTab('fish');
    if (route?.params?.action === 'transfer') {
      setShowTransfer(true);
    } else if (route?.params?.action === 'addFish') {
      setShowAdd(true);
    }
  }, [openedFromPondCard, route?.params?.action, initialPondId]);

  const deleteItem = (type, item) => {
    const name =
      item.SpeciesName || item.FeedType || item.ProductName || 'entry';
    Alert.alert('Remove Stock', `Remove stock entry for ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (type === 'fish')
            await farmApi.deleteInventory(item.InventoryId || item.Id);
          if (type === 'feed')
            await farmApi.deleteFeedStock(
              item.StockId || item.FeedStockId || item.Id,
            );
          if (type === 'fertilizer')
            await farmApi.deleteFertilizerStock(
              item.StockId || item.FertilizerStockId || item.Id,
            );
          if (type === 'treatment')
            await farmApi.deleteTreatmentStock(item.StockId || item.Id);
          fetchData();
        },
      },
    ]);
  };

  const totalFeedInventory = feedStock.reduce(
    (acc, curr) => acc + Number(curr.CurrentQuantity_kg || 0),
    0,
  );
  const totalFeedValue = feedStock.reduce(
    (acc, curr) => acc + Number(curr.TotalCost || 0),
    0,
  );
  const totalFertInventory = fertilizerStock.reduce(
    (acc, curr) => acc + Number(curr.CurrentQuantity_kg || 0),
    0,
  );
  const totalFertValue = fertilizerStock.reduce(
    (acc, curr) => acc + Number(curr.TotalCost || 0),
    0,
  );
  const totalTreatmentValue = treatmentStock.reduce(
    (acc, curr) => acc + Number(curr.TotalCost || 0),
    0,
  );

  const handleUpdateSale = async saleData => {
    try {
      await farmApi.toggleForSale(
        saleData.batchId,
        saleData.isForSale,
        saleData.quantityForSale,
        saleData.salePricePerUnit,
      );
      setSaleModal(null);
      fetchData();
    } catch (error) {
      Alert.alert('Sale', error.message || 'Could not update sale status.');
    }
  };
  const closeDashboardLaunchedAdd = () => {
    setShowAdd(false);
    if (openedFromPondCard) {
      navigation.goBack();
    }
  };
  const closeDashboardLaunchedTransfer = () => {
    setShowTransfer(false);
    if (openedFromPondCard) {
      navigation.goBack();
    }
  };
  const handleAddSaved = () => {
    fetchData();
    if (openedFromPondCard) {
      navigation.goBack();
    } else {
      setShowAdd(false);
    }
  };
  const handleTransferSaved = () => {
    fetchData();
    if (openedFromPondCard) {
      navigation.goBack();
    } else {
      setShowTransfer(false);
    }
  };

  return (
    <AppScaffold
      title="Stock Management"
      subtitle="Track inventory, stocking events, and transfers"
      navigation={navigation}
      currentRoute="StockManagement"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, active && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Icon size={16} color={active ? '#FFFFFF' : '#6B7280'} />
              <Text style={[styles.tabText, active && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <PrimaryButton
        title={`+ Add ${
          activeTab === 'fish'
            ? 'Fish'
            : activeTab === 'feed'
            ? 'Feed'
            : activeTab === 'fertilizer'
            ? 'Fertilizer'
            : 'Treatment'
        } Stock`}
        onPress={() => setShowAdd(true)}
        style={styles.addButton}
      />
      {activeTab === 'fish' && (
        <PrimaryButton
          title="Transfer Fish Stock"
          onPress={() => setShowTransfer(true)}
          style={styles.addButton}
        />
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <>
          {activeTab === 'fish' && (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Total Stock"
                  value={`${Number(
                    stats.totalStock || 0,
                  ).toLocaleString()} fish`}
                />
                <StatCard
                  label="Investment"
                  value={`PKR ${Number(
                    stats.totalValue || 0,
                  ).toLocaleString()}`}
                  accent="#059669"
                />
                <StatCard
                  label="Variety"
                  value={`${stats.speciesVariety || 0} species`}
                  accent="#111827"
                />
              </View>
              <InventoryList
                data={inventory}
                type="fish"
                onDelete={deleteItem}
                onSale={setSaleModal}
              />
            </>
          )}

          {activeTab === 'feed' && (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Feed Available"
                  value={`${totalFeedInventory.toLocaleString()} kg`}
                  accent="#B45309"
                />
                <StatCard
                  label="Feed Value"
                  value={`PKR ${totalFeedValue.toLocaleString()}`}
                  accent="#B45309"
                />
              </View>
              <InventoryList
                data={feedStock}
                type="feed"
                onDelete={deleteItem}
              />
            </>
          )}

          {activeTab === 'fertilizer' && (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Fertilizer Available"
                  value={`${totalFertInventory.toLocaleString()} kg`}
                  accent="#059669"
                />
                <StatCard
                  label="Fertilizer Value"
                  value={`PKR ${totalFertValue.toLocaleString()}`}
                  accent="#059669"
                />
              </View>
              <InventoryList
                data={fertilizerStock}
                type="fertilizer"
                onDelete={deleteItem}
              />
            </>
          )}

          {activeTab === 'treatment' && (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Treatment Items"
                  value={`${treatmentStock.length} medicines`}
                  accent="#E11D48"
                />
                <StatCard
                  label="Treatment Value"
                  value={`PKR ${totalTreatmentValue.toLocaleString()}`}
                  accent="#E11D48"
                />
              </View>
              <InventoryList
                data={treatmentStock}
                type="treatment"
                onDelete={deleteItem}
              />
            </>
          )}
        </>
      )}

      <AddStockModal
        visible={showAdd}
        type={activeTab}
        ponds={ponds}
        inventory={inventory}
        knownSpecies={knownSpecies}
        feedTypes={feedTypes}
        fertilizerProducts={fertilizerProducts}
        treatmentTypes={treatmentTypes}
        initialPondId={initialPondId}
        onClose={closeDashboardLaunchedAdd}
        onSaved={handleAddSaved}
      />
      <TransferFishModal
        visible={showTransfer}
        inventory={inventory}
        ponds={ponds}
        initialFromPondId={initialPondId}
        initialSpeciesId={route?.params?.transferSpeciesId}
        initialStockId={route?.params?.transferStockId}
        initialQuantity={route?.params?.transferQuantity}
        onClose={closeDashboardLaunchedTransfer}
        onSaved={handleTransferSaved}
      />
      <SaleStockModal
        visible={!!saleModal}
        batch={saleModal}
        onClose={() => setSaleModal(null)}
        onUpdate={handleUpdateSale}
      />
    </AppScaffold>
  );
}

function InventoryList({ data, type, onDelete, onSale }) {
  if (!data.length) {
    return (
      <EmptyState
        title="No stock entries"
        text="Add stock to begin tracking inventory."
      />
    );
  }

  return data.map(item => {
    const title =
      item.SpeciesName ||
      item.FeedType ||
      item.ProductName ||
      item.MedicineName ||
      item.Name ||
      'Stock Entry';
    const quantity =
      item.Quantity || item.CurrentQuantity_kg || item.CurrentQuantity || 0;
    const unit =
      type === 'fish'
        ? 'fish'
        : type === 'treatment'
        ? item.Unit || 'units'
        : 'kg';
    const value =
      type === 'fish'
        ? Number(item.Quantity || 0) *
          Number(item.CostPerUnit_PKR || item.PricePerPiece || 0)
        : item.TotalCost || item.Cost || item.TotalValue || 0;

    return (
      <Card
        key={
          item.InventoryId ||
          item.StockId ||
          item.FeedStockId ||
          item.FertilizerStockId ||
          title
        }
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleWrap}>
            <Text style={styles.itemTitle}>{title}</Text>
            <Text style={styles.itemMeta}>
              {item.PondName ||
                item.Supplier ||
                item.Source ||
                'Farm inventory'}
            </Text>
          </View>
          <Tag>{type}</Tag>
        </View>
        <Metric
          label="Quantity"
          value={`${Number(quantity || 0).toLocaleString()} ${unit}`}
        />
        <Metric
          label="Value"
          value={`PKR ${Number(value || 0).toLocaleString()}`}
        />
        {type === 'fertilizer' && (
          <Metric label="Category" value={item.Category || 'Fertilizer'} />
        )}
        {type === 'treatment' && (
          <>
            <Metric label="Category" value={item.Category || 'Treatment'} />
            <Metric
              label="Unit cost"
              value={`PKR ${Number(item.CostPerUnit || 0).toLocaleString()} / ${
                item.Unit || 'unit'
              }`}
            />
          </>
        )}
        {(type === 'fertilizer' || type === 'feed' || type === 'treatment') && (
          <Metric
            label="Purchase date"
            value={formatStockDate(item.PurchaseDate)}
          />
        )}
        {!!item.ExpiryDate && (
          <Metric
            label="Expiry"
            value={`${formatStockDate(item.ExpiryDate)}${
              item.IsExpired ? ' (Expired)' : ''
            }`}
          />
        )}
        {(type === 'feed' || type === 'fertilizer' || type === 'treatment') &&
          Number(quantity || 0) < 50 && (
            <Text style={styles.lowStockText}>Low stock</Text>
          )}
        {!!item.Notes && <Text style={styles.notes}>{item.Notes}</Text>}
        {type === 'fish' && (
          <TouchableOpacity
            style={styles.saleButton}
            onPress={() =>
              onSale?.({
                batchId: item.InventoryId || item.StockId,
                speciesName: item.SpeciesName,
                maxQuantity: Number(item.Quantity || 0),
                currentSaleQty: Number(item.QuantityForSale || 0),
                currentSalePrice: item.SalePricePerUnit || '',
                isForSale: Boolean(item.IsForSale),
              })
            }
          >
            <TagIcon size={16} color="#1D4ED8" />
            <Text style={styles.saleButtonText}>
              {item.IsForSale
                ? `For sale (${item.QuantityForSale || 0})`
                : 'Sell'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete(type, item)}
        >
          <Trash2 size={16} color="#DC2626" />
          <Text style={styles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </Card>
    );
  });
}

function AddStockModal({
  visible,
  type,
  ponds,
  inventory,
  knownSpecies,
  feedTypes,
  fertilizerProducts,
  treatmentTypes,
  initialPondId,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState('');
  const [pondId, setPondId] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [unknownSpecies, setUnknownSpecies] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [fishWeightG, setFishWeightG] = useState('');
  const [saving, setSaving] = useState(false);
  const [customFeedType, setCustomFeedType] = useState('');
  const [compatibilityNote, setCompatibilityNote] = useState('');
  const [isSpeciesCompatible, setIsSpeciesCompatible] = useState(true);
  const [fertCategory, setFertCategory] = useState('');
  const [fertProductIndex, setFertProductIndex] = useState('');
  const [customFertCategory, setCustomFertCategory] = useState('');
  const [customFertProduct, setCustomFertProduct] = useState('');
  const [fertCostPerKg, setFertCostPerKg] = useState('');
  const [fertSupplier, setFertSupplier] = useState('');
  const [treatmentCategory, setTreatmentCategory] = useState('Chemical');
  const [treatmentUnit, setTreatmentUnit] = useState('ml');
  const [treatmentCostPerUnit, setTreatmentCostPerUnit] = useState('');
  const [customTreatmentName, setCustomTreatmentName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date());
  const [showFertDatePicker, setShowFertDatePicker] = useState(false);

  const filteredFertProducts = useMemo(() => {
    if (!fertCategory) return [];
    return (fertilizerProducts || []).filter(
      p => String(p.Category) === String(fertCategory),
    );
  }, [fertilizerProducts, fertCategory]);
  const lockedPond =
    type === 'fish' && initialPondId
      ? (ponds || []).find(
          pond => String(pond.PondId || pond.id) === String(initialPondId),
        )
      : null;
  const selectedPond = useMemo(
    () =>
      type === 'fish'
        ? (ponds || []).find(
            pond => String(pond.PondId || pond.id) === String(pondId),
          )
        : null,
    [pondId, ponds, type],
  );
  const selectedSpecies = useMemo(
    () =>
      type === 'fish'
        ? (knownSpecies || []).find(
            item => String(item.SpeciesId) === String(speciesId),
          )
        : null,
    [knownSpecies, speciesId, type],
  );
  const getLocalStockingLimitError = qty => {
    if (type !== 'fish' || !selectedPond) {
      return null;
    }

    const pondSize = Number(selectedPond.Size || selectedPond.size || 0);
    if (!Number.isFinite(pondSize) || pondSize <= 0) {
      return null;
    }

    const currentPondFish = (inventory || [])
      .filter(item => String(getStockPondId(item)) === String(pondId))
      .reduce((sum, item) => sum + Number(item.Quantity || 0), 0);
    const currentSpeciesFish = (inventory || [])
      .filter(
        item =>
          String(getStockPondId(item)) === String(pondId) &&
          String(getStockSpeciesId(item)) === String(speciesId),
      )
      .reduce((sum, item) => sum + Number(item.Quantity || 0), 0);

    const pondDensity = Number(
      selectedPond.MaxFishPerAcre || selectedPond.maxFishPerAcre || 0,
    );
    const speciesDensity = Number(
      selectedSpecies?.MaxStockingDensity ||
        selectedSpecies?.maxStockingDensity ||
        0,
    );

    if (speciesDensity > 0) {
      const speciesLimit = Math.floor(speciesDensity * pondSize);
      if (currentSpeciesFish + qty > speciesLimit) {
        return `${selectedSpecies?.Name || 'This species'} is limited to ${speciesLimit.toLocaleString()} fish in this ${pondSize.toLocaleString()} acre pond. You can add ${Math.max(
          0,
          speciesLimit - currentSpeciesFish,
        ).toLocaleString()} more.`;
      }
    }

    if (pondDensity > 0) {
      const pondLimit = Math.floor(pondDensity * pondSize);
      if (currentPondFish + qty > pondLimit) {
        return `This pond is limited to ${pondLimit.toLocaleString()} total fish. You can add ${Math.max(
          0,
          pondLimit - currentPondFish,
        ).toLocaleString()} more.`;
      }
    }

    return null;
  };

  useEffect(() => {
    if (visible && type === 'fish' && initialPondId) {
      setPondId(String(initialPondId));
    }
  }, [visible, type, initialPondId]);

  useEffect(() => {
    setFertProductIndex('');
  }, [fertCategory]);

  const reset = () => {
    setName('');
    setPondId(initialPondId && type === 'fish' ? String(initialPondId) : '');
    setSpeciesId('');
    setUnknownSpecies('');
    setQuantity('');
    setCost('');
    setNotes('');
    setFishWeightG('');
    setCustomFeedType('');
    setCompatibilityNote('');
    setFertCategory('');
    setFertProductIndex('');
    setCustomFertCategory('');
    setCustomFertProduct('');
    setFertCostPerKg('');
    setFertSupplier('');
    setTreatmentCategory('Chemical');
    setTreatmentUnit('ml');
    setTreatmentCostPerUnit('');
    setCustomTreatmentName('');
    setPurchaseDate(new Date());
    setShowFertDatePicker(false);
  };

  useEffect(() => {
    if (type !== 'fish' || !pondId || !speciesId || speciesId === '__new__') {
      setCompatibilityNote('');
      setIsSpeciesCompatible(true);
      return;
    }

    let mounted = true;
    setCompatibilityNote('');
    setIsSpeciesCompatible(true);

    farmApi
      .checkPondCompatibility(Number(pondId), Number(speciesId))
      .then(result => {
        if (!mounted) return;
        const compatible =
          result?.compatible ?? result?.compatibility?.isCompatible;
        if (compatible === undefined) {
          // Fallback: use old method
          const pond = (ponds || []).find(
            item => String(item.PondId) === String(pondId),
          );
          const existingSpecies = (pond?.species || [])
            .map(item => item.SpeciesName || item.species)
            .filter(Boolean);
          if (!existingSpecies.length) {
            setCompatibilityNote(
              'No stocked fish in pond yet. Compatibility check is not required.',
            );
            return;
          }
          setCompatibilityNote(
            'Compatibility data unavailable for this species.',
          );
          return;
        }

        if (compatible) {
          setIsSpeciesCompatible(true);
          setCompatibilityNote(
            result.message ||
              'Compatible with fish currently stocked in this pond.',
          );
        } else {
          setIsSpeciesCompatible(false);
          const conflicts = result.incompatibleWith || [];
          const incompatibleNames = conflicts
            .map(item => item.speciesName || item.Name)
            .filter(Boolean);
          const reasons = conflicts
            .flatMap(item => item.reasons || item.reason || [])
            .filter(Boolean);
          const reasonText = reasons.length
            ? `\n\nReason: ${reasons.join(' ')}`
            : '';
          if (incompatibleNames.length) {
            setCompatibilityNote(
              `Warning: This species cannot live with: ${incompatibleNames.join(
                ', ',
              )}. Stocking is blocked.${reasonText}`,
            );
          } else {
            setCompatibilityNote(
              result?.message ||
                result?.compatibility?.message ||
                'Warning: Compatibility check failed. Stocking is blocked.',
            );
          }
        }
      })
      .catch(() => {
        if (mounted)
          setCompatibilityNote(
            'Compatibility data unavailable for this species.',
          );
      });

    return () => {
      mounted = false;
    };
  }, [pondId, speciesId, type, ponds]);

  const submit = async () => {
    if (type === 'fish') {
      if (!pondId || !quantity || (!speciesId && !unknownSpecies.trim())) {
        Alert.alert('Stock', 'Please select pond, species, and quantity.');
        return;
      }
      if (compatibilityNote.startsWith('Warning:')) {
        Alert.alert('Species Compatibility', compatibilityNote);
        return;
      }
      if (!isSpeciesCompatible) {
        Alert.alert(
          'Species Compatibility',
          compatibilityNote ||
            'Selected species is not compatible with this pond.',
        );
        return;
      }
    } else if (type === 'feed') {
      const resolvedFeedType =
        name === '__custom__' ? customFeedType.trim() : name;
      if (!resolvedFeedType || !quantity) {
        Alert.alert('Stock', 'Please select feed type and quantity.');
        return;
      }
    } else if (type === 'fertilizer') {
      if (!quantity || Number(quantity) <= 0) {
        Alert.alert('Stock', 'Please enter quantity.');
        return;
      }
      if (
        fertCostPerKg === '' ||
        Number(fertCostPerKg) < 0 ||
        Number.isNaN(Number(fertCostPerKg))
      ) {
        Alert.alert('Stock', 'Please enter cost per kg.');
        return;
      }
      if (fertProductIndex === '__custom__') {
        if (!customFertCategory.trim() || !customFertProduct.trim()) {
          Alert.alert(
            'Stock',
            'Please enter fertilizer category and product name.',
          );
          return;
        }
      } else {
        if (!fertCategory) {
          Alert.alert('Stock', 'Please select category.');
          return;
        }
        if (!fertProductIndex) {
          Alert.alert('Stock', 'Please select a product.');
          return;
        }
      }
    } else if (type === 'treatment') {
      const medicineName =
        name === '__custom__' ? customTreatmentName.trim() : name.trim();
      if (!medicineName) {
        Alert.alert('Stock', 'Please select or enter a treatment name.');
        return;
      }
      if (!quantity || Number(quantity) <= 0) {
        Alert.alert('Stock', 'Please enter treatment quantity.');
        return;
      }
      if (
        treatmentCostPerUnit === '' ||
        Number(treatmentCostPerUnit) < 0 ||
        Number.isNaN(Number(treatmentCostPerUnit))
      ) {
        Alert.alert('Stock', 'Please enter cost per unit.');
        return;
      }
    }

    setSaving(true);
    try {
      if (type === 'fish') {
        if (speciesId === '__new__') {
          Alert.alert(
            'Stock',
            'Unknown species cannot be stocked directly. Add or approve the species first, then stock it into the pond.',
          );
          setSaving(false);
          return;
        }
        const qty = Number(quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          Alert.alert('Stock', 'Please enter a valid fish quantity.');
          setSaving(false);
          return;
        }

        let stockingPreview = null;
        try {
          stockingPreview = await farmApi.getStockingPreview(
            Number(pondId),
            Number(speciesId),
            qty,
          );
        } catch (error) {
          Alert.alert(
            'Stocking Limit',
            error.message ||
              'Could not verify the stocking limit. The fish were not saved.',
          );
          setSaving(false);
          return;
        }

        const limitError = getStockingLimitError(stockingPreview, qty);
        if (limitError) {
          Alert.alert('Stocking Limit Exceeded', limitError);
          setSaving(false);
          return;
        }

        const localLimitError = getLocalStockingLimitError(qty);
        if (localLimitError) {
          Alert.alert('Stocking Limit Exceeded', localLimitError);
          setSaving(false);
          return;
        }

        const totalCost = Number(cost || 0);
        const pricePerPiece = qty > 0 ? totalCost / qty : 0;
        const currentSizeInches = Number(fishWeightG || 0);
        await farmApi.stockFish({
          pondId: Number(pondId),
          speciesId: Number(speciesId),
          quantity: qty,
          pricePerPiece,
          currentSize:
            Number.isFinite(currentSizeInches) && currentSizeInches > 0
              ? currentSizeInches
              : 2,
          targetSize: 20,
          stockingDate: new Date().toISOString(),
        });
      } else if (type === 'feed') {
        const resolvedFeedType =
          name === '__custom__' ? customFeedType.trim() : name;
        await farmApi.addFeedStock({
          feedType: resolvedFeedType,
          quantity_kg: Number(quantity),
          totalCost: Number(cost || 0),
          supplier: notes || 'Farm',
        });
      } else if (type === 'fertilizer') {
        let category;
        let productName;
        if (fertProductIndex === '__custom__') {
          category = customFertCategory.trim();
          productName = customFertProduct.trim();
        } else {
          const p = filteredFertProducts[Number(fertProductIndex)];
          if (!p) throw new Error('Invalid product selection.');
          category = p.Category;
          productName = p.Product;
        }
        await farmApi.addFertilizerStock({
          category,
          productName,
          quantity_kg: Number(quantity),
          costPerKg: Number(fertCostPerKg),
          supplier: fertSupplier.trim(),
          purchaseDate: purchaseDate.toISOString(),
        });
      } else {
        const medicineName =
          name === '__custom__' ? customTreatmentName.trim() : name.trim();
        await farmApi.addTreatmentStock({
          medicineName,
          category: treatmentCategory,
          quantity: Number(quantity),
          unit: treatmentUnit,
          costPerUnit: Number(treatmentCostPerUnit || 0),
          supplier: notes || 'Farm',
          purchaseDate: purchaseDate.toISOString(),
          notes,
        });
      }
      reset();
      onSaved();
    } catch (error) {
      Alert.alert('Stock', error.message || 'Could not save stock entry.');
    } finally {
      setSaving(false);
    }
  };

  const fertQty = Number(quantity || 0);
  const fertUnitCost = Number(fertCostPerKg || 0);
  const fertTotalInvestment =
    Number.isFinite(fertQty) && Number.isFinite(fertUnitCost)
      ? fertQty * fertUnitCost
      : 0;

  const onFertDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowFertDatePicker(false);
      if (event.type === 'dismissed') {
        return;
      }
    }
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            (type === 'fertilizer' || type === 'treatment') &&
              styles.modalCardTall,
          ]}
        >
          {type === 'fertilizer' ? (
            <>
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalHeaderTextWrap}>
                  <Text
                    style={[styles.modalTitle, styles.modalTitleFertilizer]}
                  >
                    Add Fertilizer Stock
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Record a new fertilizer purchase
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.modalCloseHit}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.modalClose}>×</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                <Text style={styles.label}>Category *</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={fertCategory}
                    onValueChange={value =>
                      setFertCategory(String(value || ''))
                    }
                    style={styles.picker}
                  >
                    <Picker.Item label="Select category" value="" />
                    {FERTILIZER_CATEGORIES.map(cat => (
                      <Picker.Item key={cat} label={cat} value={cat} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Product name *</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={fertProductIndex}
                    onValueChange={value =>
                      setFertProductIndex(String(value || ''))
                    }
                    style={styles.picker}
                  >
                    <Picker.Item
                      label={
                        fertCategory
                          ? 'Select product'
                          : 'Select category first'
                      }
                      value=""
                    />
                    {filteredFertProducts.map((p, idx) => (
                      <Picker.Item
                        key={`${p.Product}-${idx}`}
                        label={p.Product}
                        value={String(idx)}
                      />
                    ))}
                    <Picker.Item
                      label="Custom (manual entry)"
                      value="__custom__"
                    />
                  </Picker>
                </View>
                {fertProductIndex === '__custom__' && (
                  <>
                    <Text style={styles.label}>Category *</Text>
                    <TextInput
                      value={customFertCategory}
                      onChangeText={setCustomFertCategory}
                      style={styles.input}
                      placeholder="e.g. Inorganic"
                    />
                    <Text style={styles.label}>Product name *</Text>
                    <TextInput
                      value={customFertProduct}
                      onChangeText={setCustomFertProduct}
                      style={styles.input}
                      placeholder="e.g. NPK Fertilizer"
                    />
                  </>
                )}

                <Text style={styles.label}>Quantity (KG) *</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                <Text style={styles.label}>Cost per KG (PKR) *</Text>
                <TextInput
                  value={fertCostPerKg}
                  onChangeText={setFertCostPerKg}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                <Text style={styles.label}>Date *</Text>
                <TouchableOpacity
                  style={styles.dateInputRow}
                  onPress={() => setShowFertDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateInputText}>
                    {formatStockDate(purchaseDate)}
                  </Text>
                  <CalendarDays size={20} color="#6B7280" />
                </TouchableOpacity>
                {showFertDatePicker && Platform.OS === 'ios' && (
                  <>
                    <DateTimePicker
                      value={purchaseDate}
                      mode="date"
                      display="inline"
                      onChange={onFertDateChange}
                    />
                    <TouchableOpacity
                      style={styles.dateDoneButton}
                      onPress={() => setShowFertDatePicker(false)}
                    >
                      <Text style={styles.dateDoneText}>Done</Text>
                    </TouchableOpacity>
                  </>
                )}

                <Text style={styles.label}>Supplier (optional)</Text>
                <TextInput
                  value={fertSupplier}
                  onChangeText={setFertSupplier}
                  style={styles.input}
                  placeholder="Supplier name"
                  placeholderTextColor="#9CA3AF"
                />

                <View style={styles.totalInvestmentBar}>
                  <Text style={styles.totalInvestmentLabel}>
                    TOTAL INVESTMENT
                  </Text>
                  <Text style={styles.totalInvestmentValue}>
                    PKR{' '}
                    {fertTotalInvestment.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>

                <PrimaryButton
                  title={saving ? 'Saving...' : 'Save Stock'}
                  onPress={submit}
                  disabled={saving}
                />
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
              {showFertDatePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={purchaseDate}
                  mode="date"
                  display="default"
                  onChange={onFertDateChange}
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>
                Add{' '}
                {type === 'fish'
                  ? 'Fish'
                  : type === 'feed'
                  ? 'Feed'
                  : 'Treatment'}{' '}
                Stock
              </Text>
              {type === 'fish' ? (
                <>
                  <Text style={styles.label}>Pond</Text>
                  {lockedPond ? (
                    <View style={styles.lockedPondBox}>
                      <Text style={styles.lockedPondLabel}>
                        Selected from dashboard
                      </Text>
                      <Text style={styles.lockedPondName}>
                        {lockedPond.PondName ||
                          lockedPond.pondName ||
                          `Pond ${initialPondId}`}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.pickerWrap}>
                      <Picker
                        selectedValue={pondId}
                        onValueChange={value => setPondId(String(value || ''))}
                        style={styles.picker}
                      >
                        <Picker.Item label="Select pond" value="" />
                        {(ponds || []).map(pond => (
                          <Picker.Item
                            key={String(pond.PondId)}
                            label={pond.PondName || `Pond ${pond.PondId}`}
                            value={String(pond.PondId)}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}

                  <Text style={styles.label}>Species</Text>
                  <View style={styles.pickerWrap}>
                    <Picker
                      selectedValue={speciesId}
                      onValueChange={value => setSpeciesId(String(value || ''))}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select known species" value="" />
                      {(knownSpecies || []).map(item => (
                        <Picker.Item
                          key={String(item.SpeciesId)}
                          label={item.Name}
                          value={String(item.SpeciesId)}
                        />
                      ))}
                      <Picker.Item
                        label="+ Add new unknown species"
                        value="__new__"
                      />
                    </Picker>
                  </View>

                  {speciesId === '__new__' && (
                    <>
                      <Text style={styles.label}>New Species Name</Text>
                      <TextInput
                        value={unknownSpecies}
                        onChangeText={setUnknownSpecies}
                        style={styles.input}
                        placeholder="Enter unknown species name"
                      />
                    </>
                  )}
                  {!!compatibilityNote && (
                    <Text style={styles.compatibilityText}>
                      {compatibilityNote}
                    </Text>
                  )}
                </>
              ) : type === 'feed' ? (
                <>
                  <Text style={styles.label}>Feed Type</Text>
                  <View style={styles.pickerWrap}>
                    <Picker
                      selectedValue={name}
                      onValueChange={value => setName(String(value || ''))}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select feed type" value="" />
                      {(feedTypes || []).map(feedType => (
                        <Picker.Item
                          key={feedType}
                          label={feedType}
                          value={feedType}
                        />
                      ))}
                      <Picker.Item
                        label="+ Add custom feed type"
                        value="__custom__"
                      />
                    </Picker>
                  </View>
                  {name === '__custom__' && (
                    <TextInput
                      value={customFeedType}
                      onChangeText={setCustomFeedType}
                      style={styles.input}
                      placeholder="Enter custom feed type"
                    />
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.label}>Medicine / Treatment</Text>
                  <View style={styles.pickerWrap}>
                    <Picker
                      selectedValue={name}
                      onValueChange={value => {
                        const nextName = String(value || '');
                        setName(nextName);
                        const selected = (treatmentTypes || []).find(
                          item => item.name === nextName,
                        );
                        if (selected?.category) {
                          setTreatmentCategory(selected.category);
                        }
                      }}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select medicine" value="" />
                      {(treatmentTypes || []).map(item => (
                        <Picker.Item
                          key={`${item.category}-${item.name}`}
                          label={`${item.name} (${item.category})`}
                          value={item.name}
                        />
                      ))}
                      <Picker.Item
                        label="+ Add custom treatment"
                        value="__custom__"
                      />
                    </Picker>
                  </View>
                  {name === '__custom__' && (
                    <TextInput
                      value={customTreatmentName}
                      onChangeText={setCustomTreatmentName}
                      style={styles.input}
                      placeholder="Enter treatment name"
                      placeholderTextColor="#9CA3AF"
                    />
                  )}
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.pickerWrap}>
                    <Picker
                      selectedValue={treatmentCategory}
                      onValueChange={value =>
                        setTreatmentCategory(String(value || 'Chemical'))
                      }
                      style={styles.picker}
                    >
                      {[
                        'Chemical',
                        'Natural',
                        'Antibiotic',
                        'Pesticide',
                        'Supplement',
                        'Other',
                      ].map(category => (
                        <Picker.Item
                          key={category}
                          label={category}
                          value={category}
                        />
                      ))}
                    </Picker>
                  </View>
                  <Text style={styles.label}>Unit</Text>
                  <View style={styles.pickerWrap}>
                    <Picker
                      selectedValue={treatmentUnit}
                      onValueChange={value =>
                        setTreatmentUnit(String(value || 'ml'))
                      }
                      style={styles.picker}
                    >
                      {[
                        'ml',
                        'L',
                        'g',
                        'kg',
                        'tablets',
                        'packets',
                        'bottles',
                      ].map(unit => (
                        <Picker.Item key={unit} label={unit} value={unit} />
                      ))}
                    </Picker>
                  </View>
                </>
              )}
              <Text style={styles.label}>
                Quantity (
                {type === 'fish'
                  ? 'fish'
                  : type === 'treatment'
                  ? treatmentUnit
                  : 'kg'}
                )
              </Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                style={styles.input}
              />
              {type === 'fish' && (
                <>
                  <Text style={styles.label}>
                    Current size (inches, optional)
                  </Text>
                  <Text style={styles.helperHint}>
                    Used for growth tracking. If empty, 2 inches is used as the
                    starting size.
                  </Text>
                  <TextInput
                    value={fishWeightG}
                    onChangeText={setFishWeightG}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="e.g. 2.5"
                    placeholderTextColor="#9CA3AF"
                  />
                </>
              )}
              {type === 'treatment' ? (
                <>
                  <Text style={styles.label}>
                    Cost per {treatmentUnit} (PKR)
                  </Text>
                  <TextInput
                    value={treatmentCostPerUnit}
                    onChangeText={setTreatmentCostPerUnit}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Total cost (PKR)</Text>
                  {type !== 'fish' && (
                    <Text style={styles.helperHint}>
                      Stored as cost per kg (total ÷ quantity).
                    </Text>
                  )}
                  <TextInput
                    value={cost}
                    onChangeText={setCost}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                </>
              )}
              <Text style={styles.label}>Notes / supplier</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, styles.textArea]}
                multiline
              />
              <PrimaryButton
                title={saving ? 'Saving...' : 'Save Stock'}
                onPress={submit}
                disabled={saving}
              />
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SaleStockModal({ visible, batch, onClose, onUpdate }) {
  const [quantityForSale, setQuantityForSale] = useState('');
  const [salePricePerUnit, setSalePricePerUnit] = useState('');
  const maxQuantity = Number(batch?.maxQuantity || 0);

  useEffect(() => {
    if (visible && batch) {
      setQuantityForSale(
        batch.currentSaleQty ? String(batch.currentSaleQty) : '',
      );
      setSalePricePerUnit(
        batch.currentSalePrice ? String(batch.currentSalePrice) : '',
      );
    }
  }, [visible, batch]);

  if (!visible || !batch) return null;

  const submit = () => {
    const qty = Math.floor(Number(quantityForSale || 0));
    const price = salePricePerUnit === '' ? null : Number(salePricePerUnit);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Sale', 'Enter quantity to sell.');
      return;
    }
    if (qty > maxQuantity) {
      Alert.alert(
        'Sale',
        `Only ${maxQuantity.toLocaleString()} fish are available.`,
      );
      return;
    }
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      Alert.alert('Sale', 'Enter a valid sale price.');
      return;
    }
    onUpdate({
      batchId: batch.batchId,
      speciesName: batch.speciesName,
      isForSale: true,
      quantityForSale: qty,
      salePricePerUnit: price,
    });
  };

  const removeFromSale = () => {
    onUpdate({
      batchId: batch.batchId,
      speciesName: batch.speciesName,
      isForSale: false,
      quantityForSale: 0,
      salePricePerUnit: null,
    });
  };

  const estimatedTotal =
    Number(quantityForSale || 0) * Number(salePricePerUnit || 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Set Fish For Sale</Text>
          <Text style={styles.itemMeta}>
            {batch.speciesName} | Available: {maxQuantity.toLocaleString()} fish
          </Text>
          <Text style={styles.label}>Quantity to sell</Text>
          <TextInput
            value={quantityForSale}
            onChangeText={setQuantityForSale}
            keyboardType="number-pad"
            style={styles.input}
            placeholder={`Max ${maxQuantity}`}
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.label}>Price per fish (PKR, optional)</Text>
          <TextInput
            value={salePricePerUnit}
            onChangeText={setSalePricePerUnit}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholder="e.g. 150"
            placeholderTextColor="#9CA3AF"
          />
          {estimatedTotal > 0 && (
            <View style={styles.totalInvestmentBar}>
              <Text style={styles.totalInvestmentLabel}>ESTIMATED TOTAL</Text>
              <Text style={styles.totalInvestmentValue}>
                PKR {estimatedTotal.toLocaleString()}
              </Text>
            </View>
          )}
          <PrimaryButton title="Save Sale Status" onPress={submit} />
          {batch.isForSale && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={removeFromSale}
            >
              <Text style={styles.deleteText}>Remove from sale</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function TransferFishModal({
  visible,
  inventory,
  ponds,
  initialFromPondId,
  initialSpeciesId,
  initialStockId,
  initialQuantity,
  onClose,
  onSaved,
}) {
  const [fromPondId, setFromPondId] = useState('');
  const [toPondId, setToPondId] = useState('');
  const [stockId, setStockId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [compatibilityNote, setCompatibilityNote] = useState('');
  const [checkingCompat, setCheckingCompat] = useState(false);
  const [isCompatible, setIsCompatible] = useState(true);

  useEffect(() => {
    if (visible && initialFromPondId) {
      setFromPondId(String(initialFromPondId));
    }
    if (visible && initialStockId) {
      setStockId(String(initialStockId));
    }
  }, [visible, initialFromPondId, initialStockId]);

  const speciesInFromPond = (inventory || []).filter(
    item =>
      String(getStockPondId(item)) === String(fromPondId) &&
      (!initialSpeciesId ||
        String(getStockSpeciesId(item)) === String(initialSpeciesId)),
  );
  const selectedStock = speciesInFromPond.find(
    item => String(getStockRowId(item)) === String(stockId),
  );
  const maxTransferQty = Number(selectedStock?.Quantity || 0);

  useEffect(() => {
    if (!visible || stockId || speciesInFromPond.length === 0) return;
    const firstStock = speciesInFromPond[0];
    const firstStockId = getStockRowId(firstStock);
    if (firstStockId) {
      setStockId(String(firstStockId));
      setQuantity('');
    }
  }, [visible, stockId, speciesInFromPond]);
  const lockedSourcePond = initialFromPondId
    ? (ponds || []).find(
        pond => String(pond.PondId || pond.id) === String(initialFromPondId),
      )
    : null;

  const reset = () => {
    setFromPondId(initialFromPondId ? String(initialFromPondId) : '');
    setToPondId('');
    setStockId(initialStockId ? String(initialStockId) : '');
    setQuantity('');
    setCompatibilityNote('');
    setIsCompatible(true);
  };

  // Check compatibility for the selected batch and destination pond.
  useEffect(() => {
    if (!fromPondId || !toPondId || fromPondId === toPondId) {
      setCompatibilityNote('');
      setIsCompatible(true);
      return;
    }

    let mounted = true;
    setCheckingCompat(true);
    setCompatibilityNote('');

    const compatibilityRequest = selectedStock?.SpeciesId
      ? farmApi.checkPondCompatibility(
          Number(toPondId),
          Number(selectedStock.SpeciesId),
        )
      : farmApi.checkPondToPondCompatibility(
          Number(fromPondId),
          Number(toPondId),
        );

    compatibilityRequest
      .then(result => {
        if (!mounted) return;
        if (!result || result.compatible === undefined) {
          setCompatibilityNote(
            'Compatibility data unavailable. Transfer may proceed.',
          );
          setIsCompatible(true);
          return;
        }

        if (result.compatible) {
          setCompatibilityNote(
            '✓ Selected fish are compatible. Transfer can proceed safely.',
          );
          setIsCompatible(true);
        } else {
          const conflicts = result.incompatibleWith?.length
            ? result.incompatibleWith.map(
                item =>
                  `${
                    result.speciesName || 'Selected species'
                  } cannot live with ${item.speciesName || 'existing species'}`,
              )
            : (result.incompatiblePairs || []).map(
                pair =>
                  `${
                    pair.sourceSpecies?.speciesName || 'Unknown'
                  } cannot live with ${
                    pair.destSpecies?.speciesName || 'Unknown'
                  }`,
              );
          setCompatibilityNote(
            `⚠️ Compatibility conflict: ${conflicts.join(
              '; ',
            )}. Transfer is blocked.`,
          );
          setIsCompatible(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setCompatibilityNote(
            'Could not verify compatibility. Transfer may proceed.',
          );
          setIsCompatible(true);
        }
      })
      .finally(() => {
        if (mounted) setCheckingCompat(false);
      });

    return () => {
      mounted = false;
    };
  }, [fromPondId, toPondId, selectedStock?.SpeciesId]);

  const submit = async () => {
    if (!fromPondId || !toPondId || fromPondId === toPondId) {
      Alert.alert(
        'Transfer',
        'Please select different source and destination ponds.',
      );
      return;
    }
    if (!stockId) {
      Alert.alert('Transfer', 'Please select which fish batch to transfer.');
      return;
    }
    const qty = Math.floor(Number(quantity || 0));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Transfer', 'Enter how many fish to transfer.');
      return;
    }
    if (maxTransferQty > 0 && qty > maxTransferQty) {
      Alert.alert(
        'Transfer',
        `Only ${maxTransferQty.toLocaleString()} fish are available in this batch.`,
      );
      return;
    }
    if (!isCompatible) {
      Alert.alert(
        'Species Compatibility',
        'Transfer is blocked due to incompatible species between ponds.',
      );
      return;
    }
    setSaving(true);
    try {
      await farmApi.transferStocking(Number(stockId), Number(toPondId), qty);
      reset();
      onSaved();
    } catch (error) {
      Alert.alert(
        'Transfer',
        error.message || 'Could not transfer fish stock.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, styles.modalCardTall]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalTitle}>Transfer Fish Stock</Text>
            <Text style={styles.label}>From Pond</Text>
            {lockedSourcePond ? (
              <View style={styles.lockedPondBox}>
                <Text style={styles.lockedPondLabel}>
                  Source selected from dashboard
                </Text>
                <Text style={styles.lockedPondName}>
                  {lockedSourcePond.PondName ||
                    lockedSourcePond.pondName ||
                    `Pond ${initialFromPondId}`}
                </Text>
              </View>
            ) : (
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={fromPondId}
                  onValueChange={value => setFromPondId(String(value || ''))}
                  style={styles.picker}
                >
                  <Picker.Item label="Select source pond" value="" />
                  {(ponds || []).map(pond => (
                    <Picker.Item
                      key={String(pond.PondId)}
                      label={pond.PondName || `Pond ${pond.PondId}`}
                      value={String(pond.PondId)}
                    />
                  ))}
                </Picker>
              </View>
            )}

            <Text style={styles.label}>To Pond</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={toPondId}
                onValueChange={value => setToPondId(String(value || ''))}
                style={styles.picker}
              >
                <Picker.Item label="Select destination pond" value="" />
                {(ponds || [])
                  .filter(pond => String(pond.PondId) !== String(fromPondId))
                  .map(pond => (
                    <Picker.Item
                      key={String(pond.PondId)}
                      label={pond.PondName || `Pond ${pond.PondId}`}
                      value={String(pond.PondId)}
                    />
                  ))}
              </Picker>
            </View>

            <Text style={styles.label}>Fish currently in source pond</Text>
            {speciesInFromPond.length === 0 ? (
              <Text style={styles.itemMeta}>
                No fish inventory found in selected source pond.
              </Text>
            ) : (
              <>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={stockId}
                    onValueChange={value => {
                      const nextStockId = String(value || '');
                      setStockId(nextStockId);
                      setQuantity('');
                    }}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select fish batch/species" value="" />
                    {speciesInFromPond.map(item => {
                      const id = String(getStockRowId(item));
                      return (
                        <Picker.Item
                          key={id}
                          label={`${item.SpeciesName}: ${Number(
                            item.Quantity || 0,
                          ).toLocaleString()} fish${
                            item.CurrentSizeInches
                              ? `, ${Number(item.CurrentSizeInches).toFixed(
                                  1,
                                )}"`
                              : ''
                          }`}
                          value={id}
                        />
                      );
                    })}
                  </Picker>
                </View>
                <Text style={styles.label}>Number of fish to transfer</Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
                {!!selectedStock && (
                  <View style={styles.transferQtyHintBox}>
                    <Text style={styles.itemMeta}>
                      Available in selected batch:{' '}
                      {maxTransferQty.toLocaleString()} fish. Enter a smaller
                      number for partial transfer, or transfer all available.
                    </Text>
                    <TouchableOpacity
                      style={styles.transferAllQtyButton}
                      onPress={() => setQuantity(String(maxTransferQty || ''))}
                    >
                      <Text style={styles.transferAllQtyText}>
                        Use all {maxTransferQty.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {checkingCompat && (
              <View style={styles.compatCheckingRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.compatCheckingText}>
                  Checking species compatibility...
                </Text>
              </View>
            )}
            {!!compatibilityNote && !checkingCompat && (
              <Text
                style={[
                  styles.compatibilityText,
                  !isCompatible && styles.compatibilityWarning,
                ]}
              >
                {compatibilityNote}
              </Text>
            )}

            <PrimaryButton
              title={saving ? 'Transferring...' : 'Transfer'}
              onPress={submit}
              disabled={saving || !isCompatible}
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                reset();
                onClose();
              }}
            >
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tabText: {
    color: '#6B7280',
    fontWeight: '900',
    fontSize: 12,
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  addButton: {
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  itemTitleWrap: {
    flex: 1,
  },
  itemTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  itemMeta: {
    color: '#6B7280',
    marginTop: 4,
  },
  lowStockText: {
    alignSelf: 'flex-start',
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  saleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  saleButtonText: {
    color: '#1D4ED8',
    fontWeight: '900',
  },
  transferQtyHintBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  transferAllQtyButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  transferAllQtyText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingVertical: 9,
    gap: 12,
  },
  metricLabel: {
    color: '#6B7280',
  },
  metricValue: {
    color: '#111827',
    fontWeight: '900',
  },
  notes: {
    color: '#4B5563',
    marginTop: 10,
    lineHeight: 20,
  },
  deleteButton: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 12,
  },
  deleteText: {
    color: '#DC2626',
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 18,
  },
  modalCardTall: {
    maxHeight: '92%',
  },
  modalScrollContent: {
    paddingBottom: 24,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  modalHeaderTextWrap: {
    flex: 1,
  },
  modalSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
  },
  modalCloseHit: {
    padding: 4,
    marginTop: -4,
  },
  modalClose: {
    fontSize: 28,
    color: '#6B7280',
    fontWeight: '300',
    lineHeight: 30,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  dateInputText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 15,
  },
  dateDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dateDoneText: {
    color: '#059669',
    fontWeight: '900',
    fontSize: 16,
  },
  totalInvestmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    marginTop: 4,
  },
  totalInvestmentLabel: {
    color: '#047857',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  totalInvestmentValue: {
    color: '#065F46',
    fontWeight: '900',
    fontSize: 18,
  },
  modalTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
  modalTitleFertilizer: {
    marginBottom: 0,
  },
  label: {
    color: '#374151',
    fontWeight: '900',
    marginBottom: 7,
  },
  helperHint: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    color: '#111827',
    marginBottom: 12,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    color: '#111827',
    minHeight: 46,
  },
  lockedPondBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  lockedPondLabel: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  lockedPondName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  compatibilityText: {
    color: '#B45309',
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700',
  },
  compatibilityWarning: {
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  compatCheckingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  compatCheckingText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    alignItems: 'center',
    padding: 15,
  },
  closeText: {
    color: '#6B7280',
    fontWeight: '900',
  },
});
