import BASE_URL, { getApiBaseUrls } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_STORAGE_KEY = '@fishfarm_session';

let session = {
  token: '',
  user: null,
};

let activeBaseUrl = BASE_URL;
let hasHydratedSession = false;

export const setSession = ({ token = '', user = null } = {}) => {
  session = { token, user };
  hasHydratedSession = true;

  AsyncStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ token, user }),
  ).catch(() => {});
};

export const getSession = () => session;

export const clearSession = () => {
  session = { token: '', user: null };
  hasHydratedSession = true;
  AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
};

export const isUnauthorizedError = error => error?.status === 401;

export const getPurchaseRequestStatus = request =>
  String(request?.Status ?? request?.status ?? 'Pending').trim();

export const isPurchaseRequestOpen = request => {
  const status = getPurchaseRequestStatus(request);
  return status === 'Pending' || status === 'Replied';
};

const hydrateSession = async () => {
  if (hasHydratedSession || session.token) {
    return;
  }

  hasHydratedSession = true;

  try {
    const storedSession = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedSession) {
      return;
    }

    const parsedSession = JSON.parse(storedSession);
    session = {
      token: parsedSession?.token || '',
      user: parsedSession?.user || null,
    };
  } catch {
    session = { token: '', user: null };
  }
};

const fetchJson = async (baseUrl, endpoint, options, headers) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const { clearSessionOnUnauthorized, ...fetchOptions } = options;

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    const parseBody = () => {
      if (!text) return null;
      try {
        const data = JSON.parse(text);
        return typeof data === 'string' ? JSON.parse(data) : data;
      } catch {
        return text;
      }
    };

    const body = parseBody();

    if (!response.ok) {
      if (response.status === 401 && clearSessionOnUnauthorized !== false) {
        clearSession();
      }

      const message =
        body?.message ||
        body?.error ||
        (typeof body === 'string' ? body : `API Error: ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchWithAuth = async (endpoint, options = {}) => {
  await hydrateSession();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const baseUrls = [
    activeBaseUrl,
    ...getApiBaseUrls().filter(url => url !== activeBaseUrl),
  ];
  let lastError = null;

  for (const baseUrl of baseUrls) {
    try {
      const result = await fetchJson(baseUrl, endpoint, options, headers);
      activeBaseUrl = baseUrl;
      return result;
    } catch (error) {
      if (typeof error?.status === 'number') {
        throw error;
      }

      lastError = error;
    }
  }

  const attemptedUrls = baseUrls.join(', ');
  if (lastError?.name === 'AbortError') {
    throw new Error(`Request timed out. Tried: ${attemptedUrls}`);
  }

  throw new Error(`Network request failed. Tried: ${attemptedUrls}`);
};

export const farmApi = {
  login: (email, password) =>
    fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: data =>
    fetchWithAuth('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMarketplaceListings: (lat, lng, regionId) => {
    const params = [];
    if (lat && lng) {
      params.push(`lat=${encodeURIComponent(lat)}`);
      params.push(`lng=${encodeURIComponent(lng)}`);
    }
    if (regionId) {
      params.push(`regionId=${encodeURIComponent(regionId)}`);
    }
    const query = params.length ? `?${params.join('&')}` : '';
    return fetchWithAuth(`/marketplace${query}`);
  },
  getMarketplaceRegions: () => fetchWithAuth('/marketplace/regions'),
  getFarmRatings: farmId =>
    fetchWithAuth(`/marketplace/farm/${farmId}/ratings`),
  rateFarm: (farmId, rating, comment) =>
    fetchWithAuth(`/marketplace/farm/${farmId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  getFavorites: () => fetchWithAuth('/marketplace/favorites'),
  toggleFavorite: farmId =>
    fetchWithAuth('/marketplace/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ farmId }),
    }),
  createMarketplaceListing: data =>
    fetchWithAuth('/marketplace', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateListingStatus: (id, status) =>
    fetchWithAuth(`/marketplace/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  createPurchaseRequest: data =>
    fetchWithAuth('/marketplace/purchase-request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getConsumerRequests: () =>
    fetchWithAuth('/marketplace/purchase-requests/consumer'),
  getFarmerRequests: () =>
    fetchWithAuth('/marketplace/purchase-requests/farmer'),
  replyToPurchaseRequest: (requestId, payload) =>
    fetchWithAuth(`/marketplace/purchase-requests/${requestId}/reply`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  denyPurchaseRequest: requestId =>
    fetchWithAuth(`/marketplace/purchase-requests/${requestId}/deny`, {
      method: 'PUT',
    }),
  approvePurchaseRequest: (requestId, payload) =>
    fetchWithAuth(`/marketplace/purchase-requests/${requestId}/approve`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deletePurchaseRequest: requestId =>
    fetchWithAuth(`/marketplace/purchase-requests/${requestId}`, {
      method: 'DELETE',
    }),

  getRegions: () => fetchWithAuth('/regions'),
  getPondTypes: () => fetchWithAuth('/ponds/types'),
  setupFarm: farmData =>
    fetchWithAuth('/farm/setup', {
      method: 'POST',
      body: JSON.stringify(farmData),
    }),
  provisionPond: pondData =>
    fetchWithAuth('/farm/provision-pond', {
      method: 'POST',
      body: JSON.stringify(pondData),
    }),
  calculatePondSpecs: (
    speciesList,
    totalFarmArea,
    stage = 'Nursery',
    cultivationType = 'Extensive',
    pondStructure = 'Earthen Pond',
    pondShape = 'Rectangle',
    pondSize = null,
  ) =>
    fetchWithAuth('/farm/calculate-pond-specs', {
      method: 'POST',
      body: JSON.stringify({
        speciesList,
        totalFarmArea,
        stage,
        cultivationType,
        pondStructure,
        pondShape,
        pondSize,
      }),
    }),
  getFarmDetails: () => fetchWithAuth('/farm/my-farm'),
  resetFarm: () => fetchWithAuth('/farm/reset-farm', { method: 'DELETE' }),
  getFarmPreview: totalArea =>
    fetchWithAuth('/farm/preview', {
      method: 'POST',
      body: JSON.stringify({ totalArea }),
    }),
  updateFarmArea: (totalArea, latitude, longitude) =>
    fetchWithAuth('/farm/update', {
      method: 'PUT',
      body: JSON.stringify({ totalArea, latitude, longitude }),
    }),
  getUpdatePreview: newTotalArea =>
    fetchWithAuth('/farm/update-preview', {
      method: 'POST',
      body: JSON.stringify({ newTotalArea }),
    }),
  getAreaUsage: () => fetchWithAuth('/farm/area-usage'),
  getFarmOverview: params =>
    fetchWithAuth('/farm/overview', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),
  getFarmSummarySheet: () => fetchWithAuth('/farm/summary-sheet'),

  getPonds: () => fetchWithAuth('/ponds'),
  addPond: data =>
    fetchWithAuth('/ponds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePond: (id, data) =>
    fetchWithAuth(`/ponds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getPondOptions: () => fetchWithAuth('/ponds/options'),
  getPondRecommendations: (acres, type) =>
    fetchWithAuth(`/ponds/recommend?acres=${acres}&type=${type}`),
  markPondMaintained: id =>
    fetchWithAuth(`/ponds/${id}/maintain`, { method: 'PUT' }),
  getPondFCR: pondId => fetchWithAuth(`/ponds/${pondId}/fcr`),
  getPondFinancials: pondId => fetchWithAuth(`/ponds/${pondId}/financials`),
  deletePond: id => fetchWithAuth(`/ponds/${id}`, { method: 'DELETE' }),

  getApprovedSpecies: () => fetchWithAuth('/species'),
  getPendingSpecies: () => fetchWithAuth('/species/admin/pending'),
  addCustomSpecies: data =>
    fetchWithAuth('/species/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveSpecies: (id, data) =>
    fetchWithAuth(`/species/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify(data || {}),
    }),
  rejectSpecies: id => fetchWithAuth(`/species/${id}`, { method: 'DELETE' }),
  deleteSpecies: id => fetchWithAuth(`/species/${id}`, { method: 'DELETE' }),
  getRegionalSpecies: province =>
    fetchWithAuth(`/species/regional?province=${encodeURIComponent(province)}`),
  getSpeciesCompatibility: speciesId =>
    fetchWithAuth(`/species/${speciesId}/compatibility`),
  checkBulkCompatibility: speciesIds =>
    fetchWithAuth('/species/compatibility/bulk', {
      method: 'POST',
      body: JSON.stringify({ speciesIds }),
    }),
  checkPondCompatibility: (pondId, speciesId) =>
    fetchWithAuth(`/species/compatibility/pond/${pondId}/${speciesId}`),
  checkPondToPondCompatibility: (sourcePondId, destPondId) =>
    fetchWithAuth(
      `/species/compatibility/pond-to-pond/${sourcePondId}/${destPondId}`,
    ),
  getPolycultureMixes: () => fetchWithAuth('/species/polyculture/mixes'),
  getStockingPreview: (pondId, speciesId, quantity) =>
    fetchWithAuth(
      `/stocking/preview/${pondId}/${speciesId}?quantity=${quantity}`,
    ),
  stockFish: data =>
    fetchWithAuth('/stocking/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStocking: (id, data) =>
    fetchWithAuth(`/stocking/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteStocking: id => fetchWithAuth(`/stocking/${id}`, { method: 'DELETE' }),
  transferStocking: (stockId, toPondId, quantity) =>
    fetchWithAuth('/stocking/transfer', {
      method: 'PUT',
      body: JSON.stringify({ stockId, toPondId, quantity }),
    }),
  transferWholePond: (fromPondId, toPondId) =>
    fetchWithAuth('/stocking/transfer-whole-pond', {
      method: 'PUT',
      body: JSON.stringify({ fromPondId, toPondId }),
    }),
  toggleForSale: (stockId, isForSale, quantityForSale, salePricePerUnit) =>
    fetchWithAuth(`/stocking/sale/${stockId}`, {
      method: 'PUT',
      body: JSON.stringify({ isForSale, quantityForSale, salePricePerUnit }),
    }),
  recordHarvest: data =>
    fetchWithAuth('/harvest/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getHarvestAvailable: pondId => fetchWithAuth(`/harvest/available/${pondId}`),
  getHarvestHistory: pondId => fetchWithAuth(`/harvest/history/${pondId}`),

  getStocking: () => fetchWithAuth('/stocking'),

  recordWaterQuality: data =>
    fetchWithAuth('/water-quality/logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getWaterAlerts: () => fetchWithAuth('/water-quality/alerts/critical'),
  getWaterSummary: () => fetchWithAuth('/water-quality/latest-summary'),

  addExpense: data =>
    fetchWithAuth('/expenses/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteExpense: id => fetchWithAuth(`/expenses/${id}`, { method: 'DELETE' }),
  getExpenseSummary: () => fetchWithAuth('/expenses/summary/all'),
  getBudgetDashboard: () => fetchWithAuth('/expenses/dashboard'),
  getPondExpenses: pondId => fetchWithAuth(`/expenses/${pondId}`),

  getFeedRulesAll: () => fetchWithAuth('/feed/rules/all'),
  getFeedDashboard: () => fetchWithAuth('/feed/dashboard'),
  getFeedTypes: () => fetchWithAuth('/feed/types'),
  getFeedRecommendation: pondId =>
    fetchWithAuth(`/feed/recommendation/${pondId}`),
  getFeedHistory: pondId => fetchWithAuth(`/feed/history/${pondId}`),
  getFeedSchedule: () => fetchWithAuth('/feed/schedule'),
  getGenericFeedingGuidelines: () => fetchWithAuth('/feed/guidelines/generic'),
  logFeed: data =>
    fetchWithAuth('/feed/log', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFertilizerOptions: () => fetchWithAuth('/fertilizers/options'),
  getFertilizerCalculation: (size, type, intensity) =>
    fetchWithAuth(
      `/fertilizers/calculate?size=${size}&type=${type}&intensity=${intensity}`,
    ),
  getFertilizerDashboard: () => fetchWithAuth('/fertilizers/dashboard'),
  getRecentFertilizations: () => fetchWithAuth('/fertilizers/history/all'),
  getFertilizerRecommendation: (pondId, intensity) =>
    fetchWithAuth(`/fertilizers/recommendation/${pondId}/${intensity}`),
  logFertilizer: data =>
    fetchWithAuth('/fertilizers/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getFertilizerHistory: pondId =>
    fetchWithAuth(`/fertilizers/history/${pondId}`),

  getActivityFeed: () => fetchWithAuth('/activity/feed'),
  getFarmReports: (timeframe, startDate, endDate) =>
    fetchWithAuth(
      `/reports?timeframe=${timeframe}${
        startDate ? `&startDate=${startDate}` : ''
      }${endDate ? `&endDate=${endDate}` : ''}`,
    ),
  getROIReport: (timeframe, startDate, endDate) =>
    fetchWithAuth(
      `/reports/roi?timeframe=${timeframe}${
        startDate ? `&startDate=${startDate}` : ''
      }${endDate ? `&endDate=${endDate}` : ''}`,
    ),
  getKnowledgeGuides: () => fetchWithAuth('/info/guides'),
  addKnowledgeGuide: data =>
    fetchWithAuth('/info/guides', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteKnowledgeGuide: id =>
    fetchWithAuth(`/info/guides/${id}`, { method: 'DELETE' }),
  addKnowledgeSection: data =>
    fetchWithAuth('/info/sections', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteKnowledgeSection: id =>
    fetchWithAuth(`/info/sections/${id}`, { method: 'DELETE' }),

  addMortality: data =>
    fetchWithAuth('/mortality/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDiseaseCatalog: () => fetchWithAuth('/diseases/catalog'),
  getOutbreaks: () => fetchWithAuth('/diseases/outbreaks'),
  logOutbreak: data =>
    fetchWithAuth('/diseases/outbreaks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateOutbreak: (id, data) =>
    fetchWithAuth(`/diseases/outbreaks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteOutbreak: id =>
    fetchWithAuth(`/diseases/outbreaks/${id}`, { method: 'DELETE' }),
  logTreatment: data =>
    fetchWithAuth('/diseases/treatments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getOutbreakTreatments: outbreakId =>
    fetchWithAuth(`/diseases/outbreaks/${outbreakId}/treatments`),
  getDiseaseDashboard: () => fetchWithAuth('/diseases/dashboard'),

  getInventorySummary: () => fetchWithAuth('/inventory/dashboard-summary'),
  getInventory: () => fetchWithAuth('/inventory'),
  addInventory: data =>
    fetchWithAuth('/inventory/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateInventory: (id, data) =>
    fetchWithAuth(`/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteInventory: id =>
    fetchWithAuth(`/inventory/${id}`, { method: 'DELETE' }),
  transferInventoryWhole: data =>
    fetchWithAuth('/inventory/transfer-whole-pond', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getFeedStock: () => fetchWithAuth('/inventory/feed/all'),
  addFeedStock: data => {
    const qty = Number(data.quantity_kg ?? data.quantityKg ?? 0);
    const total = Number(data.totalCost ?? data.total ?? 0);
    const costPerKg =
      data.costPerKg !== undefined && data.costPerKg !== null
        ? Number(data.costPerKg)
        : qty > 0
        ? total / qty
        : 0;
    return fetchWithAuth('/inventory/feed/add', {
      method: 'POST',
      body: JSON.stringify({
        feedType: data.feedType,
        quantity_kg: qty,
        costPerKg,
        supplier: data.supplier ?? data.notes ?? 'Farm',
        purchaseDate: data.purchaseDate,
      }),
    });
  },
  updateFeedStock: (id, data) =>
    fetchWithAuth(`/inventory/feed/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        currentQuantity_kg:
          data.currentQuantity_kg ?? data.quantityKg ?? data.currentQuantity,
      }),
    }),
  deleteFeedStock: id =>
    fetchWithAuth(`/inventory/feed/${id}`, { method: 'DELETE' }),
  getInventoryFeedTypes: () => fetchWithAuth('/inventory/feed/types'),

  getFertilizerStock: () => fetchWithAuth('/inventory/fertilizer/all'),
  addFertilizerStock: data => {
    const qty = Number(data.quantity_kg ?? data.quantityKg ?? 0);
    const total = Number(data.totalCost ?? data.total ?? 0);
    const costPerKg =
      data.costPerKg !== undefined && data.costPerKg !== null
        ? Number(data.costPerKg)
        : qty > 0
        ? total / qty
        : 0;
    return fetchWithAuth('/inventory/fertilizer/add', {
      method: 'POST',
      body: JSON.stringify({
        category: data.category,
        productName: data.productName ?? data.product,
        quantity_kg: qty,
        costPerKg,
        supplier: data.supplier ?? data.notes ?? 'Farm',
        purchaseDate: data.purchaseDate,
      }),
    });
  },
  updateFertilizerStock: (id, data) =>
    fetchWithAuth(`/inventory/fertilizer/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        currentQuantity_kg:
          data.currentQuantity_kg ?? data.quantityKg ?? data.currentQuantity,
      }),
    }),
  deleteFertilizerStock: id =>
    fetchWithAuth(`/inventory/fertilizer/${id}`, { method: 'DELETE' }),
  getFertilizerProducts: () => fetchWithAuth('/inventory/fertilizer/products'),

  getTreatmentStock: () => fetchWithAuth('/inventory/treatment/all'),
  getTreatmentTypes: () => fetchWithAuth('/inventory/treatment/types'),
  addTreatmentStock: data =>
    fetchWithAuth('/inventory/treatment/add', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTreatmentStock: (id, data) =>
    fetchWithAuth(`/inventory/treatment/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTreatmentStock: id =>
    fetchWithAuth(`/inventory/treatment/${id}`, { method: 'DELETE' }),

  getPnLSummary: () => fetchWithAuth('/farm/pnl'),
  updateBudget: initialBudget =>
    fetchWithAuth('/farm/update-budget', {
      method: 'POST',
      body: JSON.stringify({ initialBudget }),
    }),

  getAdminUsers: () => fetchWithAuth('/admin/users'),
  getAdminFarms: () => fetchWithAuth('/admin/farms'),
  getAdminMarketplaceListings: () => fetchWithAuth('/admin/marketplace'),
  removeAdminMarketplaceListing: stockId =>
    fetchWithAuth(`/admin/marketplace/${stockId}/remove`, { method: 'PUT' }),
  getAdminPurchaseRequests: () => fetchWithAuth('/admin/purchase-requests'),
  deleteAdminPurchaseRequest: requestId =>
    fetchWithAuth(`/admin/purchase-requests/${requestId}`, {
      method: 'DELETE',
    }),
  getAdminDiseases: () => fetchWithAuth('/admin/diseases'),
  addAdminDisease: data =>
    fetchWithAuth('/admin/diseases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAdminDisease: (id, data) =>
    fetchWithAuth(`/admin/diseases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleAdminDiseaseStatus: id =>
    fetchWithAuth(`/admin/diseases/${id}/toggle`, { method: 'PUT' }),
  getAdminTickets: () => fetchWithAuth('/admin/tickets'),
  replyToTicket: (id, reply) =>
    fetchWithAuth(`/admin/tickets/${id}/reply`, {
      method: 'PUT',
      body: JSON.stringify({ reply }),
    }),
  closeTicket: id =>
    fetchWithAuth(`/admin/tickets/${id}/close`, { method: 'PUT' }),
  getNotifications: () => fetchWithAuth('/notifications'),
  getAdminAnnouncements: () => fetchWithAuth('/admin/announcements'),
  createAdminAnnouncement: data =>
    fetchWithAuth('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAdminAnnouncement: id =>
    fetchWithAuth(`/admin/announcements/${id}`, { method: 'DELETE' }),
  getAdminFeedRules: () => fetchWithAuth('/admin/feed-rules'),
  createFeedRule: data =>
    fetchWithAuth('/admin/feed-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFeedRule: (id, data) =>
    fetchWithAuth(`/admin/feed-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFeedRule: id =>
    fetchWithAuth(`/admin/feed-rules/${id}`, { method: 'DELETE' }),
  getAdminFertilizerRules: () => fetchWithAuth('/admin/fertilizer-rules'),
  createFertilizerRule: data =>
    fetchWithAuth('/admin/fertilizer-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFertilizerRule: (id, data) =>
    fetchWithAuth(`/admin/fertilizer-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFertilizerRule: id =>
    fetchWithAuth(`/admin/fertilizer-rules/${id}`, { method: 'DELETE' }),
  getAdminStockingRules: () => fetchWithAuth('/admin/stocking-rules'),
  createAdminStockingRule: data =>
    fetchWithAuth('/admin/stocking-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAdminStockingRule: (id, data) =>
    fetchWithAuth(`/admin/stocking-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteAdminStockingRule: id =>
    fetchWithAuth(`/admin/stocking-rules/${id}`, { method: 'DELETE' }),
  getAdminCompatibilities: () => fetchWithAuth('/admin/compatibilities'),
  createAdminCompatibility: data =>
    fetchWithAuth('/admin/compatibilities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAdminCompatibility: id =>
    fetchWithAuth(`/admin/compatibilities/${id}`, { method: 'DELETE' }),
  updateAdminSpeciesDensity: (speciesId, maxStockingDensity) =>
    fetchWithAuth(`/admin/species/${speciesId}/stocking-density`, {
      method: 'PUT',
      body: JSON.stringify({ maxStockingDensity }),
    }),
  toggleUserStatus: userId =>
    fetchWithAuth(`/admin/users/${userId}/toggle-status`, { method: 'PUT' }),
  changeUserRole: (userId, role) =>
    fetchWithAuth(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  deleteUser: userId =>
    fetchWithAuth(`/admin/users/${userId}`, { method: 'DELETE' }),
};
