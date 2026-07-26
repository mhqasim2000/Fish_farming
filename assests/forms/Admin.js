import React, { useEffect, useMemo, useState } from 'react';
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
import {
  BellRing,
  BookOpen,
  CheckCircle2,
  Database,
  Fish,
  HeartPulse,
  LayoutList,
  LogOut,
  Map,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react-native';
import {
  clearSession,
  farmApi,
  isUnauthorizedError,
} from '../integration/farmApi';

const ADMIN_TABS = [
  { key: 'approvals', label: 'Approvals', icon: Fish },
  { key: 'species', label: 'All Species', icon: LayoutList },
  { key: 'farms', label: 'Farms', icon: Map },
  { key: 'marketplace', label: 'Marketplace', icon: ShoppingCart },
  { key: 'diseases', label: 'Diseases', icon: HeartPulse },
  { key: 'tickets', label: 'Tickets', icon: MessageSquare },
  { key: 'announcements', label: 'Announcements', icon: BellRing },
  { key: 'rules', label: 'Rules', icon: Settings2 },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { key: 'users', label: 'Users', icon: Users },
];

const RULE_TABS = [
  { key: 'feed', label: 'Feed' },
  { key: 'fertilizer', label: 'Fertilizer' },
  { key: 'stocking', label: 'Stocking' },
  { key: 'compatibility', label: 'Compatibility' },
];

const POND_STAGES = ['Nursery', 'Grown-out'];
const CULTIVATION_TYPES = ['Extensive', 'Semi-Intensive', 'Intensive'];
const CULTURE_TYPES = ['Polyculture', 'Monoculture'];
const emptyStockingMixEntry = { speciesId: '', quantity: '' };

const emptyDiseaseForm = {
  name: '',
  category: 'Bacterial',
  symptoms: '',
  species: '',
  treatment: '',
  prevention: '',
  severity: 'Moderate',
};

const emptyAnnouncementForm = {
  title: '',
  message: '',
  type: 'Info',
};

const emptyGuideForm = {
  title: '',
  category: 'complete-guides',
};

const emptySectionForm = {
  title: '',
  contentText: '',
};

const emptyFeedRuleForm = {
  speciesId: '',
  stage: 'Fingerling',
  minSize: '0',
  maxSize: '99',
  dailyRate: '0',
  conditionFactor: '0.01',
  feedType: '',
  frequency: '',
};

const emptyFertilizerRuleForm = {
  cultivationType: 'Intensive',
  pondType: 'Earthen Pond',
  orgProduct: '',
  orgDosage: '0',
  orgRate: '0',
  orgFrequency: '',
  orgBenefits: '',
  inorgProduct: '',
  inorgDosage: '0',
  inorgRate: '0',
  inorgFrequency: '',
  inorgBenefits: '',
  limeProduct: '',
  limeDosage: '0',
  limeRate: '0',
  limeFrequency: '',
  limeBenefits: '',
};

const emptyStockingRuleForm = {
  Stage: 'Nursery',
  CultivationType: 'Extensive',
  CultureType: 'Polyculture',
  MinFishPerAcre: '0',
  MaxFishPerAcre: '0',
  MaxSpeciesAllowed: '3',
  MinFishSizeInches: '2',
  MaxFishSizeInches: '6',
  MinPondSizeAcres: '0.5',
  MaxPondSizeAcres: '5',
};

const emptyCompatibilityForm = {
  speciesId: '',
  compatibleWithId: '',
  reason: '',
};

const getId = item =>
  item?.UserId ||
  item?.SpeciesId ||
  item?.FarmId ||
  item?.StockId ||
  item?.RequestId ||
  item?.DiseaseId ||
  item?.TicketId ||
  item?.GuideId ||
  item?.SectionId ||
  item?.RuleId ||
  item?.CompatibilityId ||
  item?.Id;

const asText = value => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const numberPayload = form =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => {
      const numericKeys = [
        'minSize',
        'maxSize',
        'dailyRate',
        'conditionFactor',
        'orgDosage',
        'orgRate',
        'inorgDosage',
        'inorgRate',
        'limeDosage',
        'limeRate',
        'MinFishPerAcre',
        'MaxFishPerAcre',
        'MaxSpeciesAllowed',
        'MinFishSizeInches',
        'MaxFishSizeInches',
        'MinPondSizeAcres',
        'MaxPondSizeAcres',
      ];

      return [key, numericKeys.includes(key) ? Number(value || 0) : value];
    }),
  );

const getPositiveNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export default function AdminDashboard({ navigation }) {
  const [activeTab, setActiveTab] = useState('approvals');
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [actionKey, setActionKey] = useState(null);

  const [pendingSpecies, setPendingSpecies] = useState([]);
  const [approvedSpecies, setApprovedSpecies] = useState([]);
  const [guides, setGuides] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [farms, setFarms] = useState([]);
  const [farmStats, setFarmStats] = useState({});
  const [marketplaceListings, setMarketplaceListings] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [diseases, setDiseases] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [feedRules, setFeedRules] = useState([]);
  const [fertilizerRules, setFertilizerRules] = useState([]);
  const [stockingRules, setStockingRules] = useState([]);
  const [compatibilities, setCompatibilities] = useState([]);

  const [guideForm, setGuideForm] = useState(emptyGuideForm);
  const [activeGuideForm, setActiveGuideForm] = useState(null);
  const [sectionForm, setSectionForm] = useState(emptySectionForm);
  const [diseaseForm, setDiseaseForm] = useState(emptyDiseaseForm);
  const [editingDisease, setEditingDisease] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState(
    emptyAnnouncementForm,
  );
  const [replyingTicket, setReplyingTicket] = useState(null);
  const [ticketReply, setTicketReply] = useState('');
  const [ruleTab, setRuleTab] = useState('feed');
  const [feedRuleForm, setFeedRuleForm] = useState(emptyFeedRuleForm);
  const [editingFeedRule, setEditingFeedRule] = useState(null);
  const [fertilizerRuleForm, setFertilizerRuleForm] = useState(
    emptyFertilizerRuleForm,
  );
  const [editingFertilizerRule, setEditingFertilizerRule] = useState(null);
  const [stockingRuleForm, setStockingRuleForm] = useState(
    emptyStockingRuleForm,
  );
  const [editingStockingRule, setEditingStockingRule] = useState(null);
  const [compatibilityForm, setCompatibilityForm] = useState(
    emptyCompatibilityForm,
  );
  const [stockingSpeciesMix, setStockingSpeciesMix] = useState([
    { ...emptyStockingMixEntry },
  ]);
  const [stockingCompatibilityMap, setStockingCompatibilityMap] = useState({});
  const [checkingStockingCompat, setCheckingStockingCompat] = useState(false);

  const totalApproved = approvedSpecies.length;

  const activeTabMeta = useMemo(
    () => ADMIN_TABS.find(tab => tab.key === activeTab) || ADMIN_TABS[0],
    [activeTab],
  );

  const handleAuthError = error => {
    if (!isUnauthorizedError(error)) {
      return false;
    }

    clearSession();
    Alert.alert('Session expired', 'Please log in again.', [
      {
        text: 'OK',
        onPress: () =>
          navigation?.reset({ index: 0, routes: [{ name: 'Login' }] }),
      },
    ]);
    return true;
  };

  const fetchPendingSpecies = async () => {
    setLoading(true);
    try {
      const pending = await farmApi.getPendingSpecies();
      setPendingSpecies(pending || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert(
          'Admin',
          error.message || 'Failed to load pending species.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedSpecies = async () => {
    setLoading(true);
    try {
      const approved = await farmApi.getApprovedSpecies();
      setApprovedSpecies(approved || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert(
          'Species',
          error.message || 'Failed to load approved species.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledge = async () => {
    setSectionLoading(true);
    try {
      const knowledge = await farmApi.getKnowledgeGuides();
      setGuides(knowledge || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Knowledge', error.message || 'Failed to load guides.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchUsers = async () => {
    setSectionLoading(true);
    try {
      const res = await farmApi.getAdminUsers();
      setUsersList(res?.users || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Users', error.message || 'Failed to load users.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchFarms = async () => {
    setSectionLoading(true);
    try {
      const res = await farmApi.getAdminFarms();
      setFarms(res?.farms || []);
      setFarmStats(res?.stats || {});
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Farms', error.message || 'Failed to load farms.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchMarketplaceData = async () => {
    setSectionLoading(true);
    try {
      const [listingsRes, requestsRes] = await Promise.all([
        farmApi.getAdminMarketplaceListings(),
        farmApi.getAdminPurchaseRequests(),
      ]);
      setMarketplaceListings(listingsRes?.listings || []);
      setPurchaseRequests(requestsRes?.requests || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert(
          'Marketplace',
          error.message || 'Failed to load marketplace moderation.',
        );
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchDiseases = async () => {
    setSectionLoading(true);
    try {
      const res = await farmApi.getAdminDiseases();
      setDiseases(res?.diseases || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Diseases', error.message || 'Failed to load diseases.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchTickets = async () => {
    setSectionLoading(true);
    try {
      const res = await farmApi.getAdminTickets();
      setTickets(res?.tickets || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Tickets', error.message || 'Failed to load tickets.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    setSectionLoading(true);
    try {
      const res = await farmApi.getAdminAnnouncements();
      setAnnouncements(res?.announcements || []);
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert(
          'Announcements',
          error.message || 'Failed to load announcements.',
        );
      }
    } finally {
      setSectionLoading(false);
    }
  };

  const fetchRules = async () => {
    setSectionLoading(true);
    try {
      const [feedRes, fertilizerRes, stockingRes, compatibilityRes, speciesRes] =
        await Promise.all([
          farmApi.getAdminFeedRules(),
          farmApi.getAdminFertilizerRules(),
          farmApi.getAdminStockingRules(),
          farmApi.getAdminCompatibilities(),
          approvedSpecies.length
            ? Promise.resolve(approvedSpecies)
            : farmApi.getApprovedSpecies().catch(() => []),
        ]);
      setFeedRules(feedRes?.rules || []);
      setFertilizerRules(fertilizerRes?.rules || []);
      setStockingRules(stockingRes?.rules || []);
      setCompatibilities(compatibilityRes?.compatibilities || []);
      if (!approvedSpecies.length && Array.isArray(speciesRes)) {
        setApprovedSpecies(speciesRes);
      }
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert('Rules', error.message || 'Failed to load rules.');
      }
    } finally {
      setSectionLoading(false);
    }
  };

  useEffect(() => {
    if (ruleTab !== 'stocking') {
      return undefined;
    }

    const selectedIds = stockingSpeciesMix
      .map(entry => Number(entry.speciesId))
      .filter(Boolean);

    if (selectedIds.length < 2) {
      setStockingCompatibilityMap({});
      return undefined;
    }

    let cancelled = false;
    setCheckingStockingCompat(true);

    farmApi
      .checkBulkCompatibility(selectedIds)
      .then(result => {
        if (cancelled) return;
        const map = {};
        (result.pairs || []).forEach(pair => {
          const keyA = `${pair.speciesIdA}-${pair.speciesIdB}`;
          const keyB = `${pair.speciesIdB}-${pair.speciesIdA}`;
          map[keyA] = pair;
          map[keyB] = pair;
        });
        setStockingCompatibilityMap(map);
      })
      .catch(() => {
        if (!cancelled) setStockingCompatibilityMap({});
      })
      .finally(() => {
        if (!cancelled) setCheckingStockingCompat(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ruleTab, stockingSpeciesMix]);

  const refreshActiveTab = async tab => {
    if (tab === 'approvals') return fetchPendingSpecies();
    if (tab === 'species') return fetchApprovedSpecies();
    if (tab === 'knowledge') return fetchKnowledge();
    if (tab === 'users') return fetchUsers();
    if (tab === 'farms') return fetchFarms();
    if (tab === 'marketplace') return fetchMarketplaceData();
    if (tab === 'diseases') return fetchDiseases();
    if (tab === 'tickets') return fetchTickets();
    if (tab === 'announcements') return fetchAnnouncements();
    if (tab === 'rules') return fetchRules();
    return fetchPendingSpecies();
  };

  useEffect(() => {
    refreshActiveTab(activeTab);
    // Data fetchers are intentionally invoked only when the selected admin tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const logout = () => {
    clearSession();
    navigation?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const runAction = async (key, action, onSuccess) => {
    setActionKey(key);
    try {
      await action();
      await onSuccess();
    } catch (error) {
      if (!handleAuthError(error)) {
        Alert.alert(
          'Admin action failed',
          error.message || 'Please try again.',
        );
      }
    } finally {
      setActionKey(null);
    }
  };

  const confirmAction = (title, message, onConfirm) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: onConfirm },
    ]);
  };

  const approveSpecies = id =>
    runAction(
      `approve-${id}`,
      () => farmApi.approveSpecies(id),
      fetchPendingSpecies,
    );

  const rejectSpecies = id =>
    confirmAction(
      'Reject Species',
      'Delete this pending species submission?',
      () =>
        runAction(
          `reject-${id}`,
          () => farmApi.rejectSpecies(id),
          fetchPendingSpecies,
        ),
    );

  const deleteSpecies = id =>
    confirmAction('Delete Species', 'Permanently delete this species?', () =>
      runAction(
        `species-${id}`,
        () => farmApi.deleteSpecies(id),
        fetchApprovedSpecies,
      ),
    );

  const createGuide = () => {
    if (!guideForm.title.trim()) {
      Alert.alert('Knowledge', 'Guide title is required.');
      return;
    }

    runAction(
      'create-guide',
      () =>
        farmApi.addKnowledgeGuide({
          tabCategory: guideForm.category,
          title: guideForm.title.trim(),
          displayOrder: 0,
        }),
      async () => {
        setGuideForm(emptyGuideForm);
        await fetchKnowledge();
      },
    );
  };

  const deleteGuide = id =>
    confirmAction(
      'Delete Guide',
      'Delete this guide and all of its sections?',
      () =>
        runAction(
          `guide-${id}`,
          () => farmApi.deleteKnowledgeGuide(id),
          fetchKnowledge,
        ),
    );

  const createSection = guideId => {
    if (!sectionForm.title.trim() || !sectionForm.contentText.trim()) {
      Alert.alert('Knowledge', 'Section title and content are required.');
      return;
    }

    runAction(
      `section-${guideId}`,
      () =>
        farmApi.addKnowledgeSection({
          guideId,
          title: sectionForm.title.trim(),
          contentText: sectionForm.contentText.trim(),
          displayOrder: 0,
        }),
      async () => {
        setActiveGuideForm(null);
        setSectionForm(emptySectionForm);
        await fetchKnowledge();
      },
    );
  };

  const deleteSection = id =>
    confirmAction('Delete Section', 'Delete this guide section?', () =>
      runAction(
        `section-delete-${id}`,
        () => farmApi.deleteKnowledgeSection(id),
        fetchKnowledge,
      ),
    );

  const toggleUser = userId =>
    runAction(
      `user-status-${userId}`,
      () => farmApi.toggleUserStatus(userId),
      fetchUsers,
    );

  const changeRole = (userId, role) =>
    runAction(
      `user-role-${userId}`,
      () => farmApi.changeUserRole(userId, role),
      fetchUsers,
    );

  const deleteUser = userId =>
    confirmAction('Delete User', 'Delete this user and all related data?', () =>
      runAction(
        `user-delete-${userId}`,
        () => farmApi.deleteUser(userId),
        fetchUsers,
      ),
    );

  const removeListing = stockId =>
    confirmAction(
      'Remove Listing',
      'Remove this listing from the marketplace?',
      () =>
        runAction(
          `listing-${stockId}`,
          () => farmApi.removeAdminMarketplaceListing(stockId),
          fetchMarketplaceData,
        ),
    );

  const deletePurchaseRequest = requestId =>
    confirmAction('Delete Request', 'Delete this purchase request?', () =>
      runAction(
        `request-${requestId}`,
        () => farmApi.deleteAdminPurchaseRequest(requestId),
        fetchMarketplaceData,
      ),
    );

  const submitDisease = () => {
    if (!diseaseForm.name.trim() || !diseaseForm.category.trim()) {
      Alert.alert('Diseases', 'Disease name and category are required.');
      return;
    }

    runAction(
      'disease-submit',
      () =>
        editingDisease
          ? farmApi.updateAdminDisease(editingDisease.DiseaseId, diseaseForm)
          : farmApi.addAdminDisease(diseaseForm),
      async () => {
        setEditingDisease(null);
        setDiseaseForm(emptyDiseaseForm);
        await fetchDiseases();
      },
    );
  };

  const editDisease = disease => {
    setEditingDisease(disease);
    setDiseaseForm({
      name: disease.Name || disease.name || '',
      category: disease.Category || disease.category || 'Bacterial',
      symptoms: disease.Symptoms || disease.symptoms || '',
      species: disease.Species || disease.species || '',
      treatment: disease.Treatment || disease.treatment || '',
      prevention: disease.Prevention || disease.prevention || '',
      severity: disease.Severity || disease.severity || 'Moderate',
    });
  };

  const toggleDisease = id =>
    runAction(
      `disease-${id}`,
      () => farmApi.toggleAdminDiseaseStatus(id),
      fetchDiseases,
    );

  const replyToTicket = ticketId => {
    if (!ticketReply.trim()) {
      Alert.alert('Tickets', 'Reply text is required.');
      return;
    }

    runAction(
      `ticket-reply-${ticketId}`,
      () => farmApi.replyToTicket(ticketId, ticketReply.trim()),
      async () => {
        setReplyingTicket(null);
        setTicketReply('');
        await fetchTickets();
      },
    );
  };

  const closeTicket = ticketId =>
    confirmAction('Close Ticket', 'Close this support ticket?', () =>
      runAction(
        `ticket-close-${ticketId}`,
        () => farmApi.closeTicket(ticketId),
        fetchTickets,
      ),
    );

  const submitAnnouncement = () => {
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) {
      Alert.alert('Announcements', 'Title and message are required.');
      return;
    }

    runAction(
      'announcement-create',
      () => farmApi.createAdminAnnouncement(announcementForm),
      async () => {
        setAnnouncementForm(emptyAnnouncementForm);
        await fetchAnnouncements();
      },
    );
  };

  const deleteAnnouncement = id =>
    confirmAction('Delete Announcement', 'Delete this announcement?', () =>
      runAction(
        `announcement-${id}`,
        () => farmApi.deleteAdminAnnouncement(id),
        fetchAnnouncements,
      ),
    );

  const submitRule = () => {
    if (ruleTab === 'feed') {
      return runAction(
        'feed-rule-submit',
        () =>
          editingFeedRule
            ? farmApi.updateFeedRule(
                editingFeedRule.RuleId,
                numberPayload(feedRuleForm),
              )
            : farmApi.createFeedRule(numberPayload(feedRuleForm)),
        async () => {
          setEditingFeedRule(null);
          setFeedRuleForm(emptyFeedRuleForm);
          await fetchRules();
        },
      );
    }

    if (ruleTab === 'fertilizer') {
      return runAction(
        'fert-rule-submit',
        () =>
          editingFertilizerRule
            ? farmApi.updateFertilizerRule(
                editingFertilizerRule.RuleId,
                numberPayload(fertilizerRuleForm),
              )
            : farmApi.createFertilizerRule(numberPayload(fertilizerRuleForm)),
        async () => {
          setEditingFertilizerRule(null);
          setFertilizerRuleForm(emptyFertilizerRuleForm);
          await fetchRules();
        },
      );
    }

    if (ruleTab === 'stocking') {
      const speciesMix = stockingSpeciesMix
        .map(entry => ({
          speciesId: Number(entry.speciesId),
          quantity: Number(entry.quantity || 0),
        }))
        .filter(entry => entry.speciesId && entry.quantity > 0);

      if (!speciesMix.length) {
        Alert.alert(
          'Stocking Rule',
          'Select at least one fish species and enter a quantity.',
        );
        return null;
      }

      const uniqueSpeciesIds = [
        ...new Set(speciesMix.map(entry => entry.speciesId)),
      ];
      if (uniqueSpeciesIds.length !== speciesMix.length) {
        Alert.alert(
          'Stocking Rule',
          'Each fish species can only appear once in the mix.',
        );
        return null;
      }

      const maxSpeciesAllowed = Number(stockingRuleForm.MaxSpeciesAllowed || 1);
      if (uniqueSpeciesIds.length > maxSpeciesAllowed) {
        Alert.alert(
          'Stocking Rule',
          `This rule allows up to ${maxSpeciesAllowed} species.`,
        );
        return null;
      }

      const minFishPerAcre = Number(stockingRuleForm.MinFishPerAcre || 0);
      const maxFishPerAcre = Number(stockingRuleForm.MaxFishPerAcre || 0);
      const minFishSize = Number(stockingRuleForm.MinFishSizeInches || 0);
      const maxFishSize = Number(stockingRuleForm.MaxFishSizeInches || 0);
      const minPondSize = Number(stockingRuleForm.MinPondSizeAcres || 0);
      const maxPondSize = Number(stockingRuleForm.MaxPondSizeAcres || 0);
      const totalRuleQuantity = speciesMix.reduce(
        (sum, entry) => sum + entry.quantity,
        0,
      );

      if (
        !Number.isFinite(minFishPerAcre) ||
        !Number.isFinite(maxFishPerAcre) ||
        maxFishPerAcre <= 0
      ) {
        Alert.alert(
          'Stocking Rule',
          'Enter a valid maximum fish-per-acre value before saving.',
        );
        return null;
      }

      if (minFishPerAcre < 0 || minFishPerAcre > maxFishPerAcre) {
        Alert.alert(
          'Stocking Rule',
          'Minimum fish per acre cannot be greater than maximum fish per acre.',
        );
        return null;
      }

      if (
        !Number.isFinite(minFishSize) ||
        !Number.isFinite(maxFishSize) ||
        minFishSize < 0 ||
        maxFishSize <= 0 ||
        minFishSize > maxFishSize
      ) {
        Alert.alert(
          'Stocking Rule',
          'Enter a valid fish size range before saving.',
        );
        return null;
      }

      if (
        !Number.isFinite(minPondSize) ||
        !Number.isFinite(maxPondSize) ||
        minPondSize < 0 ||
        maxPondSize <= 0 ||
        minPondSize > maxPondSize
      ) {
        Alert.alert(
          'Stocking Rule',
          'Enter a valid pond size range before saving.',
        );
        return null;
      }

      if (totalRuleQuantity < minFishPerAcre) {
        Alert.alert(
          'Stocking Rule',
          `The species mix totals ${totalRuleQuantity.toLocaleString()} fish per acre, which is below the minimum of ${minFishPerAcre.toLocaleString()}.`,
        );
        return null;
      }

      if (totalRuleQuantity > maxFishPerAcre) {
        Alert.alert(
          'Stocking Rule',
          `The species mix totals ${totalRuleQuantity.toLocaleString()} fish per acre, but this rule allows only ${maxFishPerAcre.toLocaleString()} fish per acre.`,
        );
        return null;
      }

      const speciesOverDensity = speciesMix.find(entry => {
        const density = getSpeciesStockingDensity(entry.speciesId);
        return density > 0 && entry.quantity > density;
      });
      if (speciesOverDensity) {
        const density = getSpeciesStockingDensity(
          speciesOverDensity.speciesId,
        );
        Alert.alert(
          'Stocking Rule',
          `${getSpeciesName(
            speciesOverDensity.speciesId,
          )} is limited to ${density.toLocaleString()} fish per acre in the overview sheet. Enter ${density.toLocaleString()} or less.`,
        );
        return null;
      }

      if (uniqueSpeciesIds.length > 1) {
        const hasIncompatiblePair = Object.values(stockingCompatibilityMap).some(
          pair => pair.compatible === false,
        );
        if (checkingStockingCompat || hasIncompatiblePair) {
          Alert.alert(
            'Incompatible Species',
            'All selected fish must be compatible before saving this stocking rule.',
          );
          return null;
        }
      }

      const payload = {
        ...numberPayload(stockingRuleForm),
        speciesMix,
      };

      return runAction(
        'stocking-rule-submit',
        () =>
          editingStockingRule
            ? farmApi.updateAdminStockingRule(
                editingStockingRule.RuleId,
                payload,
              )
            : farmApi.createAdminStockingRule(payload),
        async () => {
          setEditingStockingRule(null);
          setStockingRuleForm(emptyStockingRuleForm);
          setStockingSpeciesMix([{ ...emptyStockingMixEntry }]);
          setStockingCompatibilityMap({});
          await fetchRules();
        },
      );
    }

    if (!compatibilityForm.speciesId || !compatibilityForm.compatibleWithId) {
      Alert.alert('Compatibility', 'Both species IDs are required.');
      return null;
    }

    return runAction(
      'compatibility-submit',
      () => farmApi.createAdminCompatibility(numberPayload(compatibilityForm)),
      async () => {
        setCompatibilityForm(emptyCompatibilityForm);
        await fetchRules();
      },
    );
  };

  const deleteRule = (type, id) => {
    const apiCall =
      type === 'feed'
        ? () => farmApi.deleteFeedRule(id)
        : type === 'fertilizer'
        ? () => farmApi.deleteFertilizerRule(id)
        : type === 'stocking'
        ? () => farmApi.deleteAdminStockingRule(id)
        : () => farmApi.deleteAdminCompatibility(id);

    confirmAction('Delete Rule', 'Delete this admin rule?', () =>
      runAction(`rule-${type}-${id}`, apiCall, fetchRules),
    );
  };

  const renderLoading = label => (
    <View style={styles.loadingBox}>
      <ActivityIndicator size="large" color="#D97706" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );

  const renderEmpty = (title, subtitle) => (
    <View style={styles.emptyBox}>
      <Database size={34} color="#94A3B8" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );

  const renderField = (label, value) => (
    <View style={styles.fieldRow} key={label}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{asText(value)}</Text>
    </View>
  );

  const renderTextInput = (label, value, onChangeText, props = {}) => (
    <View style={styles.formGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#94A3B8"
        style={[styles.input, props.multiline && styles.textArea]}
        {...props}
      />
    </View>
  );

  const getSpeciesName = speciesId => {
    const match = approvedSpecies.find(
      species => Number(species.SpeciesId) === Number(speciesId),
    );
    return match?.Name || `Species #${speciesId}`;
  };

  const getSpeciesStockingDensity = speciesId => {
    const match = approvedSpecies.find(
      species => Number(species.SpeciesId) === Number(speciesId),
    );
    return getPositiveNumber(match?.MaxStockingDensity);
  };

  const renderPicker = (label, value, options, onChange) => (
    <View style={styles.formGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={value} onValueChange={onChange}>
          {options.map(option => (
            <Picker.Item
              key={String(option.value)}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
    </View>
  );

  const getStockingSpeciesCompatibilityNote = (speciesId, rowIndex) => {
    if (!speciesId || rowIndex === 0) {
      return null;
    }

    const currentId = Number(speciesId);
    const priorIds = stockingSpeciesMix
      .slice(0, rowIndex)
      .map(entry => Number(entry.speciesId))
      .filter(Boolean);

    for (const priorId of priorIds) {
      const pair =
        stockingCompatibilityMap[`${currentId}-${priorId}`] ||
        stockingCompatibilityMap[`${priorId}-${currentId}`];

      if (checkingStockingCompat && !pair) {
        return 'Checking compatibility...';
      }

      if (pair && pair.compatible === false) {
        return (
          pair.reason || `Not compatible with ${getSpeciesName(priorId)}`
        );
      }
    }

    if (checkingStockingCompat) {
      return 'Checking compatibility...';
    }

    return 'Compatible with selected fish';
  };

  const updateStockingSpeciesRow = (index, field, value) => {
    setStockingSpeciesMix(prev =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const addStockingSpeciesRow = () => {
    const maxSpeciesAllowed = Number(stockingRuleForm.MaxSpeciesAllowed || 3);
    if (stockingSpeciesMix.length >= maxSpeciesAllowed) {
      Alert.alert(
        'Species Limit',
        `You can add up to ${maxSpeciesAllowed} species for this rule.`,
      );
      return;
    }
    setStockingSpeciesMix(prev => [...prev, { ...emptyStockingMixEntry }]);
  };

  const removeStockingSpeciesRow = index => {
    if (stockingSpeciesMix.length === 1) {
      setStockingSpeciesMix([{ ...emptyStockingMixEntry }]);
      return;
    }
    setStockingSpeciesMix(prev => prev.filter((_, entryIndex) => entryIndex !== index));
  };

  const resetStockingRuleForm = () => {
    setEditingStockingRule(null);
    setStockingRuleForm(emptyStockingRuleForm);
    setStockingSpeciesMix([{ ...emptyStockingMixEntry }]);
    setStockingCompatibilityMap({});
  };

  const renderStockingRuleForm = () => {
    const speciesOptions = [
      { label: 'Select fish species', value: '' },
      ...approvedSpecies.map(species => ({
        label: species.Name,
        value: String(species.SpeciesId),
      })),
    ];

    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>
          {editingStockingRule
            ? 'Edit Stocking Rule'
            : 'Create Stocking Rule'}
        </Text>
        <Text style={styles.formHint}>
          Choose fish species, verify compatibility, set quantities, and define
          when this rule applies by pond stage and fish entry size.
        </Text>

        {stockingSpeciesMix.map((entry, index) => {
          const compatibilityNote = getStockingSpeciesCompatibilityNote(
            entry.speciesId,
            index,
          );
          const isIncompatible =
            compatibilityNote &&
            !checkingStockingCompat &&
            !compatibilityNote.startsWith('Compatible');

          return (
            <View style={styles.mixRow} key={`stocking-mix-${index}`}>
              <Text style={styles.mixRowTitle}>
                {index === 0 ? 'Primary Fish' : `Additional Fish ${index}`}
              </Text>
              {renderPicker(
                'Fish Species',
                entry.speciesId,
                speciesOptions.filter(option => {
                  if (!option.value) return true;
                  const usedElsewhere = stockingSpeciesMix.some(
                    (mixEntry, mixIndex) =>
                      mixIndex !== index &&
                      String(mixEntry.speciesId) === String(option.value),
                  );
                  return !usedElsewhere;
                }),
                value => updateStockingSpeciesRow(index, 'speciesId', value),
              )}
              {renderTextInput(
                'Quantity',
                entry.quantity,
                text => updateStockingSpeciesRow(index, 'quantity', text),
                { keyboardType: 'numeric' },
              )}
              {!!compatibilityNote && (
                <Text
                  style={[
                    styles.compatibilityNote,
                    isIncompatible && styles.compatibilityWarning,
                  ]}
                >
                  {compatibilityNote}
                </Text>
              )}
              {index > 0 ? (
                <TouchableOpacity
                  style={styles.removeMixButton}
                  onPress={() => removeStockingSpeciesRow(index)}
                >
                  <Text style={styles.removeMixButtonText}>Remove Fish</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        <View style={styles.actionsRow}>
          {renderActionButton('Add Another Fish', addStockingSpeciesRow, 'muted')}
        </View>

        {renderPicker(
          'Pond Stage',
          stockingRuleForm.Stage,
          POND_STAGES.map(stage => ({ label: stage, value: stage })),
          value => setStockingRuleForm({ ...stockingRuleForm, Stage: value }),
        )}
        {renderPicker(
          'Cultivation Type',
          stockingRuleForm.CultivationType,
          CULTIVATION_TYPES.map(type => ({ label: type, value: type })),
          value =>
            setStockingRuleForm({ ...stockingRuleForm, CultivationType: value }),
        )}
        {renderPicker(
          'Culture Type',
          stockingRuleForm.CultureType,
          CULTURE_TYPES.map(type => ({ label: type, value: type })),
          value =>
            setStockingRuleForm({ ...stockingRuleForm, CultureType: value }),
        )}
        {renderTextInput(
          'Min Fish Entry Size (inches)',
          stockingRuleForm.MinFishSizeInches,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MinFishSizeInches: text }),
          { keyboardType: 'decimal-pad' },
        )}
        {renderTextInput(
          'Max Fish Entry Size (inches)',
          stockingRuleForm.MaxFishSizeInches,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MaxFishSizeInches: text }),
          { keyboardType: 'decimal-pad' },
        )}
        {renderTextInput(
          'Min Pond Size (acres)',
          stockingRuleForm.MinPondSizeAcres,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MinPondSizeAcres: text }),
          { keyboardType: 'decimal-pad' },
        )}
        {renderTextInput(
          'Max Pond Size (acres)',
          stockingRuleForm.MaxPondSizeAcres,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MaxPondSizeAcres: text }),
          { keyboardType: 'decimal-pad' },
        )}
        {renderTextInput(
          'Min Fish Per Acre',
          stockingRuleForm.MinFishPerAcre,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MinFishPerAcre: text }),
          { keyboardType: 'numeric' },
        )}
        {renderTextInput(
          'Max Fish Per Acre',
          stockingRuleForm.MaxFishPerAcre,
          text =>
            setStockingRuleForm({ ...stockingRuleForm, MaxFishPerAcre: text }),
          { keyboardType: 'numeric' },
        )}
        {renderTextInput(
          'Max Species Allowed',
          stockingRuleForm.MaxSpeciesAllowed,
          text =>
            setStockingRuleForm({
              ...stockingRuleForm,
              MaxSpeciesAllowed: text,
            }),
          { keyboardType: 'numeric' },
        )}

        <View style={styles.actionsRow}>
          {renderActionButton('Save Stocking Rule', submitRule, 'primary')}
          {editingStockingRule
            ? renderActionButton('Cancel', resetStockingRuleForm, 'muted')
            : null}
        </View>
      </View>
    );
  };

  const renderActionButton = (
    label,
    onPress,
    variant = 'primary',
    disabled = false,
  ) => (
    <TouchableOpacity
      style={[
        styles.actionButton,
        variant === 'danger' && styles.dangerButton,
        variant === 'muted' && styles.mutedButton,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'muted' && styles.mutedButtonText,
        ]}
      >
        {disabled ? 'Working...' : label}
      </Text>
    </TouchableOpacity>
  );

  const renderSpeciesCard = (species, pending = false) => (
    <View style={styles.card} key={species.SpeciesId || species.Name}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{species.Name || species.name}</Text>
          <Text style={styles.cardSubTitle}>
            {pending ? 'Pending submission' : 'Approved species'}
          </Text>
        </View>
        <View
          style={[
            styles.badge,
            pending ? styles.pendingBadge : styles.liveBadge,
          ]}
        >
          <Text style={styles.badgeText}>{pending ? 'Pending' : 'Live'}</Text>
        </View>
      </View>
      {renderField('Regions', species.CompatibleRegions)}
      {renderField(
        'Temperature',
        `${asText(species.MinTemp)}-${asText(species.MaxTemp)} C`,
      )}
      {renderField('pH', `${asText(species.MinPH)}-${asText(species.MaxPH)}`)}
      {renderField('Stocking/Acre', species.MaxStockingDensity)}
      {renderField(
        'Market Price',
        `${asText(species.MinMarketPrice)}-${asText(species.MaxMarketPrice)}`,
      )}
      {!!species.Description && renderField('Description', species.Description)}
      <View style={styles.actionsRow}>
        {pending
          ? renderActionButton(
              'Approve',
              () => approveSpecies(species.SpeciesId),
              'primary',
              actionKey === `approve-${species.SpeciesId}`,
            )
          : null}
        {pending
          ? renderActionButton(
              'Reject',
              () => rejectSpecies(species.SpeciesId),
              'danger',
              actionKey === `reject-${species.SpeciesId}`,
            )
          : renderActionButton(
              'Delete',
              () => deleteSpecies(species.SpeciesId),
              'danger',
              actionKey === `species-${species.SpeciesId}`,
            )}
      </View>
    </View>
  );

  const renderApprovals = () => {
    if (loading) return renderLoading('Loading species submissions...');
    if (!pendingSpecies.length) {
      return renderEmpty(
        'Queue is empty',
        'All species submissions have been reviewed.',
      );
    }
    return pendingSpecies.map(species => renderSpeciesCard(species, true));
  };

  const renderAllSpecies = () => {
    if (loading) return renderLoading('Loading approved species...');
    if (!approvedSpecies.length) {
      return renderEmpty(
        'No approved species',
        'Approved species will appear here.',
      );
    }
    return approvedSpecies.map(species => renderSpeciesCard(species, false));
  };

  const renderUsers = () => {
    if (sectionLoading) return renderLoading('Loading users...');
    if (!usersList.length) return renderEmpty('No users found');

    return usersList.map(user => (
      <View style={styles.card} key={user.UserId}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle}>
              {user.Name || user.name || 'Unnamed user'}
            </Text>
            <Text style={styles.cardSubTitle}>{user.Email || user.email}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{user.Role || 'user'}</Text>
          </View>
        </View>
        {renderField('Status', user.IsActive === false ? 'Blocked' : 'Active')}
        {renderField('Created', user.CreatedAt)}
        <View style={styles.actionsRow}>
          {['user', 'Consumer', 'admin'].map(role =>
            renderActionButton(
              role,
              () => changeRole(user.UserId, role),
              user.Role === role ? 'primary' : 'muted',
              actionKey === `user-role-${user.UserId}`,
            ),
          )}
        </View>
        <View style={styles.actionsRow}>
          {renderActionButton(
            user.IsActive === false ? 'Unblock' : 'Block',
            () => toggleUser(user.UserId),
            'muted',
            actionKey === `user-status-${user.UserId}`,
          )}
          {renderActionButton(
            'Delete',
            () => deleteUser(user.UserId),
            'danger',
            actionKey === `user-delete-${user.UserId}`,
          )}
        </View>
      </View>
    ));
  };

  const renderFarms = () => {
    if (sectionLoading) return renderLoading('Loading farms...');

    return (
      <>
        <View style={styles.statsGrid}>
          {Object.entries(farmStats).map(([key, value]) => (
            <View style={styles.statCard} key={key}>
              <Text style={styles.statValue}>{asText(value)}</Text>
              <Text style={styles.statLabel}>
                {key.replace(/([A-Z])/g, ' $1')}
              </Text>
            </View>
          ))}
        </View>
        {!farms.length
          ? renderEmpty('No farms found')
          : farms.map(farm => (
              <View style={styles.card} key={getId(farm)}>
                <Text style={styles.cardTitle}>
                  {farm.FarmName || farm.OwnerName || 'Farm'}
                </Text>
                {renderField('Owner', farm.OwnerName || farm.UserName)}
                {renderField('Email', farm.Email)}
                {renderField('Area', farm.TotalArea || farm.totalArea)}
                {renderField('Ponds', farm.PondCount || farm.pondCount)}
                {renderField('Created', farm.CreatedAt)}
              </View>
            ))}
      </>
    );
  };

  const renderMarketplace = () => {
    if (sectionLoading)
      return renderLoading('Loading marketplace moderation...');

    return (
      <>
        <Text style={styles.sectionTitle}>Marketplace Listings</Text>
        {!marketplaceListings.length
          ? renderEmpty('No marketplace listings')
          : marketplaceListings.map(listing => (
              <View style={styles.card} key={listing.StockId || getId(listing)}>
                <Text style={styles.cardTitle}>
                  {listing.SpeciesName || listing.speciesName || 'Listing'}
                </Text>
                {renderField('Farmer', listing.FarmerName || listing.OwnerName)}
                {renderField(
                  'Quantity',
                  listing.QuantityForSale || listing.quantityForSale,
                )}
                {renderField(
                  'Price',
                  listing.SalePricePerUnit || listing.salePricePerUnit,
                )}
                {renderField('Status', listing.Status || listing.status)}
                <View style={styles.actionsRow}>
                  {renderActionButton(
                    'Remove Listing',
                    () => removeListing(listing.StockId),
                    'danger',
                    actionKey === `listing-${listing.StockId}`,
                  )}
                </View>
              </View>
            ))}

        <Text style={styles.sectionTitle}>Purchase Requests</Text>
        {!purchaseRequests.length
          ? renderEmpty('No purchase requests')
          : purchaseRequests.map(request => (
              <View
                style={styles.card}
                key={request.RequestId || getId(request)}
              >
                <Text style={styles.cardTitle}>
                  {request.SpeciesName || 'Purchase Request'}
                </Text>
                {renderField(
                  'Buyer',
                  request.ConsumerName || request.BuyerName,
                )}
                {renderField('Farmer', request.FarmerName)}
                {renderField('Quantity', request.Quantity)}
                {renderField('Status', request.Status)}
                <View style={styles.actionsRow}>
                  {renderActionButton(
                    'Delete Request',
                    () => deletePurchaseRequest(request.RequestId),
                    'danger',
                    actionKey === `request-${request.RequestId}`,
                  )}
                </View>
              </View>
            ))}
      </>
    );
  };

  const renderDiseases = () => (
    <>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>
          {editingDisease ? 'Edit Disease' : 'Add Disease'}
        </Text>
        {renderTextInput('Name', diseaseForm.name, text =>
          setDiseaseForm({ ...diseaseForm, name: text }),
        )}
        {renderTextInput('Category', diseaseForm.category, text =>
          setDiseaseForm({ ...diseaseForm, category: text }),
        )}
        {renderTextInput('Severity', diseaseForm.severity, text =>
          setDiseaseForm({ ...diseaseForm, severity: text }),
        )}
        {renderTextInput('Affected Species', diseaseForm.species, text =>
          setDiseaseForm({ ...diseaseForm, species: text }),
        )}
        {renderTextInput(
          'Symptoms',
          diseaseForm.symptoms,
          text => setDiseaseForm({ ...diseaseForm, symptoms: text }),
          { multiline: true },
        )}
        {renderTextInput(
          'Treatment',
          diseaseForm.treatment,
          text => setDiseaseForm({ ...diseaseForm, treatment: text }),
          { multiline: true },
        )}
        {renderTextInput(
          'Prevention',
          diseaseForm.prevention,
          text => setDiseaseForm({ ...diseaseForm, prevention: text }),
          { multiline: true },
        )}
        <View style={styles.actionsRow}>
          {renderActionButton(
            editingDisease ? 'Update Disease' : 'Add Disease',
            submitDisease,
            'primary',
            actionKey === 'disease-submit',
          )}
          {editingDisease
            ? renderActionButton(
                'Cancel',
                () => {
                  setEditingDisease(null);
                  setDiseaseForm(emptyDiseaseForm);
                },
                'muted',
              )
            : null}
        </View>
      </View>

      {sectionLoading
        ? renderLoading('Loading diseases...')
        : !diseases.length
        ? renderEmpty('No diseases in catalog')
        : diseases.map(disease => (
            <View style={styles.card} key={disease.DiseaseId}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{disease.Name}</Text>
                  <Text style={styles.cardSubTitle}>{disease.Category}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {disease.Severity || 'Moderate'}
                  </Text>
                </View>
              </View>
              {renderField('Symptoms', disease.Symptoms)}
              {renderField('Treatment', disease.Treatment)}
              {renderField(
                'Status',
                disease.IsActive === false ? 'Inactive' : 'Active',
              )}
              <View style={styles.actionsRow}>
                {renderActionButton(
                  'Edit',
                  () => editDisease(disease),
                  'muted',
                )}
                {renderActionButton(
                  disease.IsActive === false ? 'Activate' : 'Deactivate',
                  () => toggleDisease(disease.DiseaseId),
                  'danger',
                  actionKey === `disease-${disease.DiseaseId}`,
                )}
              </View>
            </View>
          ))}
    </>
  );

  const renderTickets = () => {
    if (sectionLoading) return renderLoading('Loading support tickets...');
    if (!tickets.length) return renderEmpty('No support tickets');

    return tickets.map(ticket => (
      <View style={styles.card} key={ticket.TicketId}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle}>
              {ticket.Subject || ticket.Title}
            </Text>
            <Text style={styles.cardSubTitle}>
              {ticket.UserName || ticket.Email}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{ticket.Status}</Text>
          </View>
        </View>
        {renderField('Message', ticket.Message)}
        {ticket.AdminReply
          ? renderField('Admin Reply', ticket.AdminReply)
          : null}
        {replyingTicket === ticket.TicketId && (
          <View style={styles.inlineForm}>
            {renderTextInput('Reply', ticketReply, setTicketReply, {
              multiline: true,
            })}
            {renderActionButton(
              'Send Reply',
              () => replyToTicket(ticket.TicketId),
              'primary',
              actionKey === `ticket-reply-${ticket.TicketId}`,
            )}
          </View>
        )}
        <View style={styles.actionsRow}>
          {renderActionButton(
            replyingTicket === ticket.TicketId ? 'Cancel Reply' : 'Reply',
            () => {
              setReplyingTicket(
                replyingTicket === ticket.TicketId ? null : ticket.TicketId,
              );
              setTicketReply(ticket.AdminReply || '');
            },
            'muted',
          )}
          {ticket.Status !== 'Closed'
            ? renderActionButton(
                'Close',
                () => closeTicket(ticket.TicketId),
                'danger',
                actionKey === `ticket-close-${ticket.TicketId}`,
              )
            : null}
        </View>
      </View>
    ));
  };

  const renderAnnouncements = () => (
    <>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Create Announcement</Text>
        {renderTextInput('Title', announcementForm.title, text =>
          setAnnouncementForm({ ...announcementForm, title: text }),
        )}
        {renderTextInput('Type', announcementForm.type, text =>
          setAnnouncementForm({ ...announcementForm, type: text }),
        )}
        {renderTextInput(
          'Message',
          announcementForm.message,
          text => setAnnouncementForm({ ...announcementForm, message: text }),
          { multiline: true },
        )}
        {renderActionButton(
          'Publish Announcement',
          submitAnnouncement,
          'primary',
          actionKey === 'announcement-create',
        )}
      </View>
      {sectionLoading
        ? renderLoading('Loading announcements...')
        : !announcements.length
        ? renderEmpty('No announcements')
        : announcements.map(announcement => (
            <View style={styles.card} key={announcement.Id}>
              <Text style={styles.cardTitle}>{announcement.Title}</Text>
              {renderField('Type', announcement.Type)}
              {renderField('Message', announcement.Message)}
              {renderField('Created', announcement.CreatedAt)}
              <View style={styles.actionsRow}>
                {renderActionButton(
                  'Delete',
                  () => deleteAnnouncement(announcement.Id),
                  'danger',
                  actionKey === `announcement-${announcement.Id}`,
                )}
              </View>
            </View>
          ))}
    </>
  );

  const renderRuleForm = () => {
    if (ruleTab === 'feed') {
      return (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingFeedRule ? 'Edit Feed Rule' : 'Create Feed Rule'}
          </Text>
          {Object.entries(feedRuleForm).map(([key, value]) =>
            renderTextInput(key, String(value), text =>
              setFeedRuleForm({ ...feedRuleForm, [key]: text }),
            ),
          )}
          <View style={styles.actionsRow}>
            {renderActionButton('Save Feed Rule', submitRule, 'primary')}
            {editingFeedRule
              ? renderActionButton(
                  'Cancel',
                  () => {
                    setEditingFeedRule(null);
                    setFeedRuleForm(emptyFeedRuleForm);
                  },
                  'muted',
                )
              : null}
          </View>
        </View>
      );
    }

    if (ruleTab === 'fertilizer') {
      return (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingFertilizerRule
              ? 'Edit Fertilizer Rule'
              : 'Create Fertilizer Rule'}
          </Text>
          {Object.entries(fertilizerRuleForm).map(([key, value]) =>
            renderTextInput(key, String(value), text =>
              setFertilizerRuleForm({ ...fertilizerRuleForm, [key]: text }),
            ),
          )}
          <View style={styles.actionsRow}>
            {renderActionButton('Save Fertilizer Rule', submitRule, 'primary')}
            {editingFertilizerRule
              ? renderActionButton(
                  'Cancel',
                  () => {
                    setEditingFertilizerRule(null);
                    setFertilizerRuleForm(emptyFertilizerRuleForm);
                  },
                  'muted',
                )
              : null}
          </View>
        </View>
      );
    }

    if (ruleTab === 'stocking') {
      return renderStockingRuleForm();
    }

    return (
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Create Compatibility Rule</Text>
        {Object.entries(compatibilityForm).map(([key, value]) =>
          renderTextInput(key, String(value), text =>
            setCompatibilityForm({ ...compatibilityForm, [key]: text }),
          ),
        )}
        {renderActionButton('Save Compatibility', submitRule, 'primary')}
      </View>
    );
  };

  const getCurrentRules = () => {
    if (ruleTab === 'feed') return feedRules;
    if (ruleTab === 'fertilizer') return fertilizerRules;
    if (ruleTab === 'stocking') return stockingRules;
    return compatibilities;
  };

  const editRule = rule => {
    if (ruleTab === 'feed') {
      setEditingFeedRule(rule);
      setFeedRuleForm({
        speciesId: asText(rule.SpeciesId || rule.speciesId),
        stage: asText(rule.Stage || rule.stage),
        minSize: asText(rule.MinSize || rule.minSize || 0),
        maxSize: asText(rule.MaxSize || rule.maxSize || 99),
        dailyRate: asText(rule.DailyRate || rule.dailyRate || 0),
        conditionFactor: asText(
          rule.ConditionFactor || rule.conditionFactor || 0.01,
        ),
        feedType: asText(rule.FeedType || rule.feedType),
        frequency: asText(rule.Frequency || rule.frequency),
      });
    }

    if (ruleTab === 'fertilizer') {
      setEditingFertilizerRule(rule);
      setFertilizerRuleForm({
        ...emptyFertilizerRuleForm,
        cultivationType: asText(rule.CultivationType || rule.cultivationType),
        pondType: asText(rule.PondType || rule.pondType),
        orgProduct: asText(rule.OrgProduct || rule.orgProduct),
        orgDosage: asText(rule.OrgDosage || rule.orgDosage || 0),
        orgRate: asText(rule.OrgRate || rule.orgRate || 0),
        orgFrequency: asText(rule.OrgFrequency || rule.orgFrequency),
        orgBenefits: asText(rule.OrgBenefits || rule.orgBenefits),
        inorgProduct: asText(rule.InorgProduct || rule.inorgProduct),
        inorgDosage: asText(rule.InorgDosage || rule.inorgDosage || 0),
        inorgRate: asText(rule.InorgRate || rule.inorgRate || 0),
        inorgFrequency: asText(rule.InorgFrequency || rule.inorgFrequency),
        inorgBenefits: asText(rule.InorgBenefits || rule.inorgBenefits),
        limeProduct: asText(rule.LimeProduct || rule.limeProduct),
        limeDosage: asText(rule.LimeDosage || rule.limeDosage || 0),
        limeRate: asText(rule.LimeRate || rule.limeRate || 0),
        limeFrequency: asText(rule.LimeFrequency || rule.limeFrequency),
        limeBenefits: asText(rule.LimeBenefits || rule.limeBenefits),
      });
    }

    if (ruleTab === 'stocking') {
      setEditingStockingRule(rule);
      setStockingRuleForm({
        Stage: asText(rule.Stage || 'Nursery'),
        CultivationType: asText(rule.CultivationType || 'Extensive'),
        CultureType: asText(rule.CultureType || 'Polyculture'),
        MinFishPerAcre: asText(rule.MinFishPerAcre || 0),
        MaxFishPerAcre: asText(rule.MaxFishPerAcre || 0),
        MaxSpeciesAllowed: asText(rule.MaxSpeciesAllowed || 3),
        MinFishSizeInches: asText(rule.MinFishSizeInches ?? 2),
        MaxFishSizeInches: asText(rule.MaxFishSizeInches ?? 6),
        MinPondSizeAcres: asText(rule.MinPondSizeAcres ?? 0.5),
        MaxPondSizeAcres: asText(rule.MaxPondSizeAcres ?? 5),
      });
      const mix = Array.isArray(rule.speciesMix) ? rule.speciesMix : [];
      setStockingSpeciesMix(
        mix.length
          ? mix.map(entry => ({
              speciesId: String(entry.speciesId || ''),
              quantity: String(entry.quantity || ''),
            }))
          : [{ ...emptyStockingMixEntry }],
      );
    }
  };

  const renderRules = () => {
    const rules = getCurrentRules();

    return (
      <>
        <View style={styles.ruleTabBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.ruleTabScroll}
            contentContainerStyle={styles.ruleTabs}
          >
            {RULE_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.ruleTab,
                ruleTab === tab.key && styles.ruleTabActive,
              ]}
              onPress={() => setRuleTab(tab.key)}
            >
              <Text
                style={[
                  styles.ruleTabText,
                  ruleTab === tab.key && styles.ruleTabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
          </ScrollView>
        </View>
        {renderRuleForm()}
        {sectionLoading
          ? renderLoading('Loading rules...')
          : !rules.length
          ? renderEmpty('No rules found')
          : rules.map(rule => {
              const id = getId(rule);
              const stockingMixSummary =
                ruleTab === 'stocking' && Array.isArray(rule.speciesMix)
                  ? rule.speciesMix
                      .map(
                        entry =>
                          `${getSpeciesName(entry.speciesId)} (${entry.quantity})`,
                      )
                      .join(', ')
                  : '';
              return (
                <View style={styles.card} key={`${ruleTab}-${id}`}>
                  <Text style={styles.cardTitle}>
                    {stockingMixSummary ||
                      rule.SpeciesName ||
                      rule.Stage ||
                      rule.CultivationType ||
                      rule.Category ||
                      `Rule ${id}`}
                  </Text>
                  {ruleTab === 'stocking' && !!stockingMixSummary
                    ? renderField('Fish Mix', stockingMixSummary)
                    : null}
                  {Object.entries(rule)
                    .filter(([key]) => key !== 'speciesMix' && key !== 'SpeciesMix')
                    .slice(0, 8)
                    .map(([key, value]) => renderField(key, value))}
                  <View style={styles.actionsRow}>
                    {ruleTab !== 'compatibility'
                      ? renderActionButton(
                          'Edit',
                          () => editRule(rule),
                          'muted',
                        )
                      : null}
                    {renderActionButton(
                      'Delete',
                      () => deleteRule(ruleTab, id),
                      'danger',
                      actionKey === `rule-${ruleTab}-${id}`,
                    )}
                  </View>
                </View>
              );
            })}
      </>
    );
  };

  const renderKnowledge = () => (
    <>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Create New Guide</Text>
        {renderTextInput('Guide Title', guideForm.title, text =>
          setGuideForm({ ...guideForm, title: text }),
        )}
        {renderTextInput('Category', guideForm.category, text =>
          setGuideForm({ ...guideForm, category: text }),
        )}
        {renderActionButton(
          'Add Guide Block',
          createGuide,
          'primary',
          actionKey === 'create-guide',
        )}
      </View>

      {!guides.length
        ? renderEmpty('No guides yet')
        : guides.map(guide => (
            <View style={styles.card} key={guide.GuideId}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{guide.Title}</Text>
                  <Text style={styles.cardSubTitle}>{guide.TabCategory}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteGuide(guide.GuideId)}>
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
              {(guide.sections || []).map(section => (
                <View style={styles.sectionCard} key={section.SectionId}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.sectionHeading}>{section.Title}</Text>
                    <Text style={styles.sectionText}>
                      {section.ContentText}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteSection(section.SectionId)}
                  >
                    <XCircle size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              {activeGuideForm === guide.GuideId ? (
                <View style={styles.inlineForm}>
                  {renderTextInput('Section Title', sectionForm.title, text =>
                    setSectionForm({ ...sectionForm, title: text }),
                  )}
                  {renderTextInput(
                    'Content',
                    sectionForm.contentText,
                    text =>
                      setSectionForm({ ...sectionForm, contentText: text }),
                    { multiline: true },
                  )}
                  <View style={styles.actionsRow}>
                    {renderActionButton(
                      'Save Section',
                      () => createSection(guide.GuideId),
                      'primary',
                      actionKey === `section-${guide.GuideId}`,
                    )}
                    {renderActionButton(
                      'Cancel',
                      () => setActiveGuideForm(null),
                      'muted',
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  {renderActionButton(
                    '+ Add Text Content',
                    () => {
                      setActiveGuideForm(guide.GuideId);
                      setSectionForm(emptySectionForm);
                    },
                    'muted',
                  )}
                </View>
              )}
            </View>
          ))}
    </>
  );

  const renderCurrentTab = () => {
    if (activeTab === 'approvals') return renderApprovals();
    if (activeTab === 'species') return renderAllSpecies();
    if (activeTab === 'farms') return renderFarms();
    if (activeTab === 'marketplace') return renderMarketplace();
    if (activeTab === 'diseases') return renderDiseases();
    if (activeTab === 'tickets') return renderTickets();
    if (activeTab === 'announcements') return renderAnnouncements();
    if (activeTab === 'rules') return renderRules();
    if (activeTab === 'knowledge') return renderKnowledge();
    if (activeTab === 'users') return renderUsers();
    return null;
  };

  const ActiveIcon = activeTabMeta.icon;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <ShieldCheck size={26} color="#FFFFFF" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>System Admin</Text>
          <Text style={styles.headerSubtitle}>Global Control Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={19} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabs}
        >
          {ADMIN_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Icon size={16} color={active ? '#92400E' : '#64748B'} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {tab.key === 'approvals' && pendingSpecies.length > 0 ? (
                  <View style={styles.tabCount}>
                    <Text style={styles.tabCountText}>
                      {pendingSpecies.length}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageTitleRow}>
          <View style={styles.pageIcon}>
            <ActiveIcon size={20} color="#D97706" />
          </View>
          <View>
            <Text style={styles.pageTitle}>{activeTabMeta.label}</Text>
            <Text style={styles.pageSubtitle}>
              Admin operations synced with web app
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{pendingSpecies.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalApproved}</Text>
            <Text style={styles.statLabel}>Live Species</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{usersList.length || '-'}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
        </View>

        {renderCurrentTab()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#B45309',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabs: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabButtonActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#92400E',
  },
  tabCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 24,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pageIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pageTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  pageSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  statValue: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    paddingVertical: 36,
    marginBottom: 12,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    alignItems: 'center',
    padding: 26,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  emptySubtitle: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 15,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  cardSubTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
  },
  liveBadge: {
    backgroundColor: '#DCFCE7',
  },
  badgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  fieldRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingVertical: 8,
  },
  fieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  fieldValue: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: {
    backgroundColor: '#EF4444',
  },
  mutedButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  disabledButton: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  mutedButtonText: {
    color: '#334155',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 15,
    marginBottom: 12,
  },
  formTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  formHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  mixRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  mixRowTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  compatibilityNote: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  compatibilityWarning: {
    color: '#B91C1C',
  },
  removeMixButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  removeMixButtonText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
  },
  formGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#111827',
    backgroundColor: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inlineForm: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 10,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 10,
  },
  sectionHeading: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  ruleTabBar: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  ruleTabScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  ruleTabs: {
    gap: 8,
    alignItems: 'center',
  },
  ruleTab: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ruleTabActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  ruleTabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '900',
  },
  ruleTabTextActive: {
    color: '#1D4ED8',
  },
});
