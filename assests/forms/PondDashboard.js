import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DollarSign,
  Droplets,
  Fish,
  FlaskConical,
  Pencil,
  Ruler,
  Scale,
  Skull,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from 'lucide-react-native';
import {
  AppScaffold,
  Card,
  EmptyState,
  PrimaryButton,
  StatCard,
  Tag,
} from '../compoents/AppScaffold';
import {
  farmApi,
  getPurchaseRequestStatus,
  getSession,
  isPurchaseRequestOpen,
} from '../integration/farmApi';

const getPondId = pond => Number(pond.PondId || pond.id || 0);

const toNumber = value => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const NURSERY_TARGET_INCHES = 6;
const GROWOUT_TARGET_INCHES = 20;
const Juveline_TARGET_INCHES = 12;
const CAPACITY_RULES = {
  nursery: {
    extensive: 180000,
    'semi-intensive': 220000,
    intensive: 260000,
  },
  growout: {
    extensive: 30000,
    'semi-intensive': 45000,
    intensive: 60000,
  },
  juvenile: {
    extensive: 120000,
    'semi-intensive': 100000,
    intensive: 80000,
  },
};

const emptyDiseaseForm = {
  diseaseId: '',
  customDiseaseName: '',
  severity: 'Moderate',
  status: 'Active',
  speciesId: '',
  batchId: '',
  estimatedAffectedCount: '',
  affectedBatches: {},
  symptomsObserved: '',
  notes: '',
};

const DISEASE_SEVERITY_OPTIONS = ['Mild', 'Moderate', 'Severe', 'Critical'];
const DISEASE_STATUS_OPTIONS = ['Active', 'Treating', 'Improving', 'Resolved'];

const isNurseryStageName = stage =>
  String(stage || '')
    .toLowerCase()
    .includes('nursery');

const isGrowoutStageName = stage =>
  String(stage || '')
    .toLowerCase()
    .includes('grow');

const getCultivationKey = cultivationType => {
  const value = String(cultivationType || '').toLowerCase();
  if (value.includes('intensive') && !value.includes('semi'))
    return 'intensive';
  if (value.includes('semi')) return 'semi-intensive';
  return 'extensive';
};

const getCapacityStageKey = stage => {
  const value = String(stage || '').toLowerCase();
  if (value.includes('nursery')) return 'nursery';
  if (value.includes('juvenile')) return 'juvenile';
  return 'growout';
};

const roundCapacity = (value, stage) => {
  const step = isNurseryStageName(stage) ? 5000 : 500;
  return Math.round(Number(value || 0) / step) * step;
};

const getSensibleMaxFishPerAcre = (stage, cultivationType, rawValue) => {
  const stageKey = getCapacityStageKey(stage);
  const cultivationKey = getCultivationKey(cultivationType);
  const ruleSet = CAPACITY_RULES[stageKey] || CAPACITY_RULES.growout;
  const fallback = ruleSet[cultivationKey] || ruleSet.extensive;
  const raw = Number(rawValue || 0);

  if (raw <= 0) return fallback;
  return roundCapacity(raw, stage);
};

const getDefaultTargetSize = stage =>
  isNurseryStageName(stage) ? NURSERY_TARGET_INCHES : GROWOUT_TARGET_INCHES;

const getEffectiveTargetSize = (stage, savedTarget) => {
  const target = toNumber(savedTarget);
  if (isNurseryStageName(stage)) {
    return target > 0
      ? Math.min(target, NURSERY_TARGET_INCHES)
      : NURSERY_TARGET_INCHES;
  }
  if (isGrowoutStageName(stage)) {
    return target >= NURSERY_TARGET_INCHES ? target : GROWOUT_TARGET_INCHES;
  }
  return target > 0 ? target : GROWOUT_TARGET_INCHES;
};

const roundToTenth = value => Math.round(toNumber(value) * 10) / 10;

// Standard fisheries length-weight relationship: W(g) = a * L(cm)^b
// Using a=0.02, b=3.0 for typical farmed fish (tilapia, carp, catfish)
const LENGTH_WEIGHT_A = 0.02;
const LENGTH_WEIGHT_B = 3.0;
const CM_PER_INCH = 2.54;

const inchesToKg = inches => {
  if (!inches || inches <= 0) return 0;
  const cm = inches * CM_PER_INCH;
  const weightGrams = LENGTH_WEIGHT_A * Math.pow(cm, LENGTH_WEIGHT_B);
  return weightGrams / 1000; // convert grams to kg
};

const mergeSpeciesBatches = entries => {
  const seen = new Set();
  const batches = [];

  for (const fish of entries) {
    const key =
      String(fish.batchId || fish.id || '') ||
      `${fish.pondId || 0}-${fish.speciesId || fish.species}-${
        fish.currentSize || 0
      }-${
        fish.targetSize || 0
      }-${fish.quantity || 0}`;

    if (seen.has(key)) continue;
    seen.add(key);
    batches.push({
      ...fish,
      id: fish.id || key,
      batchId: fish.batchId || fish.id || key,
    });
  }

  return batches;
};

const normalizeSpecies = s => {
  const quantity = Number(s.Quantity || s.quantity || 0);
  const weightGrams = Number(
    s.WeightPerFish_g ?? s.weightPerFishG ?? s.WeightPerFish ?? s.weight ?? 0,
  );
  const fingerlingG = Number(s.FingerlingSizeG ?? s.fingerlingSizeG ?? 0);
  let currentSize = Number(
    s.CurrentSizeInches ??
      s.currentSizeInches ??
      s.CurrentSizeInch ??
      s.currentSize ??
      0,
  );

  // If no CurrentSizeInches, derive from WeightPerFish_g (inventory records)
  if (currentSize === 0 && weightGrams > 0) {
    const cm = Math.pow(weightGrams / LENGTH_WEIGHT_A, 1 / LENGTH_WEIGHT_B);
    currentSize = cm / CM_PER_INCH;
  }

  let biomassKg = 0;
  if (weightGrams > 0 && quantity > 0) {
    biomassKg = (quantity * weightGrams) / 1000;
  } else if (fingerlingG > 0 && quantity > 0) {
    biomassKg = (quantity * fingerlingG) / 1000;
  } else if (currentSize > 0 && quantity > 0) {
    const inch = Math.max(currentSize, 0.1);
    const cm = inch * CM_PER_INCH;
    const estWeightGrams = LENGTH_WEIGHT_A * Math.pow(cm, LENGTH_WEIGHT_B);
    biomassKg = (quantity * estWeightGrams) / 1000;
  }

  return {
    ...s,
    id: s.InventoryId || s.PondStockId || s.StockId || s.BatchId || s.id,
    batchId: s.StockId || s.PondStockId || s.BatchId || s.id,
    pondId: Number(
      s.PondId || s.pondId || s.CurrentPondId || s.currentPondId || 0,
    ),
    species: s.SpeciesName || s.Name || s.species || s.speciesName || 'Fish',
    speciesId: Number(s.SpeciesId ?? s.SpeciesID ?? s.speciesId ?? 0),
    quantity,
    stockingDate:
      s.StockingDate ||
      s.stockingDate ||
      s.CreatedAt ||
      s.createdAt ||
      s.DateAdded ||
      s.dateAdded,
    ageDays: Number(s.AgeDays ?? s.ageDays ?? 0),
    currentSize,
    targetSize:
      s.TargetSizeInches ??
      s.TargetSizeInch ??
      s.targetSizeInches ??
      s.targetSize,
    biomassKg,
  };
};

const getLatestFeedDate = (history = []) =>
  history
    .map(
      item =>
        item.FeedDate || item.feedDate || item.CreatedAt || item.createdAt,
    )
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';

const formatDate = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString();
};

const getPondTotalFish = pond =>
  (pond.species || []).reduce(
    (sum, species) => sum + Number(species.quantity || 0),
    0,
  );

const getPondBiomass = pond =>
  (pond.species || []).reduce((sum, s) => sum + Number(s.biomassKg || 0), 0);

const getWaterGallons = pond => {
  const volumeLiters = Number(
    pond.VolumeLiters || pond.volumeLiters || pond.volume || 0,
  );
  if (volumeLiters > 0) return volumeLiters * 0.264172;

  const length = Number(pond.LengthFeet || pond.lengthFeet || 0);
  const width = Number(pond.WidthFeet || pond.widthFeet || 0);
  const depth = Number(pond.DepthFeet || pond.depthFeet || 0);
  if (length > 0 && width > 0 && depth > 0)
    return length * width * depth * 7.48052;

  return 0;
};

const normalizePond = (
  pond,
  inventory = [],
  feedHistory = [],
  stocking = [],
) => {
  const pondId = getPondId(pond);
  const pondSpecies = (pond.species || []).map(normalizeSpecies);
  const inventorySpecies = inventory
    .filter(item => String(item.PondId || item.pondId) === String(pondId))
    .map(normalizeSpecies);
  const stockingSpecies = stocking
    .filter(
      item =>
        String(
          item.CurrentPondId ??
            item.currentPondId ??
            item.PondId ??
            item.pondId,
        ) === String(pondId),
    )
    .map(normalizeSpecies);
  const batchSpecies = mergeSpeciesBatches([
    ...inventorySpecies,
    ...stockingSpecies,
  ]);
  const species = batchSpecies.length ? batchSpecies : pondSpecies;
  const lastFedAt =
    pond.LastFedDate ||
    pond.lastFedAt ||
    pond.LastFeedingDate ||
    getLatestFeedDate(feedHistory);
  const status =
    pond.Status ||
    pond.status ||
    (pond.Active === false
      ? 'Inactive'
      : getPondTotalFish({ species }) > 0
      ? 'Stocked'
      : 'Empty');
  const sizeAcres = Number(pond.Size || pond.size || 0);
  const cultivationType =
    pond.CultivationType || pond.cultivationType || 'Extensive';
  const totalFish = getPondTotalFish({ species });
  const maxFishPerAcre = getSensibleMaxFishPerAcre(
    pond.Stage || pond.stage,
    cultivationType,
    pond.MaxFishPerAcre || pond.maxFishPerAcre,
  );
  const maxSpeciesAllowed = Number(
    pond.MaxSpeciesAllowed || pond.maxSpeciesAllowed || 0,
  );
  const maxTotalFish =
    maxFishPerAcre > 0 && sizeAcres > 0
      ? Math.floor(sizeAcres * maxFishPerAcre)
      : 0;

  return {
    ...pond,
    id: pondId,
    pondName: pond.PondName || pond.pondName || pond.name || 'Unnamed Pond',
    size: sizeAcres,
    pondType: pond.PondType || pond.pondType || pond.type || 'Grow-out',
    stage: pond.Stage || pond.stage || 'Grown-out',
    lengthFeet: Number(pond.LengthFeet || pond.lengthFeet || 0),
    widthFeet: Number(pond.WidthFeet || pond.widthFeet || 0),
    depthFeet: Number(pond.DepthFeet || pond.depthFeet || 0),
    waterGallons: getWaterGallons(pond),
    needsMaintenance:
      Boolean(pond.NeedsMaintenance) || Boolean(pond.needsMaintenance),
    status,
    lastFedAt,
    species,
    totalFish,
    biomassKg: getPondBiomass({ species }),
    maxFishPerAcre,
    maxSpeciesAllowed,
    maxTotalFish,
    remainingCapacity:
      maxTotalFish > 0 ? Math.max(0, maxTotalFish - totalFish) : 0,
    isOverCapacity: maxTotalFish > 0 && totalFish > maxTotalFish,
    capacityUsedPercent:
      maxTotalFish > 0
        ? Math.min(999, Math.round((totalFish / maxTotalFish) * 100))
        : 0,
  };
};

// Alert severity colors
const SEVERITY_COLORS = {
  high: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '#DC2626' },
  medium: {
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#92400E',
    icon: '#D97706',
  },
  low: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', icon: '#2563EB' },
};

const normalizeShiftAlerts = raw => {
  if (!raw) return null;

  const payload = raw.payload || raw;
  let alerts = payload.alerts;
  if (!alerts && Array.isArray(payload.data)) alerts = payload.data;
  if (!alerts && Array.isArray(raw.data)) alerts = raw.data;
  alerts = Array.isArray(alerts) ? alerts : [];

  const highCount =
    payload.highCount ?? alerts.filter(a => a.severity === 'high').length;
  const mediumCount =
    payload.mediumCount ?? alerts.filter(a => a.severity === 'medium').length;
  const lowCount =
    payload.lowCount ?? alerts.filter(a => a.severity === 'low').length;

  return {
    totalAlerts: payload.totalAlerts ?? alerts.length,
    highCount,
    mediumCount,
    lowCount,
    alerts,
  };
};

const normalizeFarmerRequests = raw => {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.requests)
    ? raw.requests
    : [];

  return list.filter(Boolean);
};

const OVERVIEW_DEFAULT_PARAMS = {
  pondSize: '1',
  stage: 'Grow-out',
  cultureType: 'Polyculture',
  cultivationType: 'Extensive',
  primaryFish: 'Grass Carp',
};

const OVERVIEW_FISH_OPTIONS = [
  'Grass Carp',
  'Rohu',
  'Mrigal',
  'Catla',
  'Silver Carp',
  'Common Carp',
  'Tilapia',
];

const SPECIES_DENSITY_PER_ACRE = {
  Rohu: 600,
  Tilapia: 1000,
  'Grass Carp': 500,
  Mrigal: 500,
  Catla: 500,
  'Silver Carp': 500,
  'Common Carp': 700,
  'Red Tilapia': 9000,
};

const OVERVIEW_SIZE_CATEGORIES = [
  {
    label: 'Fingerlings (Small)',
    subtitle: 'Under 4 inches',
    factor: 1.0,
    color: '#059669',
    bg: '#ECFDF5',
    border: '#BBF7D0',
  },
  {
    label: 'Juveniles (Medium)',
    subtitle: '4 to 8 inches',
    factor: 2 / 3,
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
  },
  {
    label: 'Adults (Large)',
    subtitle: 'Over 8 inches',
    factor: 0.4,
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
  },
];

const getOverviewStageScale = (stage, cultivationType) => {
  const cultivationKey = getCultivationKey(cultivationType);
  const growoutBase =
    CAPACITY_RULES.growout[cultivationKey] || CAPACITY_RULES.growout.extensive;

  if (String(stage || '').toLowerCase().includes('nursery')) {
    const nurseryBase =
      CAPACITY_RULES.nursery[cultivationKey] || CAPACITY_RULES.nursery.extensive;
    return growoutBase > 0 ? nurseryBase / growoutBase : 40;
  }

  if (String(stage || '').toLowerCase().includes('juvenile')) {
    const juvenileBase =
      CAPACITY_RULES.juvenile[cultivationKey] || CAPACITY_RULES.juvenile.extensive;
    return growoutBase > 0 ? juvenileBase / growoutBase : 2.5;
  }

  return 1;
};

const getOverviewCultivationScale = (stage, cultivationType) => {
  const stageKey = getStageCapacityKey(stage);
  const cultivationKey = getCultivationKey(cultivationType);
  const extensiveBase =
    CAPACITY_RULES[stageKey]?.extensive || CAPACITY_RULES.growout.extensive;
  const currentBase =
    CAPACITY_RULES[stageKey]?.[cultivationKey] || extensiveBase;
  return extensiveBase > 0 ? currentBase / extensiveBase : 1;
};

const buildFallbackSpeciesCapacities = ({
  pondSize,
  stage,
  cultivationType,
  primaryFish,
}) => {
  const stageScale = getOverviewStageScale(stage, cultivationType);
  const cultivationScale = getOverviewCultivationScale(stage, cultivationType);
  const speciesNames = Object.keys(SPECIES_DENSITY_PER_ACRE);

  return OVERVIEW_SIZE_CATEGORIES.map(sizeCategory => {
    const species = speciesNames.map(name => {
      const basePerAcre = SPECIES_DENSITY_PER_ACRE[name] || 500;
      const perAcre = Math.floor(
        basePerAcre * stageScale * cultivationScale * sizeCategory.factor,
      );
      const quantity = Math.floor(pondSize * perAcre);

      return {
        speciesId: name,
        name,
        perAcre,
        quantity,
        isPrimary:
          String(name).toLowerCase() === String(primaryFish || '').toLowerCase(),
      };
    });

    return {
      label: sizeCategory.label,
      subtitle: sizeCategory.subtitle,
      quantity: species.reduce((sum, item) => sum + item.quantity, 0),
      species,
      color: sizeCategory.color,
      bg: sizeCategory.bg,
      border: sizeCategory.border,
    };
  });
};

const getOverviewFallback = params => {
  const size = Math.max(0, Number(params.pondSize || 1));
  const primaryName = params.primaryFish || 'Grass Carp';

  const capacities = buildFallbackSpeciesCapacities({
    pondSize: size,
    stage: params.stage,
    cultivationType: params.cultivationType,
    primaryFish: primaryName,
  });

  return {
    parameters: params,
    capacities,
    compatibility: Object.entries(SPECIES_DENSITY_PER_ACRE)
      .filter(([name]) => name !== primaryName)
      .slice(0, 6)
      .map(([name, perAcre]) => ({
        species: name,
        perAcre,
        note: `${primaryName} and ${name} have different per-acre stocking capacity (${perAcre.toLocaleString()}/acre).`,
      })),
  };
};

const getFishStockingDate = fish =>
  fish.stockingDate ||
  fish.StockingDate ||
  fish.CreatedAt ||
  fish.createdAt ||
  fish.DateAdded ||
  fish.dateAdded ||
  '';

const getFishAgeDays = fish => {
  const savedAge = Number(fish.ageDays ?? fish.AgeDays ?? 0);
  if (savedAge > 0) return Math.floor(savedAge);

  const stockedAt = getFishStockingDate(fish);
  if (!stockedAt) return 0;

  const stockedTime = new Date(stockedAt).getTime();
  if (Number.isNaN(stockedTime)) return 0;

  return Math.max(0, Math.ceil((Date.now() - stockedTime) / 86400000));
};

const getSpeciesCapacityForPond = (pond, species) => {
  const pondSize = Number(pond.size || pond.Size || 0);
  const density = Number(
    species.MaxStockingDensity ||
      species.maxStockingDensity ||
      pond.maxFishPerAcre ||
      pond.MaxFishPerAcre ||
      0,
  );

  return {
    pondId: pond.id,
    pondName: pond.pondName,
    stage: pond.stage,
    sizeAcres: pondSize,
    speciesId: species.SpeciesId || species.speciesId || species.Name,
    species: species.Name || species.species || 'Fish',
    fishPerAcre: density,
    capacity: pondSize > 0 && density > 0 ? Math.floor(pondSize * density) : 0,
  };
};

const STAGE_OPTIONS = ['Nursery', 'Juvenile', 'Grow-out'];
const CULTURE_OPTIONS = ['Polyculture', 'Monoculture'];
const CULTIVATION_OPTIONS = ['Extensive', 'Semi-Intensive', 'Intensive'];

const getStageCapacityKey = stage => {
  const value = String(stage || '').toLowerCase();
  if (value.includes('nursery')) return 'nursery';
  if (value.includes('juvenile')) return 'juvenile';
  return 'growout';
};

const getSummaryFallback = (ponds, allSpecies = []) => {
  const rows = ponds.flatMap(pond =>
    (pond.species || []).map((fish, index) => ({
      batchId: fish.batchId || fish.id || `${pond.id}-${fish.species}-${index}`,
      pondId: pond.id,
      pondName: pond.pondName,
      stage: pond.stage,
      sizeAcres: pond.size,
      dimensions: `${Math.round(pond.lengthFeet || 0)}ft x ${Math.round(
        pond.widthFeet || 0,
      )}ft x ${Number(pond.depthFeet || 0).toFixed(1)}ft`,
      volumeGallons: Math.round(pond.waterGallons || 0),
      species: fish.species,
      speciesId: fish.speciesId,
      quantity: Number(fish.quantity || 0),
      currentSize: Number(fish.currentSize || 0),
      targetSize: Number(fish.targetSize || getEffectiveTargetSize(pond.stage)),
      stockingDate: getFishStockingDate(fish),
      ageDays: getFishAgeDays(fish),
      timeInPondDays: getFishAgeDays(fish),
    })),
  );
  const capacityRows = ponds.flatMap(pond =>
    (allSpecies || []).map(species => getSpeciesCapacityForPond(pond, species)),
  );

  return {
    totals: {
      totalPonds: ponds.length,
      totalArea: ponds.reduce((sum, pond) => sum + Number(pond.size || 0), 0),
      totalVolumeGallons: ponds.reduce(
        (sum, pond) => sum + Number(pond.waterGallons || 0),
        0,
      ),
      totalFish: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    },
    rows,
    capacityRows,
  };
};

export default function PondDashboard({ navigation, route }) {
  const shouldAutoStartTour = useState(
    () => route?.params?.firstLogin === true,
  )[0];
  const [ponds, setPonds] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [areaUsage, setAreaUsage] = useState(null);
  const [budgetStats, setBudgetStats] = useState({ totalAllTime: 0 });
  const [farmSetup, setFarmSetup] = useState(null);
  const [farmMissing, setFarmMissing] = useState(false);
  const [waterAlerts, setWaterAlerts] = useState([]);
  const [diseaseOutbreaks, setDiseaseOutbreaks] = useState([]);
  const [fcrData, setFcrData] = useState({});
  const [feedSchedule, setFeedSchedule] = useState([]);
  const [farmerRequests, setFarmerRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fish size management state
  const [fishSizeData, setFishSizeData] = useState([]);
  const [shiftAlerts, setShiftAlerts] = useState(null);
  const [expandedPonds, setExpandedPonds] = useState({});
  const [sizeEditModal, setSizeEditModal] = useState(null);
  const [alertsModal, setAlertsModal] = useState(null);
  const [requestsModal, setRequestsModal] = useState(false);
  const [overviewModal, setOverviewModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [overviewParams, setOverviewParams] = useState(OVERVIEW_DEFAULT_PARAMS);
  const [overviewData, setOverviewData] = useState(null);
  const [overviewSpeciesList, setOverviewSpeciesList] = useState([]);
  const [speciesDensityDrafts, setSpeciesDensityDrafts] = useState({});
  const [showSpeciesDensityEditor, setShowSpeciesDensityEditor] =
    useState(false);
  const [savingSpeciesDensityId, setSavingSpeciesDensityId] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const isAdminUser = getSession()?.user?.role === 'admin';
  const [editSizeValue, setEditSizeValue] = useState('');
  const [editTargetValue, setEditTargetValue] = useState('');
  const [updatingSize, setUpdatingSize] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [diseaseModal, setDiseaseModal] = useState(null);
  const [diseaseForm, setDiseaseForm] = useState(emptyDiseaseForm);
  const [diseaseCatalog, setDiseaseCatalog] = useState([]);
  const [diseaseSearch, setDiseaseSearch] = useState('');
  const [savingDisease, setSavingDisease] = useState(false);
  const [financialsModal, setFinancialsModal] = useState(null);
  const [financialsData, setFinancialsData] = useState(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const farmData = await farmApi.getFarmDetails();

      if (!farmData?.FarmId) {
        setFarmMissing(true);
        setFarmSetup(null);
        setPonds([]);
        setActivityLogs([]);
        setAreaUsage(null);
        setBudgetStats({ totalAllTime: 0 });
        setWaterAlerts([]);
        setDiseaseOutbreaks([]);
        setDiseaseCatalog([]);
        setFcrData({});
        setFeedSchedule([]);
        setFarmerRequests([]);
        return;
      }

      setFarmMissing(false);
      setFarmSetup({
        farmId: farmData.FarmId,
        totalArea: farmData.TotalAreaAcres,
        regionId: farmData.RegionId,
        province: farmData.RegionName,
      });

      const [
        pondData,
        inventoryData,
        stockingData,
        usageData,
        expenses,
        activities,
        waterAlertData,
        outbreakData,
        diseaseCatalogData,
        scheduleData,
        requestData,
      ] = await Promise.all([
        farmApi.getPonds().catch(() => []),
        farmApi.getInventory().catch(() => []),
        farmApi.getStocking().catch(() => []),
        farmApi.getAreaUsage().catch(() => null),
        farmApi.getBudgetDashboard().catch(() => ({ totalAllTime: 0 })),
        farmApi.getActivityFeed().catch(() => []),
        farmApi.getWaterAlerts().catch(() => []),
        farmApi.getOutbreaks().catch(() => []),
        farmApi.getDiseaseCatalog().catch(() => []),
        farmApi.getFeedSchedule().catch(() => ({ schedule: [] })),
        farmApi.getFarmerRequests().catch(() => ({ data: [] })),
      ]);

      const feedHistoryByPond = await Promise.all(
        (pondData || []).map(async pond => ({
          pondId: getPondId(pond),
          history: await farmApi
            .getFeedHistory(getPondId(pond))
            .catch(() => []),
        })),
      );
      const feedHistoryMap = feedHistoryByPond.reduce(
        (map, item) => ({ ...map, [item.pondId]: item.history }),
        {},
      );

      const normalizedPonds = (pondData || []).map(pond =>
        normalizePond(
          pond,
          inventoryData || [],
          feedHistoryMap[getPondId(pond)] || [],
          stockingData || [],
        ),
      );
      setPonds(normalizedPonds);
      setAreaUsage(usageData?.data || usageData);
      setBudgetStats(expenses || { totalAllTime: 0 });
      setActivityLogs(
        (activities || []).map((item, index) => ({
          id: `${item.ActivityId || index}`,
          message: item.Description || item.message || 'Farm activity recorded',
          category: item.Category || item.pondName || 'Activity',
          time: item.RelativeTime || item.ActivityTime || item.time || '',
        })),
      );

      setFishSizeData([]);
      setShiftAlerts(null);
      setWaterAlerts(Array.isArray(waterAlertData) ? waterAlertData : []);
      setDiseaseOutbreaks(Array.isArray(outbreakData) ? outbreakData : []);
      setDiseaseCatalog(
        Array.isArray(diseaseCatalogData) ? diseaseCatalogData : [],
      );
      setFeedSchedule(scheduleData?.schedule || []);
      setFarmerRequests(normalizeFarmerRequests(requestData));

      const fcrEntries = await Promise.all(
        normalizedPonds.map(async pond => {
          try {
            const data = await farmApi.getPondFCR(pond.id);
            return [pond.id, data];
          } catch {
            return [pond.id, null];
          }
        }),
      );
      setFcrData(
        Object.fromEntries(fcrEntries.filter(([, data]) => Boolean(data))),
      );
    } catch (err) {
      if (
        err.status === 404 ||
        String(err.message || '')
          .toLowerCase()
          .includes('farm not found')
      ) {
        setFarmMissing(true);
        setFarmSetup(null);
        setPonds([]);
      } else {
        Alert.alert(
          'Dashboard',
          err.message || 'Failed to load dashboard data.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard]),
  );

  const loadOverviewSpecies = async () => {
    try {
      const list = await farmApi.getApprovedSpecies();
      const species = Array.isArray(list) ? list : [];
      setOverviewSpeciesList(species);
      const drafts = {};
      species.forEach(item => {
        drafts[item.SpeciesId] = String(item.MaxStockingDensity ?? '');
      });
      setSpeciesDensityDrafts(drafts);
      return species;
    } catch {
      setOverviewSpeciesList([]);
      setSpeciesDensityDrafts({});
      return [];
    }
  };

  const loadOverview = async (params = overviewParams) => {
    setInsightLoading(true);
    try {
      const response = await farmApi.getFarmOverview(params);
      setOverviewData(
        response?.data || response || getOverviewFallback(params),
      );
    } catch {
      setOverviewData(getOverviewFallback(params));
    } finally {
      setInsightLoading(false);
    }
  };

  const openOverview = async () => {
    setOverviewModal(true);
    await Promise.all([
      loadOverview(overviewParams),
      loadOverviewSpecies(),
    ]);
  };

  const updateSpeciesDensityDraft = (speciesId, value) => {
    setSpeciesDensityDrafts(prev => ({ ...prev, [speciesId]: value }));
  };

  const saveSpeciesDensity = async speciesId => {
    const density = Number(speciesDensityDrafts[speciesId]);
    if (!density || density <= 0) {
      Alert.alert(
        'Invalid capacity',
        'Enter a positive fish-per-acre value for this species.',
      );
      return;
    }

    setSavingSpeciesDensityId(speciesId);
    try {
      await farmApi.updateAdminSpeciesDensity(speciesId, density);
      await Promise.all([
        loadOverviewSpecies(),
        loadOverview(overviewParams),
      ]);
      Alert.alert('Saved', 'Species capacity updated on the overview sheet.');
    } catch (error) {
      Alert.alert(
        'Save failed',
        error.message || 'Could not update species capacity.',
      );
    } finally {
      setSavingSpeciesDensityId(null);
    }
  };

  const saveAllSpeciesDensities = async () => {
    const speciesToSave = overviewSpeciesList.filter(item => {
      const draft = Number(speciesDensityDrafts[item.SpeciesId]);
      return draft > 0 && draft !== Number(item.MaxStockingDensity || 0);
    });

    if (!speciesToSave.length) {
      Alert.alert('No changes', 'Update at least one species capacity first.');
      return;
    }

    setSavingSpeciesDensityId('all');
    try {
      await Promise.all(
        speciesToSave.map(item =>
          farmApi.updateAdminSpeciesDensity(
            item.SpeciesId,
            Number(speciesDensityDrafts[item.SpeciesId]),
          ),
        ),
      );
      await Promise.all([
        loadOverviewSpecies(),
        loadOverview(overviewParams),
      ]);
      Alert.alert('Saved', 'All species capacities were updated.');
    } catch (error) {
      Alert.alert(
        'Save failed',
        error.message || 'Could not update species capacities.',
      );
    } finally {
      setSavingSpeciesDensityId(null);
    }
  };

  const overviewFishOptions = overviewSpeciesList.length
    ? overviewSpeciesList.map(item => item.Name)
    : OVERVIEW_FISH_OPTIONS;

  const openSummarySheet = async () => {
    setSummaryModal(true);
    setInsightLoading(true);
    try {
      const [response, speciesResponse] = await Promise.all([
        farmApi.getFarmSummarySheet().catch(() => null),
        farmApi.getApprovedSpecies().catch(() => []),
      ]);
      const localSummary = getSummaryFallback(
        ponds,
        Array.isArray(speciesResponse) ? speciesResponse : [],
      );
      const apiSummary = response?.data || response || {};
      setSummaryData({
        ...apiSummary,
        totals: apiSummary.totals || localSummary.totals,
        rows: localSummary.rows,
        capacityRows: localSummary.capacityRows,
      });
    } catch {
      setSummaryData(getSummaryFallback(ponds));
    } finally {
      setInsightLoading(false);
    }
  };

  const updateOverviewParam = (key, value) => {
    const next = { ...overviewParams, [key]: value };
    setOverviewParams(next);
    if (overviewModal) {
      loadOverview(next);
    }
  };

  const totalFish = ponds.reduce(
    (sum, pond) => sum + Number(pond.totalFish || 0),
    0,
  );
  const totalBiomassKg = ponds.reduce(
    (sum, pond) => sum + Number(pond.biomassKg || 0),
    0,
  );
  const activeDiseaseCount = diseaseOutbreaks.filter(
    outbreak => String(outbreak.Status || '').toLowerCase() !== 'resolved',
  ).length;
  const pendingRequestCount = farmerRequests.filter(
    isPurchaseRequestOpen,
  ).length;
  const totalRequestCount = pendingRequestCount;
  const dueFeedCount = feedSchedule.filter(item =>
    ['overdue', 'due_soon'].includes(String(item.status || '').toLowerCase()),
  ).length;

  const getPondDiseaseOutbreaks = pondId =>
    diseaseOutbreaks.filter(
      outbreak =>
        Number(outbreak.PondId || outbreak.pondId) === Number(pondId) &&
        String(outbreak.Status || '').toLowerCase() !== 'resolved',
    );

  const getPondFeedSchedule = pondId =>
    feedSchedule.filter(item => Number(item.pondId) === Number(pondId));

  const handleDeleteFarm = () => {
    Alert.alert(
      'Delete Entire Farm',
      'This permanently deletes your farm, ponds, fish, expenses, harvests, and activity logs. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Farm',
          style: 'destructive',
          onPress: async () => {
            try {
              await farmApi.resetFarm();
              setFarmMissing(true);
              setFarmSetup(null);
              setPonds([]);
              setActivityLogs([]);
              setAreaUsage(null);
              Alert.alert('Farm deleted', 'You can now set up a new farm.');
            } catch (error) {
              Alert.alert(
                'Delete Farm',
                error.message || 'Failed to delete farm.',
              );
            }
          },
        },
      ],
    );
  };

  const patchRequestInList = (requestId, patch) => {
    const id = Number(requestId);
    setFarmerRequests(prev =>
      prev.map(item => {
        const itemId = Number(item.RequestId || item.id);
        return itemId === id ? { ...item, ...patch } : item;
      }),
    );
  };

  const handleRequestAction = async (requestId, action) => {
    setProcessingRequestId(requestId);
    try {
      if (action === 'approve') {
        const result = await farmApi.approvePurchaseRequest(requestId, {});
        if (!result?.success) {
          throw new Error(result?.error || 'Could not approve request.');
        }
        patchRequestInList(requestId, {
          ...(result.data || {}),
          Status: getPurchaseRequestStatus(
            result.data || { Status: 'Approved' },
          ),
        });
        Alert.alert('Approved', result.message || 'Purchase request approved.');
        await loadDashboard();
      } else if (action === 'deny') {
        const result = await farmApi.denyPurchaseRequest(requestId);
        if (result?.success === false) {
          throw new Error(result?.error || 'Could not deny request.');
        }
        patchRequestInList(requestId, { Status: 'Denied' });
      } else if (action === 'delete') {
        await farmApi.deletePurchaseRequest(requestId);
        const id = Number(requestId);
        setFarmerRequests(prev =>
          prev.filter(item => Number(item.RequestId || item.id) !== id),
        );
      }

      const result = await farmApi.getFarmerRequests();
      if (result?.success) {
        setFarmerRequests(normalizeFarmerRequests(result));
      }
    } catch (error) {
      Alert.alert('Purchase Requests', error.message || 'Action failed.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleMarkMaintained = async pond => {
    try {
      await farmApi.markPondMaintained(pond.id);
      await loadDashboard();
      Alert.alert('Maintenance', `${pond.pondName} marked as maintained.`);
    } catch (error) {
      Alert.alert(
        'Maintenance',
        error.message || 'Failed to mark pond as maintained.',
      );
    }
  };

  const openFinancialDetails = async pond => {
    setFinancialsModal(pond);
    setFinancialsLoading(true);
    setFinancialsData(null);
    try {
      const response = await farmApi.getPondFinancials(pond.id);
      setFinancialsData(response?.data || response || null);
    } catch (error) {
      Alert.alert(
        'Pond Details',
        error.message || 'Failed to load pond financial details.',
      );
    } finally {
      setFinancialsLoading(false);
    }
  };

  const openDiseaseLogger = pond => {
    setDiseaseModal({ mode: 'create', pond });
    setDiseaseForm(emptyDiseaseForm);
    setDiseaseSearch('');
  };

  const getDiseaseCatalogItem = diseaseId =>
    diseaseCatalog.find(
      disease => String(disease.DiseaseId) === String(diseaseId),
    );

  const getDiseaseName = disease =>
    disease?.DiseaseName || disease?.name || 'Disease';

  const getDiseaseTreatment = disease =>
    disease?.RecommendedTreatment || disease?.treatment || '';

  const getDiseasePrevention = disease =>
    disease?.PreventionTips || disease?.prevention || '';

  const getDiseaseSymptoms = disease =>
    disease?.Symptoms || disease?.symptoms || '';

  const getDiseaseAffectedSpecies = disease =>
    disease?.AffectedSpecies || disease?.species || '';

  const selectDiseaseCatalogItem = disease => {
    setDiseaseForm(prev => ({
      ...prev,
      diseaseId: String(disease.DiseaseId),
      customDiseaseName: '',
      severity: disease.Severity || prev.severity || 'Moderate',
    }));
    setDiseaseSearch(getDiseaseName(disease));
  };

  const getDiseaseFishKey = fish =>
    fish?.batchId
      ? String(fish.batchId)
      : fish?.speciesId
      ? `species-${fish.speciesId}`
      : 'whole-pond';

  const selectDiseaseFish = fish => {
    const key = getDiseaseFishKey(fish);
    setDiseaseForm(prev => ({
      ...prev,
      affectedBatches: {
        ...prev.affectedBatches,
        [key]: {
          speciesId: fish?.speciesId ? String(fish.speciesId) : '',
          batchId: fish?.batchId ? String(fish.batchId) : '',
          speciesName: fish?.species || 'Whole pond',
          available: Number(fish?.quantity || 0),
          affectedCount: prev.affectedBatches?.[key]?.affectedCount || '',
        },
      },
    }));
  };

  const removeDiseaseFish = key => {
    setDiseaseForm(prev => {
      const next = { ...(prev.affectedBatches || {}) };
      delete next[key];
      return { ...prev, affectedBatches: next };
    });
  };

  const updateDiseaseFishCount = (key, affectedCount) => {
    setDiseaseForm(prev => ({
      ...prev,
      affectedBatches: {
        ...(prev.affectedBatches || {}),
        [key]: {
          ...prev.affectedBatches[key],
          affectedCount: affectedCount.replace(/[^0-9]/g, ''),
        },
      },
    }));
  };

  const useCustomDisease = () => {
    setDiseaseForm(prev => ({
      ...prev,
      diseaseId: '',
      customDiseaseName: prev.customDiseaseName || diseaseSearch.trim(),
    }));
  };

  const getFilteredDiseaseCatalog = () => {
    const query = diseaseSearch.trim().toLowerCase();
    if (!query) return diseaseCatalog.slice(0, 8);

    return diseaseCatalog
      .filter(disease => {
        const haystack = [
          getDiseaseName(disease),
          disease.Category,
          disease.Severity,
          getDiseaseSymptoms(disease),
          getDiseaseAffectedSpecies(disease),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 10);
  };

  const getOutbreakDisplayTreatment = outbreak =>
    outbreak.RecommendedTreatment ||
    getDiseaseTreatment(getDiseaseCatalogItem(outbreak.DiseaseId));

  const getOutbreakDisplayPrevention = outbreak =>
    outbreak.PreventionTips ||
    getDiseasePrevention(getDiseaseCatalogItem(outbreak.DiseaseId));

  const openDiseaseEditor = (pond, outbreak) => {
    setDiseaseModal({ mode: 'edit', pond, outbreak });
    setDiseaseForm({
      diseaseId: outbreak.DiseaseId ? String(outbreak.DiseaseId) : '',
      customDiseaseName: outbreak.DiseaseId
        ? ''
        : outbreak.DiseaseName ||
          outbreak.CustomDiseaseName ||
          outbreak.customDiseaseName ||
          '',
      speciesId: outbreak.SpeciesId ? String(outbreak.SpeciesId) : '',
      batchId:
        outbreak.AffectedBatchId || outbreak.BatchId
          ? String(outbreak.AffectedBatchId || outbreak.BatchId)
          : '',
      severity: outbreak.Severity || outbreak.severity || 'Moderate',
      status: outbreak.Status || outbreak.status || 'Active',
      estimatedAffectedCount: String(
        outbreak.EstimatedAffectedCount ||
          outbreak.estimatedAffectedCount ||
          '',
      ),
      affectedBatches:
        outbreak.AffectedBatchId || outbreak.SpeciesId
          ? {
              [String(
                outbreak.AffectedBatchId || `species-${outbreak.SpeciesId}`,
              )]: {
                speciesId: outbreak.SpeciesId ? String(outbreak.SpeciesId) : '',
                batchId: outbreak.AffectedBatchId
                  ? String(outbreak.AffectedBatchId)
                  : '',
                speciesName: outbreak.AffectedSpeciesName || 'Affected fish',
                available: 0,
                affectedCount: String(
                  outbreak.EstimatedAffectedCount ||
                    outbreak.estimatedAffectedCount ||
                    '',
                ),
              },
            }
          : {},
      symptomsObserved:
        outbreak.SymptomsObserved || outbreak.symptomsObserved || '',
      notes: outbreak.Notes || outbreak.notes || '',
    });
    setDiseaseSearch(outbreak.DiseaseName || '');
  };

  const handleSaveDisease = async () => {
    if (!diseaseModal?.pond?.id) return;
    const selectedDisease = getDiseaseCatalogItem(diseaseForm.diseaseId);
    const diseaseName = diseaseForm.customDiseaseName.trim();
    if (!selectedDisease && !diseaseName) {
      Alert.alert(
        'Disease Log',
        'Choose a disease or enter a custom disease name.',
      );
      return;
    }

    setSavingDisease(true);
    try {
      const affectedEntries = Object.values(diseaseForm.affectedBatches || {});
      const basePayload = {
        pondId: diseaseModal.pond.id,
        diseaseId: selectedDisease ? Number(diseaseForm.diseaseId) : null,
        customDiseaseName: selectedDisease ? null : diseaseName,
        severity: diseaseForm.severity || 'Moderate',
        status: diseaseForm.status || 'Active',
        symptomsObserved: diseaseForm.symptomsObserved,
        notes: diseaseForm.notes,
      };

      if (diseaseModal.mode === 'edit') {
        const outbreakId =
          diseaseModal.outbreak?.OutbreakId || diseaseModal.outbreak?.id;
        const affected = affectedEntries[0];
        await farmApi.updateOutbreak(outbreakId, {
          ...basePayload,
          speciesId: affected?.speciesId ? Number(affected.speciesId) : null,
          batchId: affected?.batchId ? Number(affected.batchId) : null,
          estimatedAffectedCount: affected?.affectedCount
            ? Number(affected.affectedCount)
            : diseaseForm.estimatedAffectedCount
            ? Number(diseaseForm.estimatedAffectedCount)
            : null,
        });
      } else if (affectedEntries.length > 0) {
        await Promise.all(
          affectedEntries.map(affected =>
            farmApi.logOutbreak({
              ...basePayload,
              speciesId: affected.speciesId ? Number(affected.speciesId) : null,
              batchId: affected.batchId ? Number(affected.batchId) : null,
              estimatedAffectedCount: affected.affectedCount
                ? Number(affected.affectedCount)
                : null,
            }),
          ),
        );
      } else {
        await farmApi.logOutbreak({
          ...basePayload,
          speciesId: null,
          batchId: null,
          estimatedAffectedCount: null,
        });
      }

      const updatedOutbreaks = await farmApi.getOutbreaks().catch(() => []);
      setDiseaseOutbreaks(
        Array.isArray(updatedOutbreaks) ? updatedOutbreaks : [],
      );
      setDiseaseModal(null);
      setDiseaseForm(emptyDiseaseForm);
    } catch (error) {
      Alert.alert(
        'Disease Log',
        error.message || 'Failed to save disease log.',
      );
    } finally {
      setSavingDisease(false);
    }
  };

  const deletePond = pond => {
    Alert.alert('Delete Pond', `Delete pond "${pond.pondName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await farmApi.deletePond(pond.id);
          loadDashboard();
        },
      },
    ]);
  };

  const toggleExpandPond = pondId => {
    setExpandedPonds(prev => ({ ...prev, [pondId]: !prev[pondId] }));
  };

  const applyLocalFishSizeUpdate = ({
    pondId,
    speciesId,
    currentSizeInches,
    targetSizeInches,
  }) => {
    const hasCurrent = currentSizeInches !== undefined;
    const hasTarget = targetSizeInches !== undefined;
    if (!hasCurrent && !hasTarget) return;

    setFishSizeData(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const pondIndex = next.findIndex(
        item => Number(item.pondId ?? item.PondId) === Number(pondId),
      );
      const pondEntry =
        pondIndex >= 0
          ? { ...next[pondIndex] }
          : { pondId: Number(pondId), species: [] };
      const speciesList = Array.isArray(pondEntry.species)
        ? [...pondEntry.species]
        : [];
      const speciesIndex = speciesList.findIndex(
        item => Number(item.speciesId ?? item.SpeciesId) === Number(speciesId),
      );
      const speciesEntry =
        speciesIndex >= 0
          ? { ...speciesList[speciesIndex] }
          : { speciesId: Number(speciesId) };

      if (hasCurrent) {
        speciesEntry.currentSizeInches = Number(currentSizeInches);
        speciesEntry.estimatedWeightKg = inchesToKg(Number(currentSizeInches));
      }
      if (hasTarget) {
        speciesEntry.targetSizeInches = Number(targetSizeInches);
        speciesEntry.targetSizeSource = 'custom';
      }

      if (speciesIndex >= 0) speciesList[speciesIndex] = speciesEntry;
      else speciesList.push(speciesEntry);
      pondEntry.species = speciesList;

      if (pondIndex >= 0) next[pondIndex] = pondEntry;
      else next.push(pondEntry);
      return next;
    });

    setPonds(prev =>
      prev.map(pond => {
        if (Number(pond.id) !== Number(pondId)) return pond;
        return {
          ...pond,
          species: (pond.species || []).map(fish => {
            if (Number(fish.speciesId) !== Number(speciesId)) return fish;
            return {
              ...fish,
              currentSize: hasCurrent
                ? Number(currentSizeInches)
                : fish.currentSize,
              targetSize: hasTarget
                ? Number(targetSizeInches)
                : fish.targetSize,
            };
          }),
        };
      }),
    );
  };

  const openSizeEditor = (
    pondId,
    speciesId,
    batchId,
    speciesName,
    currentSize,
    targetSize,
  ) => {
    setSizeEditModal({ pondId, speciesId, batchId, speciesName });
    setEditSizeValue(currentSize ? String(currentSize) : '');
    setEditTargetValue(targetSize ? String(targetSize) : '');
  };

  const openFishActionPrompt = ({
    pond,
    fish,
    currentSize,
    targetSize,
    readyLabel,
  }) => {
    const isNursery = isNurseryStageName(pond.stage);
    const current = roundToTenth(currentSize);
    const target = roundToTenth(targetSize || getDefaultTargetSize(pond.stage));
    const messageParts = [
      `${fish.species}: ${Number(fish.quantity || 0).toLocaleString()} fish.`,
      current > 0
        ? `Current size: ${current.toFixed(1)}".`
        : 'Current size not recorded.',
      target > 0 ? `Target size: ${target.toFixed(1)}".` : null,
      readyLabel ? `Status: ${readyLabel}.` : null,
      'You can transfer or harvest all or part of this stock.',
    ].filter(Boolean);

    Alert.alert('Fish action', messageParts.join('\n'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isNursery ? 'Transfer' : 'Transfer',
        onPress: () =>
          navigation.navigate('StockManagement', {
            transferSpeciesId: fish.speciesId,
            transferFromPondId: pond.id,
            transferStockId: fish.batchId || fish.id,
            action: 'transfer',
            source: 'dashboard-card',
          }),
      },
      {
        text: 'Harvest',
        onPress: () =>
          navigation.navigate('HarvestFish', {
            pond,
            harvestSpeciesId: fish.speciesId,
            harvestQuantity: fish.quantity,
            harvestReason:
              current >= target && target > 0
                ? 'Target size reached'
                : 'Manual partial harvest',
          }),
      },
      {
        text: 'Update Size',
        onPress: () =>
          openSizeEditor(
            pond.id,
            fish.speciesId,
            fish.batchId,
            fish.species,
            currentSize,
            targetSize,
          ),
      },
    ]);
  };

  const handleUpdateSize = async () => {
    if (!sizeEditModal) return;

    const currentSizeInches = parseFloat(editSizeValue);
    const targetSizeInches = parseFloat(editTargetValue);

    if (isNaN(currentSizeInches) && isNaN(targetSizeInches)) {
      Alert.alert('Update Size', 'Please enter at least one size value.');
      return;
    }

    setUpdatingSize(true);
    try {
      if (!sizeEditModal.batchId) {
        throw new Error('No stock batch found for this fish size update.');
      }

      const res = await farmApi.updateStocking(sizeEditModal.batchId, {
        currentSize: isNaN(currentSizeInches) ? undefined : currentSizeInches,
        targetSize: isNaN(targetSizeInches) ? undefined : targetSizeInches,
        recordDate: new Date().toISOString().slice(0, 10),
      });
      const savedCurrentSize =
        res?.currentSizeInches ??
        (isNaN(currentSizeInches) ? undefined : currentSizeInches);
      const savedTargetSize =
        res?.targetSizeInches ??
        (isNaN(targetSizeInches) ? undefined : targetSizeInches);

      const alert = res?.targetReachedAlert;
      const recommendation = res?.stageRecommendation;

      if (alert && recommendation) {
        if (recommendation.action === 'TRANSFER_TO_GROWOUT') {
          // Nursery → Grow-out transfer needed
          Alert.alert(
            '⚠️ Transfer to Grow-out Required',
            `${alert.message}\n\nAction: ${recommendation.reason}`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Transfer Now',
                onPress: () => {
                  navigation.navigate('StockManagement', {
                    transferSpeciesId: alert.speciesId,
                    transferFromPondId: alert.pondId,
                    transferReason: 'Nursery target size reached',
                  });
                },
              },
            ],
          );
        } else if (recommendation.action === 'LIST_ON_MARKETPLACE') {
          // Grow-out → Marketplace listing needed
          Alert.alert(
            '🎉 Ready for Marketplace!',
            `${
              alert.message
            }\n\nEstimated weight: ${alert.estimatedWeightKg?.toFixed(
              2,
            )} kg per fish\n\nAction: ${recommendation.reason}`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Go to Marketplace',
                onPress: () => {
                  navigation.navigate('Marketplace');
                },
              },
              {
                text: 'Harvest Now',
                onPress: () => {
                  navigation.navigate('HarvestFish', {
                    pond: { id: alert.pondId, pondName: alert.pondName },
                    harvestSpeciesId: alert.speciesId,
                    harvestReason: 'Target/market size reached',
                  });
                },
              },
            ],
          );
        } else {
          Alert.alert(
            'Stage Change Recommended',
            `${recommendation.reason}\n\nConsider transferring to ${recommendation.recommendedStage} stage.`,
          );
        }
      } else if (recommendation) {
        Alert.alert(
          'Stage Change Recommended',
          `${recommendation.reason}\n\nConsider transferring to ${recommendation.recommendedStage} stage.`,
        );
      } else {
        Alert.alert('Success', 'Fish size/Age updated successfully.');
      }

      setSizeEditModal(null);
      await loadDashboard();
      applyLocalFishSizeUpdate({
        pondId: sizeEditModal.pondId,
        speciesId: sizeEditModal.speciesId,
        currentSizeInches: savedCurrentSize,
        targetSizeInches: savedTargetSize,
      });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update fish age.');
    } finally {
      setUpdatingSize(false);
    }
  };

  // Merge fish size data with pond data
  const getSizeDataForPond = pondId => {
    return (
      fishSizeData.find(d => Number(d.pondId ?? d.PondId) === Number(pondId)) ||
      null
    );
  };

  // Get alerts for a specific pond
  const getAlertsForPond = pondId => {
    const fromGlobal = (shiftAlerts?.alerts || []).filter(
      a => Number(a.pondId) === Number(pondId),
    );
    if (fromGlobal.length > 0) return fromGlobal;

    const sizeData = getSizeDataForPond(pondId);
    return Array.isArray(sizeData?.alerts) ? sizeData.alerts : [];
  };

  const getAlertsModalList = () => {
    if (!alertsModal || !shiftAlerts?.alerts) return [];

    if (alertsModal.filter === 'critical') {
      return shiftAlerts.alerts.filter(a => a.severity === 'high');
    }

    if (alertsModal.filter === 'pond' && alertsModal.pondId) {
      return getAlertsForPond(alertsModal.pondId);
    }

    return shiftAlerts.alerts;
  };

  const selectedDisease = getDiseaseCatalogItem(diseaseForm.diseaseId);
  const filteredDiseaseCatalog = getFilteredDiseaseCatalog();

  return (
    <AppScaffold
      title="Dashboard"
      subtitle="Create and manage your fish farming ponds"
      navigation={navigation}
      currentRoute="Dashboard"
      startTourOnMount={shouldAutoStartTour}
    >
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : farmMissing ? (
        <Card style={styles.setupCard}>
          <Fish size={42} color="#2563EB" />
          <Text style={styles.setupTitle}>Set up your farm</Text>
          <Text style={styles.setupText}>
            The web dashboard starts farmers with a farm setup flow before pond
            management. Create your farm area and region first, then provision
            ponds from the planner.
          </Text>
          <View style={styles.quickActions}>
            <PrimaryButton
              title="Start Farm Setup"
              onPress={() => navigation.navigate('WelcomeSetup')}
              style={styles.quickPrimaryButton}
            />
            <TouchableOpacity
              style={styles.quickSecondaryButton}
              onPress={() => navigation.navigate('FarmPlanner')}
            >
              <Text style={styles.quickSecondaryText}>Open Planner</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <>
          <View style={styles.quickActions}>
            <PrimaryButton
              title="+ Add New Pond"
              onPress={() => navigation.navigate('AddPond')}
              style={styles.quickPrimaryButton}
            />
            <TouchableOpacity
              style={styles.quickSecondaryButton}
              onPress={openOverview}
            >
              <BarChart3 size={15} color="#2563EB" />
              <Text style={styles.quickSecondaryText}>Get Overview</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickSecondaryButton, styles.quickSuccessButton]}
              onPress={openSummarySheet}
            >
              <ClipboardList size={15} color="#059669" />
              <Text style={styles.quickSuccessText}>Summary Sheet</Text>
            </TouchableOpacity>
          </View>

          {farmSetup && (
            <Card style={styles.farmSummaryCard}>
              <Text style={styles.farmSummaryTitle}>
                Farm Area: {Number(farmSetup.totalArea || 0).toLocaleString()}{' '}
                acres
              </Text>
              <Text style={styles.farmSummaryText}>
                Region: {farmSetup.province || 'Not set'} | Remaining:{' '}
                {Number(areaUsage?.remainingArea || 0).toFixed(2)} acres
              </Text>
              <View style={styles.farmCardActions}>
                <TouchableOpacity
                  style={styles.farmCardAction}
                  onPress={() => setRequestsModal(true)}
                >
                  <ShoppingCart size={16} color="#2563EB" />
                  <Text style={styles.quickSecondaryText}>
                    Requests{totalRequestCount ? ` (${totalRequestCount})` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.farmCardAction, styles.quickDangerButton]}
                  onPress={handleDeleteFarm}
                >
                  <Trash2 size={16} color="#DC2626" />
                  <Text style={styles.quickDangerText}>Delete Farm</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {/* Global Shift Alerts Banner */}
          {shiftAlerts && shiftAlerts.highCount > 0 && (
            <TouchableOpacity
              style={styles.globalAlertBanner}
              onPress={() => setAlertsModal({ filter: 'critical' })}
            >
              <Bell size={18} color="#DC2626" />
              <Text style={styles.globalAlertText}>
                {shiftAlerts.highCount} critical alert(s) — fish need shifting
                or harvesting
              </Text>
              <ChevronDown
                size={16}
                color="#DC2626"
                style={{ transform: [{ rotate: '-90deg' }] }}
              />
            </TouchableOpacity>
          )}

          {Number(areaUsage?.remainingArea || 0) > 0 &&
            Number(areaUsage?.remainingArea || 0) < 1 && (
              <Card style={styles.warningCard}>
                <AlertTriangle size={18} color="#B45309" />
                <Text style={styles.warningText}>
                  Low space remaining. Consider expanding your farm area.
                </Text>
              </Card>
            )}

          {waterAlerts.length > 0 && (
            <Card style={styles.waterAlertCard}>
              <Droplets size={18} color="#1D4ED8" />
              <Text style={styles.waterAlertText}>
                {waterAlerts.length} critical water quality alert(s) need
                attention.
              </Text>
            </Card>
          )}

          {activeDiseaseCount > 0 && (
            <Card style={styles.diseaseAlertCard}>
              <Skull size={18} color="#BE123C" />
              <Text style={styles.diseaseAlertText}>
                {activeDiseaseCount} active disease outbreak(s) recorded.
              </Text>
            </Card>
          )}

          <View style={styles.statsGrid}>
            <StatCard label="Total Ponds" value={ponds.length} />
            <StatCard
              label="Total Fish Species"
              value={totalFish.toLocaleString()}
              accent="#059669"
            />
            <StatCard
              label="Est. biomass (all ponds)"
              value={`${totalBiomassKg.toFixed(1)} kg`}
              accent="#0D9488"
            />
            <StatCard
              label="Total Expenses"
              value={`PKR ${Number(
                budgetStats?.totalAllTime || 0,
              ).toLocaleString()}`}
              accent="#B45309"
            />
            <StatCard
              label="Feed Due"
              value={dueFeedCount.toLocaleString()}
              accent="#7C3AED"
            />
            <StatCard
              label="Requests"
              value={totalRequestCount.toLocaleString()}
              accent="#2563EB"
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Ponds ({ponds.length})</Text>
            <TouchableOpacity
              style={styles.sectionAction}
              onPress={() => navigation.navigate('FarmPlanner')}
            >
              <Text style={styles.sectionActionText}>Planner</Text>
            </TouchableOpacity>
          </View>

          {ponds.length === 0 ? (
            <EmptyState
              title="No ponds yet"
              text="Add a pond or use the planner to start your farm structure."
            />
          ) : (
            ponds.map((pond, index) => {
              const sizeData = getSizeDataForPond(pond.id);
              const pondAlerts = getAlertsForPond(pond.id);
              const pondDiseases = getPondDiseaseOutbreaks(pond.id);
              const pondFeedSchedule = getPondFeedSchedule(pond.id);
              const pondFcr = fcrData[pond.id];
              const pondCapacity =
                sizeData?.capacity ||
                (pond.maxTotalFish
                  ? {
                      maxTotalFish: pond.maxTotalFish,
                      maxFishPerAcre: pond.maxFishPerAcre,
                      remainingCapacity: pond.remainingCapacity,
                      isOverCapacity: pond.isOverCapacity,
                      capacityUsedPercent: pond.capacityUsedPercent,
                      cultivationType:
                        pond.CultivationType || pond.cultivationType,
                    }
                  : null);
              const capacityUsedPercent =
                pondCapacity?.maxTotalFish > 0
                  ? Math.min(
                      999,
                      Math.round(
                        (Number(pond.totalFish || 0) /
                          Number(pondCapacity.maxTotalFish || 1)) *
                          100,
                      ),
                    )
                  : 0;
              const isExpanded = expandedPonds[pond.id] || false;
              const hasHighAlerts = pondAlerts.some(a => a.severity === 'high');

              return (
                <Card
                  key={pond.id || pond.pondName}
                  style={hasHighAlerts ? styles.alertCard : null}
                >
                  <View style={styles.pondHeader}>
                    <View style={styles.pondTitleWrap}>
                      <View style={styles.pondTitleRow}>
                        <Text style={styles.pondTitle}>{pond.pondName}</Text>
                        {hasHighAlerts && (
                          <AlertTriangle size={16} color="#DC2626" />
                        )}
                      </View>
                      <Text style={styles.pondMeta}>
                        {pond.size || 0} acres | {(pond.species || []).length}{' '}
                        stocked batches | Stage: {pond.stage}
                      </Text>
                      {pondCapacity && (
                        <TouchableOpacity
                          style={styles.capacityTopRow}
                          onPress={() => toggleExpandPond(pond.id)}
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.capacityCircle,
                              pondCapacity.isOverCapacity &&
                                styles.capacityCircleOver,
                              !pondCapacity.isOverCapacity &&
                                capacityUsedPercent >= 80 &&
                                styles.capacityCircleWarn,
                            ]}
                          >
                            <Text
                              style={[
                                styles.capacityCircleValue,
                                pondCapacity.isOverCapacity &&
                                  styles.capacityCircleValueOver,
                              ]}
                            >
                              {capacityUsedPercent}%
                            </Text>
                          </View>
                          <View style={styles.capacityTopTextWrap}>
                            <Text style={styles.capacityTopLabel}>
                              Filled capacity
                            </Text>
                            <Text style={styles.capacityTopValue}>
                              {Number(pond.totalFish || 0).toLocaleString()} /{' '}
                              {Number(
                                pondCapacity.maxTotalFish || 0,
                              ).toLocaleString()}{' '}
                              fish
                            </Text>
                            <Text style={styles.capacityTopHint}>
                              {Number(
                                pondCapacity.maxFishPerAcre || 0,
                              ).toLocaleString()}
                              /acre,{' '}
                              {pondCapacity.cultivationType || 'Extensive'}
                            </Text>
                          </View>
                          {isExpanded ? (
                            <ChevronUp size={14} color="#6B7280" />
                          ) : (
                            <ChevronDown size={14} color="#6B7280" />
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={styles.pondBadgesRow}>
                        {pondDiseases.length > 0 && (
                          <View style={styles.diseaseBadge}>
                            <Skull size={11} color="#BE123C" />
                            <Text style={styles.diseaseBadgeText}>
                              {pondDiseases.length} Disease
                            </Text>
                          </View>
                        )}
                        {pondFeedSchedule.some(item =>
                          ['overdue', 'due_soon'].includes(
                            String(item.status || '').toLowerCase(),
                          ),
                        ) && (
                          <View style={styles.feedDueBadge}>
                            <Utensils size={11} color="#7C3AED" />
                            <Text style={styles.feedDueBadgeText}>
                              Feed due
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.pondHeaderRight}>
                      <Tag>{pond.pondType}</Tag>
                      <View style={styles.cardIconActions}>
                        <TouchableOpacity
                          style={styles.iconAction}
                          onPress={() =>
                            navigation.navigate('AddPond', { pond })
                          }
                          accessibilityLabel="Edit pond"
                        >
                          <Pencil size={18} color="#2563EB" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconAction, styles.iconActionDanger]}
                          onPress={() => deletePond(pond)}
                          accessibilityLabel="Delete pond"
                        >
                          <Trash2 size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Pond Alerts */}
                  {pondAlerts.length > 0 && (
                    <View style={styles.pondAlertsWrap}>
                      {pondAlerts.slice(0, 3).map((alert, idx) => {
                        const colors =
                          SEVERITY_COLORS[alert.severity] ||
                          SEVERITY_COLORS.low;
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.pondAlertItem,
                              {
                                backgroundColor: colors.bg,
                                borderColor: colors.border,
                              },
                            ]}
                          >
                            <AlertTriangle size={14} color={colors.icon} />
                            <Text
                              style={[
                                styles.pondAlertText,
                                { color: colors.text },
                              ]}
                              numberOfLines={2}
                            >
                              {alert.message}
                            </Text>
                          </View>
                        );
                      })}
                      {pondAlerts.length > 3 && (
                        <TouchableOpacity
                          onPress={() =>
                            setAlertsModal({ filter: 'pond', pondId: pond.id })
                          }
                        >
                          <Text style={styles.moreAlertsText}>
                            +{pondAlerts.length - 3} more alerts — tap to view
                            all
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {pondFeedSchedule.length > 0 && (
                    <View style={styles.feedScheduleBox}>
                      <Text style={styles.feedScheduleTitle}>
                        Feeding Schedule
                      </Text>
                      {pondFeedSchedule.slice(0, 3).map((item, feedIndex) => (
                        <Text
                          key={`${item.pondId}-${item.speciesId}-${item.feedType}-${item.status}-${feedIndex}`}
                          style={styles.feedScheduleText}
                        >
                          {item.speciesName}: {item.feedType || 'Feed'} |{' '}
                          {item.frequency || 'frequency N/A'} |{' '}
                          {item.status || 'on_track'}
                        </Text>
                      ))}
                    </View>
                  )}

                  {pondDiseases.length > 0 && (
                    <View style={styles.activeDiseaseBox}>
                      <Text style={styles.activeDiseaseTitle}>
                        Active Diseases & Treatment Guidance
                      </Text>
                      {pondDiseases.slice(0, 3).map(outbreak => (
                        <View
                          key={outbreak.OutbreakId || outbreak.id}
                          style={styles.activeDiseaseItem}
                        >
                          <View style={styles.activeDiseaseHeader}>
                            <Text style={styles.activeDiseaseName}>
                              {outbreak.DiseaseName || 'Disease'}
                            </Text>
                            <TouchableOpacity
                              onPress={() => openDiseaseEditor(pond, outbreak)}
                            >
                              <Text style={styles.activeDiseaseEdit}>Edit</Text>
                            </TouchableOpacity>
                          </View>
                          {getOutbreakDisplayTreatment(outbreak) ? (
                            <Text style={styles.activeDiseaseText}>
                              Treatment: {getOutbreakDisplayTreatment(outbreak)}
                            </Text>
                          ) : null}
                          {getOutbreakDisplayPrevention(outbreak) ? (
                            <Text style={styles.activeDiseaseText}>
                              Prevention:{' '}
                              {getOutbreakDisplayPrevention(outbreak)}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.SummaryTitle}> Fish Summary Sheet</Text>
                  {/* Fish Species with Sizes */}
                  {(pond.species || []).length === 0 ? (
                    <Text style={styles.muted}>No fish stocked yet.</Text>
                  ) : (
                    <View style={styles.fishListWrap}>
                      {pond.species.map((fish, fishIndex) => {
                        const sizeInfo = sizeData?.species?.find(
                          s =>
                            Number(s.speciesId ?? s.SpeciesId) ===
                            Number(fish.speciesId),
                        );
                        const capInfo =
                          sizeData?.capacity?.perSpecies?.find(
                            s =>
                              Number(s.speciesId ?? s.SpeciesId) ===
                              Number(fish.speciesId),
                          ) ||
                          (pondCapacity?.maxTotalFish
                            ? {
                                isOverCapacity: pond.isOverCapacity,
                                maxCapacityAtCurrentStage:
                                  pondCapacity.maxTotalFish,
                                remainingCapacity: pond.remainingCapacity,
                              }
                            : null);

                        // const capacityInfo =
                        //   sizeData?.capacity?.perSpecies?.find(
                        //     s =>
                        //       Number(s.speciesId ?? s.SpeciesId) ===
                        //       Number(fish.speciesId),
                        //   ) ||
                        //   (FishCapacity?.maxTotalFish
                        //     ? {
                        //         isOverCapacity: pond.isOverCapacity,
                        //         maxCapacityAtCurrentStage:
                        //           pondCapacity.maxTotalFish,
                        //         remainingCapacity: pond.remainingCapacity,
                        //       }
                        //     : null);

                        const rawCurrentSize = toNumber(
                          sizeInfo?.currentSizeInches ??
                            sizeInfo?.CurrentSizeInches ??
                            fish.currentSize,
                        );
                        const currentSize =
                          isGrowoutStageName(pond.stage) &&
                          rawCurrentSize > 0 &&
                          rawCurrentSize < NURSERY_TARGET_INCHES
                            ? NURSERY_TARGET_INCHES
                            : rawCurrentSize;
                        const comparableCurrentSize = roundToTenth(currentSize);
                        const targetSize = getEffectiveTargetSize(
                          pond.stage,
                          sizeInfo?.targetSizeInches ??
                            sizeInfo?.TargetSizeInches ??
                            fish.targetSize,
                        );
                        const comparableTargetSize = roundToTenth(targetSize);
                        const defaultTargetSize = getDefaultTargetSize(
                          pond.stage,
                        );
                        const isDefaultTarget =
                          targetSize === defaultTargetSize &&
                          !toNumber(
                            sizeInfo?.targetSizeInches ??
                              sizeInfo?.TargetSizeInches ??
                              fish.targetSize,
                          );
                        const estWeight =
                          toNumber(
                            sizeInfo?.estimatedWeightKg ??
                              sizeInfo?.EstimatedWeightKg,
                          ) || inchesToKg(currentSize);
                        const fishAlerts = pondAlerts.filter(
                          alert =>
                            Number(alert.speciesId ?? alert.SpeciesId) ===
                            Number(fish.speciesId),
                        );
                        const readyAlert = fishAlerts.find(alert =>
                          [
                            'SHIFT_TO_GROWOUT',
                            'NURSERY_TARGET_REACHED',
                            'READY_FOR_NURSERY_HARVEST',
                            'READY_FOR_HARVEST',
                            'GROWOUT_TARGET_REACHED',
                          ].includes(alert.type),
                        );
                        const isReady =
                          !!readyAlert ||
                          (currentSize > 0 &&
                            targetSize > 0 &&
                            comparableCurrentSize >= comparableTargetSize);
                        const isNurseryStage = isNurseryStageName(pond.stage);
                        const readyLabel =
                          readyAlert?.action === 'TRANSFER_TO_GROWOUT' ||
                          readyAlert?.type === 'SHIFT_TO_GROWOUT' ||
                          readyAlert?.type === 'NURSERY_TARGET_REACHED' ||
                          (!readyAlert &&
                            isNurseryStage &&
                            comparableCurrentSize >= NURSERY_TARGET_INCHES)
                            ? 'Ready to transfer to Grown-out stage'
                            : isGrowoutStageName(pond.stage)
                            ? 'Target size reached'
                            : 'Ready for action';

                        return (
                          <TouchableOpacity
                            key={`${pond.id}-${
                              fish.batchId || fish.id || fish.speciesId
                            }-${fishIndex}`}
                            style={[
                              styles.fishRowEnhanced,
                              isReady && styles.fishRowReady,
                              isReady &&
                                isGrowoutStageName(pond.stage) &&
                                styles.fishRowTargetReached,
                            ]}
                            activeOpacity={0.85}
                            onPress={() =>
                              openFishActionPrompt({
                                pond,
                                fish,
                                currentSize,
                                targetSize,
                                readyLabel: isReady ? readyLabel : '',
                              })
                            }
                          >
                            <View style={styles.fishRowMain}>
                              <Fish
                                size={16}
                                color={isReady ? '#047857' : '#2563EB'}
                              />
                              <View style={styles.fishInfoWrap}>
                                <Text style={styles.fishText}>
                                  {fish.species}:{' '}
                                  {Number(fish.quantity || 0).toLocaleString()}{' '}
                                  fish
                                </Text>
                                {isReady && (
                                  <View style={styles.fishReadyBadge}>
                                    <TrendingUp size={12} color="#047857" />
                                    <Text style={styles.fishReadyBadgeText}>
                                      {readyLabel}
                                    </Text>
                                  </View>
                                )}
                                <View style={styles.fishSizeRow}>
                                  {currentSize > 0 ? (
                                    <>
                                      <Ruler size={12} color="#6B7280" />
                                      <Text style={styles.fishSizeText}>
                                        {currentSize.toFixed(1)}" /{' '}
                                        {estWeight.toFixed(2)} kg
                                      </Text>
                                    </>
                                  ) : (
                                    <Text style={styles.fishSizeTextMuted}>
                                      Size not recorded
                                    </Text>
                                  )}
                                  {targetSize > 0 && (
                                    <Text
                                      style={[
                                        styles.targetSizeText,
                                        isReady && styles.targetSizeReadyText,
                                      ]}
                                    >
                                      Target: {targetSize.toFixed(1)}"
                                      {isDefaultTarget ? ' default' : ''}
                                    </Text>
                                  )}
                                  {capInfo?.isOverCapacity && (
                                    <Text
                                      style={[
                                        styles.capacityText,
                                        capInfo.isOverCapacity &&
                                          styles.overCapacityText,
                                      ]}
                                    >
                                      Over capacity (max:{' '}
                                      {capInfo.maxCapacityAtCurrentStage?.toLocaleString()}
                                      )
                                    </Text>
                                  )}
                                </View>
                              </View>
                              <TouchableOpacity
                                style={styles.editSizeBtn}
                                onPress={() =>
                                  openSizeEditor(
                                    pond.id,
                                    fish.speciesId,
                                    fish.batchId,
                                    fish.species,
                                    currentSize,
                                    targetSize,
                                  )
                                }
                              >
                                <Pencil size={14} color="#2563EB" />
                              </TouchableOpacity>
                            </View>
                            <View style={styles.fishInlineActions}>
                              <TouchableOpacity
                                style={styles.fishMiniAction}
                                onPress={() =>
                                  navigation.navigate('StockManagement', {
                                    pond,
                                    initialPondId: pond.id,
                                    transferFromPondId: pond.id,
                                    transferSpeciesId: fish.speciesId,
                                    transferStockId: fish.batchId || fish.id,
                                    transferQuantity: fish.quantity,
                                    action: 'transfer',
                                    source: 'dashboard-card',
                                  })
                                }
                              >
                                <Text style={styles.fishMiniActionText}>
                                  Transfer
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.fishMiniAction,
                                  styles.fishMiniActionHarvest,
                                ]}
                                onPress={() =>
                                  navigation.navigate('HarvestFish', {
                                    pond,
                                    harvestSpeciesId: fish.speciesId,
                                    harvestQuantity: fish.quantity,
                                  })
                                }
                              >
                                <Text style={styles.fishMiniActionText}>
                                  Harvest
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.metricsWrap}>
                    <MetricPill
                      label="Dimensions"
                      value={
                        pond.lengthFeet && pond.widthFeet
                          ? `${Math.round(
                              pond.lengthFeet || 0,
                            )}ft x ${Math.round(
                              pond.widthFeet || 0,
                            )}ft x ${Number(pond.depthFeet || 0).toFixed(1)}ft`
                          : 'Not set'
                      }
                    />
                    <MetricPill
                      label="Water"
                      value={
                        pond.waterGallons
                          ? `${Math.round(
                              pond.waterGallons,
                            ).toLocaleString()} gal`
                          : 'Not set'
                      }
                    />
                    <MetricPill
                      label="Total Fish"
                      value={Number(pond.totalFish || 0).toLocaleString()}
                    />
                    <MetricPill
                      label="Biomass"
                      value={`${Number(pond.biomassKg || 0).toFixed(1)} kg`}
                    />
                    {pondFcr && (
                      <MetricPill
                        label="FCR"
                        value={
                          pondFcr.fcr || pondFcr.FCR
                            ? `${Number(pondFcr.fcr || pondFcr.FCR).toFixed(2)}`
                            : pondFcr.rating || 'N/A'
                        }
                      />
                    )}
                    <MetricPill
                      label="Last Fed"
                      value={formatDate(pond.lastFedAt)}
                    />
                    <MetricPill label="Status" value={pond.status} />
                  </View>

                  <View style={styles.actions}>
                    {pond.needsMaintenance ? (
                      <Action
                        icon={AlertTriangle}
                        label="Mark Maintained"
                        onPress={() => handleMarkMaintained(pond)}
                        danger
                      />
                    ) : (
                      <Action
                        icon={Fish}
                        label="Add Fish"
                        onPress={() =>
                          navigation.navigate('StockManagement', {
                            pond,
                            initialPondId: pond.id,
                            action: 'addFish',
                            source: 'dashboard-card',
                          })
                        }
                      />
                    )}
                    {/* <Action
                      icon={Skull}
                      label="Summary"
                      onPress={() =>
                        navigation.navigate('LogMortality', { pond })
                      }
                      mortality
                    /> */}

                    <Action
                      icon={Scale}
                      label="Harvest"
                      onPress={() =>
                        navigation.navigate('HarvestFish', { pond })
                      }
                    />
                    <Action
                      icon={Droplets}
                      label="Record Water Cycle"
                      onPress={() =>
                        navigation.navigate('RecordWaterCycle', {
                          pond,
                          initialPondId: pond.id,
                          source: 'dashboard-card',
                          mode: 'record',
                        })
                      }
                    />
                    <Action
                      icon={DollarSign}
                      label="Expense"
                      onPress={() =>
                        navigation.navigate('BudgetE', {
                          pond,
                          initialPondId: pond.id,
                          action: 'addExpense',
                          source: 'dashboard-card',
                        })
                      }
                    />
                    <Action
                      icon={Utensils}
                      label="Feed"
                      onPress={() =>
                        navigation.navigate('FeedGuide', {
                          pond,
                          initialPondId: pond.id,
                          action: 'addFeed',
                          source: 'dashboard-card',
                        })
                      }
                    />
                    <Action
                      icon={AlertTriangle}
                      label="Log Disease"
                      onPress={() => openDiseaseLogger(pond)}
                      danger
                    />
                    {pondDiseases.length > 0 && (
                      <Action
                        icon={Pencil}
                        label="Edit Disease"
                        onPress={() => openDiseaseEditor(pond, pondDiseases[0])}
                        danger
                      />
                    )}
                    <Action
                      icon={FlaskConical}
                      label="Fertilize"
                      onPress={() =>
                        navigation.navigate('Fertilization', {
                          pond,
                          initialPondId: pond.id,
                          action: 'applyFertilizer',
                          source: 'dashboard-card',
                        })
                      }
                    />
                    <Action
                      icon={DollarSign}
                      label="Details"
                      onPress={() => openFinancialDetails(pond)}
                    />
                    <Action
                      icon={ArrowRightLeft}
                      label="Transfer"
                      onPress={() =>
                        navigation.navigate('StockManagement', {
                          pond,
                          initialPondId: pond.id,
                          action: 'transfer',
                          source: 'dashboard-card',
                        })
                      }
                    />
                  </View>
                </Card>
              );
            })
          )}

          <Text style={styles.sectionTitle}>Live Activity Feed</Text>
          {activityLogs.length === 0 ? (
            <EmptyState
              title="No activity yet"
              text="Add fish, water data, feed, or expenses to see activity."
            />
          ) : (
            activityLogs.slice(0, 8).map(item => (
              <Card key={item.id} style={styles.activityCard}>
                <Text style={styles.activityMessage}>{item.message}</Text>
                <Text style={styles.activityMeta}>
                  {item.category} {item.time ? `| ${item.time}` : ''}
                </Text>
              </Card>
            ))
          )}

          <Modal visible={overviewModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.sheetModalContent]}>
                <View style={styles.modalHeader}>
                  <View style={styles.sheetTitleRow}>
                    <View style={styles.sheetIcon}>
                      <BarChart3 size={20} color="#2563EB" />
                    </View>
                    <View style={styles.sheetTitleWrap}>
                      <Text style={styles.modalTitle}>
                        Capacity & Compatibility Overview
                      </Text>
                      <Text style={styles.modalSubtitleCompact}>
                        Calculate stocking limits without creating a pond
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setOverviewModal(false)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.sheetScroll}>
                  <View style={styles.sheetGrid}>
                    <Card style={styles.sheetPanel}>
                      <Text style={styles.sheetSectionTitle}>
                        Pond Parameters
                      </Text>
                      <Text style={styles.modalLabel}>Pond Size (Acres)</Text>
                      <TextInput
                        value={overviewParams.pondSize}
                        onChangeText={value =>
                          updateOverviewParam('pondSize', value)
                        }
                        keyboardType="decimal-pad"
                        style={styles.modalInput}
                      />
                      <PickerField
                        label="Stage"
                        selectedValue={overviewParams.stage}
                        options={STAGE_OPTIONS}
                        onValueChange={value =>
                          updateOverviewParam('stage', value)
                        }
                      />
                      <PickerField
                        label="Culture Type"
                        selectedValue={overviewParams.cultureType}
                        options={CULTURE_OPTIONS}
                        onValueChange={value =>
                          updateOverviewParam('cultureType', value)
                        }
                      />
                      <PickerField
                        label="Cultivation Type"
                        selectedValue={overviewParams.cultivationType}
                        options={CULTIVATION_OPTIONS}
                        onValueChange={value =>
                          updateOverviewParam('cultivationType', value)
                        }
                      />
                      <Text style={styles.sheetSectionTitle}>
                        Check Fish Compatibility
                      </Text>
                      <PickerField
                        label="Select Primary Fish"
                        selectedValue={overviewParams.primaryFish}
                        options={overviewFishOptions}
                        onValueChange={value =>
                          updateOverviewParam('primaryFish', value)
                        }
                      />
                    </Card>

                    {isAdminUser ? (
                      <Card style={styles.sheetPanel}>
                        <TouchableOpacity
                          style={styles.densityEditorToggle}
                          onPress={() =>
                            setShowSpeciesDensityEditor(prev => !prev)
                          }
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sheetSectionTitle}>
                              Set Species Capacity
                            </Text>
                            <Text style={styles.sheetSectionHint}>
                              Add or edit each species own fish-per-acre value.
                              The overview sheet uses these numbers directly.
                            </Text>
                          </View>
                          <Text style={styles.densityEditorToggleText}>
                            {showSpeciesDensityEditor ? 'Hide' : 'Edit'}
                          </Text>
                        </TouchableOpacity>

                        {showSpeciesDensityEditor ? (
                          <>
                            {overviewSpeciesList.map(species => (
                              <View
                                key={species.SpeciesId}
                                style={styles.densityEditorRow}
                              >
                                <View style={styles.densityEditorNameWrap}>
                                  <Text style={styles.densityEditorName}>
                                    {species.Name}
                                  </Text>
                                  <Text style={styles.densityEditorMeta}>
                                    Current:{' '}
                                    {Number(
                                      species.MaxStockingDensity || 0,
                                    ).toLocaleString()}{' '}
                                    fish/acre
                                  </Text>
                                </View>
                                <TextInput
                                  value={
                                    speciesDensityDrafts[species.SpeciesId] ??
                                    ''
                                  }
                                  onChangeText={value =>
                                    updateSpeciesDensityDraft(
                                      species.SpeciesId,
                                      value,
                                    )
                                  }
                                  keyboardType="numeric"
                                  placeholder="Fish/acre"
                                  placeholderTextColor="#94A3B8"
                                  style={styles.densityEditorInput}
                                />
                                <TouchableOpacity
                                  style={[
                                    styles.densityEditorSaveButton,
                                    savingSpeciesDensityId ===
                                      species.SpeciesId &&
                                      styles.densityEditorSaveButtonDisabled,
                                  ]}
                                  disabled={
                                    savingSpeciesDensityId === species.SpeciesId
                                  }
                                  onPress={() =>
                                    saveSpeciesDensity(species.SpeciesId)
                                  }
                                >
                                  <Text style={styles.densityEditorSaveText}>
                                    {savingSpeciesDensityId ===
                                    species.SpeciesId
                                      ? 'Saving...'
                                      : 'Save'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ))}

                            <PrimaryButton
                              title={
                                savingSpeciesDensityId === 'all'
                                  ? 'Saving All...'
                                  : 'Save All Changes'
                              }
                              onPress={saveAllSpeciesDensities}
                              disabled={savingSpeciesDensityId === 'all'}
                              style={styles.densityEditorSaveAllButton}
                            />
                          </>
                        ) : null}
                      </Card>
                    ) : (
                      <Card style={styles.sheetPanel}>
                        <Text style={styles.sheetSectionTitle}>
                          Species Capacity Source
                        </Text>
                        <Text style={styles.sheetSectionHint}>
                          Each species uses its own fish-per-acre value stored in
                          the system. Admin users can edit these values directly
                          on this overview screen.
                        </Text>
                      </Card>
                    )}

                    <Card style={styles.sheetPanel}>
                      <Text style={styles.sheetSectionTitle}>
                        Species Stocking Capacity
                      </Text>
                      <Text style={styles.sheetSectionHint}>
                        Each species has its own per-acre capacity. Values differ
                        by species at the same fish size.
                      </Text>
                      {insightLoading && !overviewData ? (
                        <ActivityIndicator color="#2563EB" />
                      ) : (
                        (overviewData?.capacities || []).map(item => (
                          <View
                            key={item.label}
                            style={[
                              styles.capacityLimitCard,
                              {
                                backgroundColor: item.bg || '#F8FAFC',
                                borderColor: item.border || '#E5E7EB',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                padding: 14,
                                minHeight: 'auto',
                              },
                            ]}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text
                                  style={[
                                    styles.capacityLimitTitle,
                                    {
                                      color: item.color || '#111827',
                                      fontSize: 15,
                                      fontWeight: '800',
                                    },
                                  ]}
                                >
                                  {item.label}
                                </Text>
                                <Text
                                  style={[
                                    styles.capacityLimitSubtitle,
                                    {
                                      color: '#6B7280',
                                      fontSize: 11,
                                      marginTop: 2,
                                    },
                                  ]}
                                >
                                  {item.subtitle}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                marginTop: 10,
                                paddingTop: 8,
                                borderTopWidth: 1,
                                borderTopColor: item.border || '#E5E7EB',
                                gap: 6,
                              }}
                            >
                              {(item.species?.length
                                ? item.species
                                : [
                                    item.primaryQty > 0
                                      ? {
                                          name: item.primaryName,
                                          quantity: item.primaryQty,
                                          perAcre: Math.floor(
                                            Number(item.primaryQty || 0) /
                                              Math.max(
                                                Number(
                                                  overviewParams.pondSize || 1,
                                                ),
                                                1,
                                              ),
                                          ),
                                          isPrimary: true,
                                        }
                                      : null,
                                    item.partnerQty > 0
                                      ? {
                                          name: item.partnerName,
                                          quantity: item.partnerQty,
                                          perAcre: Math.floor(
                                            Number(item.partnerQty || 0) /
                                              Math.max(
                                                Number(
                                                  overviewParams.pondSize || 1,
                                                ),
                                                1,
                                              ),
                                          ),
                                          isPrimary: false,
                                        }
                                      : null,
                                  ].filter(Boolean)
                              ).map(speciesItem => (
                                <View
                                  key={`${item.label}-${speciesItem.speciesId || speciesItem.name}`}
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <View
                                    style={{
                                      flex: 1,
                                      paddingRight: 8,
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <View
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: speciesItem.isPrimary
                                          ? item.color || '#2563EB'
                                          : '#9CA3AF',
                                      }}
                                    />
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: speciesItem.isPrimary
                                          ? '800'
                                          : '600',
                                        color: '#374151',
                                      }}
                                    >
                                      {speciesItem.name}
                                      {speciesItem.isPrimary ? (
                                        <Text
                                          style={{
                                            fontSize: 9,
                                            fontWeight: '800',
                                            color: '#2563EB',
                                          }}
                                        >
                                          {' '}
                                          (PRIMARY)
                                        </Text>
                                      ) : null}
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: 'flex-end' }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: '800',
                                        color: '#111827',
                                      }}
                                    >
                                      {Number(
                                        speciesItem.quantity || 0,
                                      ).toLocaleString()}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: '700',
                                        color: '#6B7280',
                                        marginTop: 1,
                                      }}
                                    >
                                      {Number(
                                        speciesItem.perAcre || 0,
                                      ).toLocaleString()}
                                      /acre
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))
                      )}

                      <View style={styles.infoBox}>
                        <Text
                          style={[
                            styles.infoBoxText,
                            { fontWeight: '900', marginBottom: 4 },
                          ]}
                        >
                          Species-specific stocking
                        </Text>
                        <Text style={styles.infoBoxText}>
                          Rohu, Tilapia, Grass Carp, and other species each have
                          their own stocking density per acre. At the same fish
                          size, quantities differ because each species has a
                          different capacity value stored in the system.
                        </Text>
                      </View>
                    </Card>
                  </View>

                  <Card style={styles.compatibilityPanel}>
                    <Text style={styles.sheetSectionTitle}>
                      Compatible Species for {overviewParams.cultureType}
                    </Text>
                    <View style={styles.compatibilityGrid}>
                      {(overviewData?.compatibility || []).map(
                        (item, index) => (
                          <View
                            key={`${item.species}-${index}`}
                            style={styles.compatibilityCard}
                          >
                            <Text style={styles.compatibilitySpecies}>
                              {item.species}
                            </Text>
                            {item.perAcre ? (
                              <Text style={styles.compatibilityDensity}>
                                {Number(item.perAcre).toLocaleString()} fish/acre
                              </Text>
                            ) : null}
                            <Text style={styles.compatibilityNote}>
                              {item.note}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  </Card>
                </ScrollView>

                <PrimaryButton
                  title="Close Overview"
                  onPress={() => setOverviewModal(false)}
                  style={styles.sheetCloseButton}
                />
              </View>
            </View>
          </Modal>

          <Modal visible={summaryModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.sheetModalContent]}>
                <View style={styles.modalHeader}>
                  <View style={styles.sheetTitleRow}>
                    <View style={[styles.sheetIcon, styles.summarySheetIcon]}>
                      <ClipboardList size={20} color="#7C3AED" />
                    </View>
                    <View style={styles.sheetTitleWrap}>
                      <Text style={styles.modalTitle}>Farm Summary Sheet</Text>
                      <Text style={styles.modalSubtitleCompact}>
                        Comprehensive overview of all ponds and fish stock
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSummaryModal(false)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.sheetScroll}>
                  {insightLoading && !summaryData ? (
                    <ActivityIndicator color="#2563EB" />
                  ) : (
                    <>
                      <View style={styles.summaryStatsGrid}>
                        <SummaryMetric
                          icon={Droplets}
                          label="Total Ponds"
                          value={Number(
                            summaryData?.totals?.totalPonds || 0,
                          ).toLocaleString()}
                          color="#2563EB"
                        />
                        <SummaryMetric
                          icon={Ruler}
                          label="Total Area"
                          value={`${Number(
                            summaryData?.totals?.totalArea || 0,
                          ).toFixed(2)} acres`}
                          color="#059669"
                        />
                        <SummaryMetric
                          icon={Droplets}
                          label="Total Volume"
                          value={`${Math.round(
                            summaryData?.totals?.totalVolumeGallons || 0,
                          ).toLocaleString()} Gal`}
                          color="#0891B2"
                        />
                        <SummaryMetric
                          icon={Fish}
                          label="Total Fish"
                          value={Number(
                            summaryData?.totals?.totalFish || 0,
                          ).toLocaleString()}
                          color="#DB2777"
                        />
                      </View>

                      <Text style={styles.sheetSectionTitle}>
                        Fish Stock by Pond and Age
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <View style={styles.summaryTable}>
                          <View
                            style={[
                              styles.summaryTableRow,
                              styles.summaryTableHead,
                            ]}
                          >
                            <Text style={[styles.summaryCell, styles.pondCell]}>
                              Pond Details
                            </Text>
                            <Text style={styles.summaryCell}>Fish Species</Text>
                            <Text style={styles.summaryCell}>
                              Stock Quantity
                            </Text>
                            <Text style={styles.summaryCell}>
                              Size (Current - Target)
                            </Text>
                            <Text style={styles.summaryCell}>Age</Text>
                          </View>
                          {(summaryData?.rows || []).length === 0 ? (
                            <View style={styles.summaryTableRow}>
                              <Text
                                style={[
                                  styles.summaryCell,
                                  styles.summaryEmptyCell,
                                ]}
                              >
                                No fish stocked yet.
                              </Text>
                            </View>
                          ) : null}
                          {(summaryData?.rows || []).map((row, index) => (
                            <View
                              key={`${row.pondId}-${
                                row.batchId || row.species
                              }-${index}`}
                              style={styles.summaryTableRow}
                            >
                              <View
                                style={[styles.summaryCell, styles.pondCell]}
                              >
                                <Text style={styles.summaryPondName}>
                                  {row.pondName}
                                </Text>
                                <Text style={styles.summaryPondMeta}>
                                  Pond #{row.pondId || '-'}
                                </Text>
                                <Tag color="#EFF6FF" textColor="#2563EB">
                                  {row.stage || 'Pond'}
                                </Tag>
                                <Text style={styles.summaryPondMeta}>
                                  {Number(row.sizeAcres || 0).toFixed(2)} acres
                                </Text>
                                <Text style={styles.summaryPondMeta}>
                                  {row.dimensions}
                                </Text>
                                <Text style={styles.summaryPondMeta}>
                                  Vol:{' '}
                                  {Math.round(
                                    row.volumeGallons || 0,
                                  ).toLocaleString()}{' '}
                                  Gal
                                </Text>
                              </View>
                              <Text style={styles.summaryCell}>
                                {row.species}
                              </Text>
                              <Text style={styles.summaryCell}>
                                {Number(row.quantity || 0).toLocaleString()}{' '}
                                fish
                              </Text>
                              <Text style={styles.summaryCell}>
                                {Number(row.currentSize || 0).toFixed(1)}" -{' '}
                                {Number(row.targetSize || 0).toFixed(1)}"
                              </Text>
                              <Text style={styles.summaryCell}>
                                {Number(
                                  row.ageDays || row.timeInPondDays || 0,
                                )}{' '}
                                days
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                      <Text style={styles.summaryNote}>
                        Note: Size is shown in inches (current - target). Same
                        species can appear more than once when batches have
                        different ages.
                      </Text>

                      <Text style={styles.sheetSectionTitle}>
                        Pond Capacity for All Species
                      </Text>
                      <Text style={styles.sheetSectionHint}>
                        These limits show what each pond can hold if it is used
                        for that species at a different time.
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator>
                        <View style={styles.summaryTable}>
                          <View
                            style={[
                              styles.summaryTableRow,
                              styles.summaryTableHead,
                            ]}
                          >
                            <Text style={[styles.summaryCell, styles.pondCell]}>
                              Pond
                            </Text>
                            <Text style={styles.summaryCell}>Species</Text>
                            <Text style={styles.summaryCell}>Fish / Acre</Text>
                            <Text style={styles.summaryCell}>Pond Capacity</Text>
                          </View>
                          {(summaryData?.capacityRows || []).length === 0 ? (
                            <View style={styles.summaryTableRow}>
                              <Text
                                style={[
                                  styles.summaryCell,
                                  styles.summaryEmptyCell,
                                ]}
                              >
                                No species capacity data available.
                              </Text>
                            </View>
                          ) : null}
                          {(summaryData?.capacityRows || []).map(
                            (row, index) => (
                              <View
                                key={`${row.pondId}-${row.speciesId}-${index}`}
                                style={styles.summaryTableRow}
                              >
                                <View
                                  style={[styles.summaryCell, styles.pondCell]}
                                >
                                  <Text style={styles.summaryPondName}>
                                    {row.pondName}
                                  </Text>
                                  <Text style={styles.summaryPondMeta}>
                                    Pond #{row.pondId || '-'} |{' '}
                                    {Number(row.sizeAcres || 0).toFixed(2)} acres
                                  </Text>
                                  <Tag color="#EFF6FF" textColor="#2563EB">
                                    {row.stage || 'Pond'}
                                  </Tag>
                                </View>
                                <Text style={styles.summaryCell}>
                                  {row.species}
                                </Text>
                                <Text style={styles.summaryCell}>
                                  {Number(row.fishPerAcre || 0).toLocaleString()}
                                </Text>
                                <Text style={styles.summaryCell}>
                                  {Number(row.capacity || 0).toLocaleString()}{' '}
                                  fish
                                </Text>
                              </View>
                            ),
                          )}
                        </View>
                      </ScrollView>
                    </>
                  )}
                </ScrollView>

                <PrimaryButton
                  title="Close Summary"
                  onPress={() => setSummaryModal(false)}
                  style={styles.sheetCloseButton}
                />
              </View>
            </View>
          </Modal>

          {/* Farmer Purchase Requests modal */}
          <Modal visible={requestsModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.alertsModalContent]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Purchase Requests</Text>
                  <TouchableOpacity onPress={() => setRequestsModal(false)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.alertsModalScroll}>
                  {farmerRequests.length === 0 ? (
                    <Text style={styles.muted}>No purchase requests yet.</Text>
                  ) : (
                    farmerRequests.map(request => {
                      const requestId = request.RequestId || request.id;
                      const busy = processingRequestId === requestId;
                      const status = getPurchaseRequestStatus(request);
                      const isOpen = isPurchaseRequestOpen(request);
                      return (
                        <Card key={requestId} style={styles.requestCard}>
                          <Text style={styles.activityMessage}>
                            {request.SpeciesName ||
                              request.speciesName ||
                              'Fish'}{' '}
                            |{' '}
                            {Number(
                              request.RequestedQuantity ||
                                request.Quantity ||
                                0,
                            ).toLocaleString()}{' '}
                            fish
                          </Text>
                          <Text style={styles.activityMeta}>
                            Buyer:{' '}
                            {request.ConsumerName ||
                              request.BuyerName ||
                              request.ConsumerEmail ||
                              'Consumer'}{' '}
                            | Status: {status}
                          </Text>
                          {request.FarmerReply ? (
                            <Text style={styles.requestMessage}>
                              Reply: {request.FarmerReply}
                            </Text>
                          ) : null}
                          {isOpen ? (
                            <View style={styles.actions}>
                              <Action
                                icon={TrendingUp}
                                label={busy ? 'Working' : 'Approve'}
                                onPress={() =>
                                  handleRequestAction(requestId, 'approve')
                                }
                              />
                              <Action
                                icon={X}
                                label="Deny"
                                onPress={() =>
                                  handleRequestAction(requestId, 'deny')
                                }
                                danger
                              />
                            </View>
                          ) : (
                            <Text style={styles.activityMeta}>
                              {status === 'Approved'
                                ? 'Sale completed. Stock and revenue were updated.'
                                : 'This request is closed.'}
                            </Text>
                          )}
                          <View style={styles.actions}>
                            <Action
                              icon={Trash2}
                              label="Delete"
                              onPress={() =>
                                handleRequestAction(requestId, 'delete')
                              }
                              danger
                            />
                          </View>
                        </Card>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Critical / pond alerts modal */}
          <Modal visible={!!alertsModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.alertsModalContent]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {alertsModal?.filter === 'pond'
                      ? 'Pond alerts'
                      : `Critical alerts (${shiftAlerts?.highCount || 0})`}
                  </Text>
                  <TouchableOpacity onPress={() => setAlertsModal(null)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.alertsModalScroll}>
                  {getAlertsModalList().length === 0 ? (
                    <Text style={styles.muted}>No alerts to show.</Text>
                  ) : (
                    getAlertsModalList().map((alert, idx) => {
                      const colors =
                        SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low;
                      return (
                        <View
                          key={`${alert.pondId || 'p'}-${
                            alert.speciesId || 's'
                          }-${alert.type || idx}`}
                          style={[
                            styles.pondAlertItem,
                            styles.alertsModalItem,
                            {
                              backgroundColor: colors.bg,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <AlertTriangle size={16} color={colors.icon} />
                          <View style={styles.alertsModalTextWrap}>
                            {alert.pondName ? (
                              <Text style={styles.alertsModalPondName}>
                                {alert.pondName}
                              </Text>
                            ) : null}
                            <Text
                              style={[
                                styles.pondAlertText,
                                { color: colors.text },
                              ]}
                            >
                              {alert.message}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Pond financial/details modal */}
          <Modal visible={!!financialsModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.alertsModalContent]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Pond Details</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setFinancialsModal(null);
                      setFinancialsData(null);
                    }}
                  >
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>
                  {financialsModal?.pondName ||
                    financialsModal?.PondName ||
                    'Selected pond'}
                </Text>

                {financialsLoading ? (
                  <ActivityIndicator size="large" color="#2563EB" />
                ) : !financialsData ? (
                  <Text style={styles.muted}>No details available.</Text>
                ) : (
                  <ScrollView style={styles.alertsModalScroll}>
                    <View style={styles.financialStatsGrid}>
                      <MetricPill
                        label="Revenue"
                        value={`PKR ${Number(
                          financialsData.totalRevenue || 0,
                        ).toLocaleString()}`}
                      />
                      <MetricPill
                        label="Expenses"
                        value={`PKR ${Number(
                          financialsData.totalExpenses || 0,
                        ).toLocaleString()}`}
                      />
                      <MetricPill
                        label={
                          Number(financialsData.netProfit || 0) >= 0
                            ? 'Profit'
                            : 'Loss'
                        }
                        value={`PKR ${Math.abs(
                          Number(financialsData.netProfit || 0),
                        ).toLocaleString()}`}
                      />
                      <MetricPill
                        label="Asset value"
                        value={`PKR ${Number(
                          financialsData.estimatedAssetValue?.min || 0,
                        ).toLocaleString()} - ${Number(
                          financialsData.estimatedAssetValue?.max || 0,
                        ).toLocaleString()}`}
                      />
                    </View>

                    <Text style={styles.detailSectionTitle}>Current Stock</Text>
                    {(financialsData.currentStock || []).length === 0 ? (
                      <Text style={styles.muted}>
                        No active stock in this pond.
                      </Text>
                    ) : (
                      financialsData.currentStock.map(item => (
                        <View
                          key={`${item.speciesName}-${item.quantity}`}
                          style={styles.detailRow}
                        >
                          <Text style={styles.detailRowTitle}>
                            {item.speciesName}
                          </Text>
                          <Text style={styles.detailRowMeta}>
                            {Number(item.quantity || 0).toLocaleString()} fish |
                            PKR {Number(item.estMinValue || 0).toLocaleString()}
                            - {Number(item.estMaxValue || 0).toLocaleString()}
                          </Text>
                        </View>
                      ))
                    )}

                    <Text style={styles.detailSectionTitle}>
                      Expense Breakdown
                    </Text>
                    {(financialsData.expenseBreakdown || []).length === 0 ? (
                      <Text style={styles.muted}>No expenses recorded.</Text>
                    ) : (
                      financialsData.expenseBreakdown.map(item => (
                        <View
                          key={item.category}
                          style={styles.detailRowCompact}
                        >
                          <Text style={styles.detailRowTitle}>
                            {item.category}
                          </Text>
                          <Text style={styles.detailRowAmount}>
                            PKR {Number(item.amount || 0).toLocaleString()}
                          </Text>
                        </View>
                      ))
                    )}

                    <Text style={styles.detailSectionTitle}>
                      Harvest Revenue
                    </Text>
                    {(financialsData.speciesRevenue || []).length === 0 ? (
                      <Text style={styles.muted}>No harvest revenue yet.</Text>
                    ) : (
                      financialsData.speciesRevenue.map(item => (
                        <View
                          key={`${item.speciesId}-${item.speciesName}`}
                          style={styles.detailRow}
                        >
                          <Text style={styles.detailRowTitle}>
                            {item.speciesName}
                          </Text>
                          <Text style={styles.detailRowMeta}>
                            {Number(item.harvested || 0).toLocaleString()} fish
                            |{Number(item.weightKg || 0).toFixed(1)} kg | PKR{' '}
                            {Number(item.revenue || 0).toLocaleString()}
                          </Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          {/* Disease log / edit modal */}
          <Modal visible={!!diseaseModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, styles.diseaseModalContent]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {diseaseModal?.mode === 'edit'
                      ? 'Edit Disease Log'
                      : 'Log Disease'}
                  </Text>
                  <TouchableOpacity onPress={() => setDiseaseModal(null)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  {diseaseModal?.pond?.pondName || 'Selected pond'}
                </Text>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalLabel}>Choose Disease</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={diseaseSearch}
                    onChangeText={text => {
                      setDiseaseSearch(text);
                      if (diseaseForm.diseaseId) {
                        setDiseaseForm({
                          ...diseaseForm,
                          diseaseId: '',
                          customDiseaseName: text,
                        });
                      }
                    }}
                    placeholder="Search diseases or symptoms"
                    placeholderTextColor="#9CA3AF"
                  />
                  <View style={styles.diseaseOptionList}>
                    {filteredDiseaseCatalog.length === 0 ? (
                      <Text style={styles.muted}>
                        No catalog disease matched.
                      </Text>
                    ) : (
                      filteredDiseaseCatalog.map(disease => {
                        const isSelected =
                          String(diseaseForm.diseaseId) ===
                          String(disease.DiseaseId);
                        return (
                          <TouchableOpacity
                            key={disease.DiseaseId}
                            style={[
                              styles.diseaseOption,
                              isSelected && styles.diseaseOptionSelected,
                            ]}
                            onPress={() => selectDiseaseCatalogItem(disease)}
                          >
                            <Text
                              style={[
                                styles.diseaseOptionName,
                                isSelected && styles.diseaseOptionNameSelected,
                              ]}
                            >
                              {getDiseaseName(disease)}
                            </Text>
                            <Text style={styles.diseaseOptionMeta}>
                              {disease.Category || 'Disease'} |{' '}
                              {disease.Severity || 'Moderate'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.customDiseaseButton}
                    onPress={useCustomDisease}
                  >
                    <Text style={styles.customDiseaseText}>
                      Use custom disease name
                    </Text>
                  </TouchableOpacity>

                  {!diseaseForm.diseaseId && (
                    <>
                      <Text style={styles.modalLabel}>Custom Disease Name</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={diseaseForm.customDiseaseName}
                        onChangeText={text =>
                          setDiseaseForm({
                            ...diseaseForm,
                            customDiseaseName: text,
                          })
                        }
                        placeholder="e.g. Unidentified skin lesions"
                        placeholderTextColor="#9CA3AF"
                      />
                    </>
                  )}

                  {selectedDisease && (
                    <View style={styles.diseaseGuidanceBox}>
                      <Text style={styles.diseaseGuidanceTitle}>
                        {getDiseaseName(selectedDisease)}
                      </Text>
                      {getDiseaseSymptoms(selectedDisease) ? (
                        <Text style={styles.diseaseGuidanceText}>
                          Symptoms: {getDiseaseSymptoms(selectedDisease)}
                        </Text>
                      ) : null}
                      {getDiseaseAffectedSpecies(selectedDisease) ? (
                        <Text style={styles.diseaseGuidanceText}>
                          Affects: {getDiseaseAffectedSpecies(selectedDisease)}
                        </Text>
                      ) : null}
                      {getDiseaseTreatment(selectedDisease) ? (
                        <View style={styles.treatmentHintBox}>
                          <Text style={styles.treatmentHintTitle}>
                            Recommended Treatment
                          </Text>
                          <Text style={styles.treatmentHintText}>
                            {getDiseaseTreatment(selectedDisease)}
                          </Text>
                        </View>
                      ) : null}
                      {getDiseasePrevention(selectedDisease) ? (
                        <View style={styles.preventionHintBox}>
                          <Text style={styles.preventionHintTitle}>
                            Prevention
                          </Text>
                          <Text style={styles.preventionHintText}>
                            {getDiseasePrevention(selectedDisease)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {(diseaseModal?.pond?.species || []).length > 0 && (
                    <>
                      <Text style={styles.modalLabel}>
                        Affected Species / Batches
                      </Text>
                      <Text style={styles.modalHelper}>
                        Select every affected batch and enter the affected count
                        for each one.
                      </Text>
                      <View style={styles.diseaseOptionList}>
                        <TouchableOpacity
                          style={[
                            styles.fishBatchOption,
                            diseaseForm.affectedBatches?.['whole-pond'] &&
                              styles.diseaseOptionSelected,
                          ]}
                          onPress={() => selectDiseaseFish(null)}
                        >
                          <Text style={styles.diseaseOptionName}>
                            Whole pond
                          </Text>
                        </TouchableOpacity>
                        {(diseaseModal?.pond?.species || []).map(fish => {
                          const key = getDiseaseFishKey(fish);
                          const selected = Boolean(
                            diseaseForm.affectedBatches?.[key],
                          );
                          return (
                            <TouchableOpacity
                              key={`${fish.speciesId}-${
                                fish.batchId || fish.species
                              }`}
                              style={[
                                styles.fishBatchOption,
                                selected && styles.diseaseOptionSelected,
                              ]}
                              onPress={() => selectDiseaseFish(fish)}
                            >
                              <Text style={styles.diseaseOptionName}>
                                {fish.species}
                              </Text>
                              <Text style={styles.diseaseOptionMeta}>
                                {Number(fish.quantity || 0).toLocaleString()}{' '}
                                fish
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {Object.entries(diseaseForm.affectedBatches || {}).map(
                        ([key, affected]) => (
                          <View key={key} style={styles.affectedCountRow}>
                            <View style={styles.affectedCountCopy}>
                              <Text style={styles.affectedCountTitle}>
                                {affected.speciesName}
                              </Text>
                              {affected.available ? (
                                <Text style={styles.affectedCountMeta}>
                                  Available:{' '}
                                  {Number(affected.available).toLocaleString()}
                                </Text>
                              ) : null}
                            </View>
                            <TextInput
                              style={styles.affectedCountInput}
                              value={affected.affectedCount}
                              onChangeText={text =>
                                updateDiseaseFishCount(key, text)
                              }
                              keyboardType="number-pad"
                              placeholder="Affected"
                              placeholderTextColor="#9CA3AF"
                            />
                            <TouchableOpacity
                              style={styles.affectedRemoveButton}
                              onPress={() => removeDiseaseFish(key)}
                            >
                              <Text style={styles.affectedRemoveText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ),
                      )}
                    </>
                  )}

                  <Text style={styles.modalLabel}>Severity</Text>
                  <View style={styles.choiceGrid}>
                    {DISEASE_SEVERITY_OPTIONS.map(option => {
                      const selected = diseaseForm.severity === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.choiceButton,
                            selected && styles.choiceButtonSelected,
                          ]}
                          onPress={() =>
                            setDiseaseForm({ ...diseaseForm, severity: option })
                          }
                        >
                          <Text
                            style={[
                              styles.choiceButtonText,
                              selected && styles.choiceButtonTextSelected,
                            ]}
                          >
                            {option}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.modalLabel}>Status</Text>
                  <View style={styles.choiceGrid}>
                    {DISEASE_STATUS_OPTIONS.map(option => {
                      const selected = diseaseForm.status === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.choiceButton,
                            selected && styles.choiceButtonSelected,
                          ]}
                          onPress={() =>
                            setDiseaseForm({ ...diseaseForm, status: option })
                          }
                        >
                          <Text
                            style={[
                              styles.choiceButtonText,
                              selected && styles.choiceButtonTextSelected,
                            ]}
                          >
                            {option}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.modalLabel}>Symptoms Observed</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextArea]}
                    value={diseaseForm.symptomsObserved}
                    onChangeText={text =>
                      setDiseaseForm({
                        ...diseaseForm,
                        symptomsObserved: text,
                      })
                    }
                    multiline
                    placeholder="Describe visible symptoms"
                    placeholderTextColor="#9CA3AF"
                  />

                  <Text style={styles.modalLabel}>Notes</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalTextArea]}
                    value={diseaseForm.notes}
                    onChangeText={text =>
                      setDiseaseForm({ ...diseaseForm, notes: text })
                    }
                    multiline
                    placeholder="Treatment, water condition, next action"
                    placeholderTextColor="#9CA3AF"
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.modalCancelBtn}
                      onPress={() => setDiseaseModal(null)}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalSaveBtn,
                        savingDisease && styles.modalSaveBtnDisabled,
                      ]}
                      onPress={handleSaveDisease}
                      disabled={savingDisease}
                    >
                      <Text style={styles.modalSaveText}>
                        {savingDisease ? 'Saving...' : 'Save Disease Log'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Size Edit Modal */}
          <Modal visible={!!sizeEditModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Update Fish Size/Age</Text>
                  <TouchableOpacity onPress={() => setSizeEditModal(null)}>
                    <X size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  {sizeEditModal?.speciesName || 'Species'}
                </Text>

                <Text style={styles.modalLabel}>Current Size/Age </Text>
                <TextInput
                  style={styles.modalInput}
                  value={editSizeValue}
                  onChangeText={setEditSizeValue}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 4.5"
                  placeholderTextColor="#9CA3AF"
                />
                {editSizeValue && !isNaN(parseFloat(editSizeValue)) && (
                  <Text style={styles.modalHint}>
                    Estimated weight:{' '}
                    {inchesToKg(parseFloat(editSizeValue)).toFixed(3)} kg
                  </Text>
                )}

                <Text style={styles.modalLabel}>Target Size /Age</Text>
                <Text style={styles.modalHelper}>
                  Defaults: Nursery 6", Grown-out 20". Targets control dashboard
                  alerts; harvest can still be recorded at any size.
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={editTargetValue}
                  onChangeText={setEditTargetValue}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 12"
                  placeholderTextColor="#9CA3AF"
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setSizeEditModal(null)}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalSaveBtn,
                      updatingSize && styles.modalSaveBtnDisabled,
                    ]}
                    onPress={handleUpdateSize}
                    disabled={updatingSize}
                  >
                    <Text style={styles.modalSaveText}>
                      {updatingSize ? 'Saving...' : 'Update Size/Age'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </AppScaffold>
  );
}

function Action({ icon: Icon, label, onPress, danger, mortality }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        danger && styles.dangerButton,
        mortality && styles.mortalityButton,
      ]}
      onPress={onPress}
    >
      <Icon size={15} color={danger || mortality ? '#B45309' : '#2563EB'} />
      <Text
        style={[
          styles.actionText,
          danger && styles.dangerText,
          mortality && styles.mortalityText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MetricPill({ label, value }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text style={styles.metricPillValue}>{value}</Text>
    </View>
  );
}

function PickerField({ label, selectedValue, options, onValueChange }) {
  return (
    <View style={styles.pickerField}>
      <Text style={styles.modalLabel}>{label}</Text>
      <View style={styles.pickerBox}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          dropdownIconColor="#111827"
          style={styles.picker}
        >
          {options.map(option => (
            <Picker.Item key={option} label={option} value={option} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function SummaryMetric({ icon: Icon, label, value, color }) {
  return (
    <Card style={styles.summaryMetricCard}>
      <View
        style={[styles.summaryMetricIcon, { backgroundColor: `${color}12` }]}
      >
        <Icon size={18} color={color} />
      </View>
      <View style={styles.summaryMetricCopy}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.summaryMetricValue}>{value}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  setupCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  setupTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 12,
  },
  setupText: {
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  quickPrimaryButton: {
    flexGrow: 1,
  },
  quickSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  quickSecondaryText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
  },
  quickDangerButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  quickDangerText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '900',
  },
  quickSuccessButton: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  quickSuccessText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '900',
  },
  farmSummaryCard: {
    backgroundColor: '#F8FAFC',
  },
  farmSummaryTitle: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 15,
  },
  farmSummaryText: {
    color: '#6B7280',
    marginTop: 5,
    fontSize: 12,
    fontWeight: '700',
  },
  farmCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  farmCardAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    marginBottom: 10,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    marginTop: 12,
  },
  warningText: {
    flex: 1,
    color: '#92400E',
    fontWeight: '700',
  },
  waterAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    marginTop: 12,
  },
  waterAlertText: {
    flex: 1,
    color: '#1E40AF',
    fontWeight: '800',
    fontSize: 13,
  },
  diseaseAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    marginTop: 12,
  },
  diseaseAlertText: {
    flex: 1,
    color: '#BE123C',
    fontWeight: '800',
    fontSize: 13,
  },
  globalAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  globalAlertText: {
    flex: 1,
    color: '#991B1B',
    fontWeight: '800',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 10,
  },
  sectionAction: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionActionText: {
    color: '#2563EB',
    fontWeight: '900',
    fontSize: 12,
  },
  alertCard: {
    borderColor: '#FECACA',
    borderWidth: 2,
  },
  pondHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  pondHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  cardIconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionDanger: {
    backgroundColor: '#FEF2F2',
  },
  pondTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  pondTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pondTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
  },
  pondMeta: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  capacityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 2,
  },
  capacityCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 5,
    borderColor: '#10B981',
  },
  capacityCircleWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  capacityCircleOver: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  capacityCircleValue: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '900',
  },
  capacityCircleValueOver: {
    color: '#B91C1C',
  },
  capacityTopTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  capacityTopLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  capacityTopValue: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  capacityTopHint: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  pondBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  diseaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFE4E6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  diseaseBadgeText: {
    color: '#BE123C',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  feedDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  feedDueBadgeText: {
    color: '#7C3AED',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  muted: {
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 8,
  },
  pondAlertsWrap: {
    marginBottom: 10,
    gap: 6,
  },
  pondAlertItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  pondAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  moreAlertsText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  fishListWrap: {
    marginBottom: 8,
  },
  fishRowEnhanced: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fishRowReady: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    marginVertical: 3,
  },
  fishRowTargetReached: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  fishRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  fishInfoWrap: {
    flex: 1,
  },
  fishText: {
    color: '#374151',
    fontWeight: '700',
  },
  fishReadyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 5,
  },
  fishReadyBadgeText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '900',
  },
  fishSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  fishSizeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '800',
  },
  fishSizeTextMuted: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
  },
  targetSizeText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
  },
  targetSizeReadyText: {
    color: '#047857',
  },
  capacityText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
  overCapacityText: {
    color: '#DC2626',
    fontWeight: '800',
  },
  editSizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  fishInlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingLeft: 24,
  },
  fishMiniAction: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fishMiniActionHarvest: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  fishMiniActionText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
  },
  capacitySummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 8,
  },
  feedScheduleBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 10,
    marginBottom: 8,
  },
  SummaryTitle: {
    color: '#21b653',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  feedScheduleTitle: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  feedScheduleText: {
    color: '#4C1D95',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  activeDiseaseBox: {
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    marginBottom: 8,
  },
  activeDiseaseTitle: {
    color: '#9F1239',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  activeDiseaseItem: {
    borderTopWidth: 1,
    borderTopColor: '#FFE4E6',
    paddingTop: 6,
    marginTop: 6,
  },
  activeDiseaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  activeDiseaseName: {
    flex: 1,
    color: '#881337',
    fontSize: 12,
    fontWeight: '900',
  },
  activeDiseaseEdit: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '900',
  },
  activeDiseaseText: {
    color: '#9F1239',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  capacitySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capacitySummaryText: {
    flex: 1,
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  capacityDetail: {
    marginTop: 10,
    gap: 8,
  },
  capacityRow: {
    gap: 4,
  },
  capacitySpecies: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  capacityBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  capacityBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  capacityBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  capacityBarLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'right',
  },
  capacitySizeNote: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  metricsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  metricPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricPillLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
  metricPillValue: {
    color: '#111827',
    marginTop: 2,
    fontWeight: '900',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dangerButton: {
    backgroundColor: '#FEF2F2',
  },
  actionText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  dangerText: {
    color: '#DC2626',
  },
  mortalityButton: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  mortalityText: {
    color: '#B45309',
  },
  activityCard: {
    marginBottom: 8,
  },
  activityMessage: {
    color: '#111827',
    fontWeight: '800',
  },
  activityMeta: {
    color: '#6B7280',
    marginTop: 4,
    fontSize: 12,
  },
  requestCard: {
    marginBottom: 10,
  },
  requestMessage: {
    color: '#374151',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    fontWeight: '600',
  },
  alertsModalContent: {
    maxHeight: '80%',
  },
  alertsModalScroll: {
    maxHeight: 420,
  },
  alertsModalItem: {
    marginBottom: 10,
  },
  alertsModalTextWrap: {
    flex: 1,
    marginLeft: 8,
  },
  alertsModalPondName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 2,
  },
  financialStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  detailSectionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
    marginBottom: 8,
  },
  detailRow: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  detailRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  detailRowTitle: {
    color: '#111827',
    fontWeight: '900',
  },
  detailRowMeta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  detailRowAmount: {
    color: '#111827',
    fontWeight: '900',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sheetModalContent: {
    maxHeight: '94%',
  },
  sheetTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySheetIcon: {
    backgroundColor: '#F5F3FF',
  },
  sheetTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalSubtitleCompact: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  sheetScroll: {
    maxHeight: 560,
  },
  sheetGrid: {
    gap: 12,
  },
  sheetPanel: {
    marginBottom: 0,
  },
  sheetSectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  sheetSectionHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  densityEditorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  densityEditorToggleText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
  },
  densityEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  densityEditorNameWrap: {
    flex: 1,
    minWidth: 90,
  },
  densityEditorName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  densityEditorMeta: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  densityEditorInput: {
    width: 88,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  densityEditorSaveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  densityEditorSaveButtonDisabled: {
    opacity: 0.6,
  },
  densityEditorSaveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  densityEditorSaveAllButton: {
    marginTop: 4,
    backgroundColor: '#0F172A',
  },
  pickerField: {
    marginTop: 2,
  },
  pickerBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
  },
  picker: {
    color: '#111827',
    minHeight: 48,
  },
  capacityLimitCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  capacityLimitTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  capacityLimitSubtitle: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  capacityLimitValue: {
    minWidth: 92,
    textAlign: 'right',
    fontSize: 23,
    fontWeight: '900',
  },
  capacityLimitUnit: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 12,
  },
  infoBoxText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  compatibilityPanel: {
    marginTop: 12,
  },
  compatibilityGrid: {
    gap: 10,
  },
  compatibilityCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 12,
  },
  compatibilitySpecies: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 5,
  },
  compatibilityDensity: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  compatibilityNote: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  sheetCloseButton: {
    marginTop: 14,
    backgroundColor: '#0F172A',
  },
  summaryStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryMetricCard: {
    minWidth: '47%',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 0,
  },
  summaryMetricIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMetricCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryMetricValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  summaryTable: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  summaryTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  summaryTableHead: {
    backgroundColor: '#F8FAFC',
  },
  summaryCell: {
    width: 126,
    padding: 10,
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  summaryEmptyCell: {
    width: 640,
    color: '#6B7280',
  },
  pondCell: {
    width: 178,
  },
  summaryPondName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },
  summaryPondMeta: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  summaryNote: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
  },
  diseaseModalContent: {
    maxHeight: '92%',
  },
  diseaseOptionList: {
    gap: 8,
    marginTop: 8,
  },
  diseaseOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    padding: 10,
  },
  diseaseOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  diseaseOptionName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  diseaseOptionNameSelected: {
    color: '#1D4ED8',
  },
  diseaseOptionMeta: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  customDiseaseButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  customDiseaseText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '900',
  },
  diseaseGuidanceBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  diseaseGuidanceTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },
  diseaseGuidanceText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  treatmentHintBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  treatmentHintTitle: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  treatmentHintText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  preventionHintBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  preventionHintTitle: {
    color: '#1E3A8A',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  preventionHintText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  fishBatchOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  affectedCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  affectedCountCopy: {
    flex: 1,
    minWidth: 0,
  },
  affectedCountTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  affectedCountMeta: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  affectedCountInput: {
    width: 92,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    paddingHorizontal: 8,
    minHeight: 42,
    fontWeight: '800',
  },
  affectedRemoveButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  affectedRemoveText: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  choiceButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  choiceButtonSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  choiceButtonText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '900',
  },
  choiceButtonTextSelected: {
    color: '#1D4ED8',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    fontWeight: '700',
  },
  modalLabel: {
    color: '#374151',
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    fontSize: 16,
  },
  modalTextArea: {
    minHeight: 82,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  modalHint: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  modalHelper: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6B7280',
    fontWeight: '800',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
