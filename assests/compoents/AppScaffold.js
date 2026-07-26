import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BarChart3,
  BookOpen,
  Calendar,
  DollarSign,
  Droplets,
  Fish,
  FlaskConical,
  Home,
  LogOut,
  Map,
  Menu,
  Package,
  ShieldCheck,
  Store,
  Utensils,
} from 'lucide-react-native';
import { clearSession, getSession } from '../integration/farmApi';
import { isTourCompleted, markTourCompleted } from '../utils/tourStorage';
import TourGuide from './TourGuide';
import tourSteps from '../config/tourSteps';

const menuItems = [
  { label: 'Dashboard', route: 'Dashboard', icon: Home, roles: ['user'] },
  { label: 'Admin Panel', route: 'Admin', icon: ShieldCheck, roles: ['admin'] },
  {
    label: 'Farm Planner',
    route: 'FarmPlanner',
    icon: Calendar,
    roles: ['user'],
  },
  { label: 'Stock', route: 'StockManagement', icon: Package, roles: ['user'] },
  { label: 'Fish Species', route: 'FishSpecies', icon: Fish, roles: ['user'] },
  { label: 'Feeding', route: 'FeedGuide', icon: Utensils, roles: ['user'] },
  {
    label: 'Fertilization',
    route: 'Fertilization',
    icon: FlaskConical,
    roles: ['user'],
  },
  { label: 'Water', route: 'WaterQuality', icon: Droplets, roles: ['user'] },
  { label: 'Budget', route: 'BudgetE', icon: DollarSign, roles: ['user'] },
  { label: 'Farm Reports', route: 'Reports', icon: BarChart3, roles: ['user'] },
  { label: 'Information', route: 'Info', icon: BookOpen, roles: ['user'] },
  {
    label: 'Marketplace',
    route: 'Marketplace',
    icon: Store,
    roles: ['Consumer'],
  },
];

const routeHeaderIcons = {
  Dashboard: Home,
  Admin: ShieldCheck,
  FarmPlanner: Calendar,
  StockManagement: Package,
  FishSpecies: Fish,
  FeedGuide: Utensils,
  Fertilization: FlaskConical,
  WaterQuality: Droplets,
  BudgetE: DollarSign,
  Reports: BarChart3,
  Info: BookOpen,
  Marketplace: Store,
};

export function AppScaffold({
  title,
  subtitle,
  navigation,
  currentRoute,
  headerIcon: HeaderIconProp,
  children,
  scroll = true,
  startTourOnMount = false,
}) {
  const user = getSession().user;
  const userId = user?.id;
  const role = user?.role || 'user';
  const isFarmer = role === 'user';
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [showTour, setShowTour] = React.useState(false);
  const [tourCompleted, setTourCompleted] = React.useState(false);
  const autoTourStartedRef = React.useRef(false);
  const filteredItems = menuItems.filter(item => item.roles.includes(role));
  const Content = scroll ? ScrollView : View;

  const currentTourSteps = React.useMemo(() => {
    const routeSteps = tourSteps[currentRoute];
    if (routeSteps?.length) {
      return routeSteps;
    }
    if (isFarmer && tourSteps.Dashboard?.length) {
      return tourSteps.Dashboard;
    }
    return [];
  }, [currentRoute, isFarmer]);

  React.useEffect(() => {
    autoTourStartedRef.current = false;
  }, [userId]);

  React.useEffect(() => {
    let cancelled = false;
    let timer;

    const syncTourState = async () => {
      const completed = await isTourCompleted(userId);
      if (cancelled) {
        return;
      }

      setTourCompleted(completed);

      const shouldAutoStart =
        isFarmer &&
        startTourOnMount &&
        !completed &&
        !autoTourStartedRef.current &&
        currentTourSteps.length > 0;

      if (shouldAutoStart) {
        autoTourStartedRef.current = true;
        timer = setTimeout(() => {
          if (!cancelled) {
            setShowTour(true);
          }
        }, 600);
      }
    };

    syncTourState();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [startTourOnMount, isFarmer, userId, currentTourSteps.length]);

  const canShowTourInMenu = isFarmer && currentTourSteps.length > 0;

  const handleTourComplete = async () => {
    setShowTour(false);
    await markTourCompleted(userId);
    setTourCompleted(true);
  };

  const handleTourSkip = async () => {
    setShowTour(false);
    await markTourCompleted(userId);
    setTourCompleted(true);
  };

  const startTour = () => {
    setDrawerOpen(false);
    setTimeout(() => setShowTour(true), 400);
  };

  const logout = () => {
    clearSession();
    setDrawerOpen(false);
    navigation?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handleMenuNavigate = route => {
    setDrawerOpen(false);
    navigation?.navigate(route);
  };

  const HeaderIcon = HeaderIconProp || routeHeaderIcons[currentRoute] || Fish;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.menuToggle}
          onPress={() => setDrawerOpen(prev => !prev)}
        >
          <Menu size={18} color="#1D4ED8" />
        </TouchableOpacity>
        <View style={styles.brandRow}>
          <View
            style={[styles.brandIcon, role === 'admin' && styles.adminIcon]}
          >
            {role === 'admin' ? (
              <ShieldCheck size={22} color="#FFFFFF" />
            ) : (
              <Fish size={22} color="#FFFFFF" />
            )}
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandTitle}>
              {role === 'admin' ? 'Administrator' : 'Fish Farming Guide'}
            </Text>
            <Text style={styles.brandSubtitle}>
              {user?.name || user?.email || 'Smart farm management'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {drawerOpen && (
        <View style={styles.drawerRoot} pointerEvents="box-none">
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setDrawerOpen(false)}
          />
          <View style={styles.drawerPanel}>
            <Text style={styles.drawerTitle}>Navigation</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.drawerMenu}
            >
              {filteredItems.map(item => {
                const Icon = item.icon;
                const active = currentRoute === item.route;
                return (
                  <TouchableOpacity
                    key={item.route}
                    style={[
                      styles.drawerItem,
                      active && styles.drawerItemActive,
                    ]}
                    onPress={() => handleMenuNavigate(item.route)}
                  >
                    <Icon size={18} color={active ? '#1D4ED8' : '#6B7280'} />
                    <Text
                      style={[
                        styles.drawerText,
                        active && styles.drawerTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Divider */}
              <View style={styles.drawerDivider} />

              {/* App tour — always available from menu for farmers */}
              {canShowTourInMenu && (
                <TouchableOpacity
                  style={styles.drawerTourItem}
                  onPress={startTour}
                >
                  <Map size={18} color="#2563EB" />
                  <Text style={styles.drawerTourText}>
                    {tourCompleted ? 'Replay App Tour' : 'Start App Tour'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      <Content
        style={styles.content}
        contentContainerStyle={scroll ? styles.contentInner : undefined}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageIcon}>
            <HeaderIcon size={18} color="#2563EB" />
          </View>
          <View style={styles.pageCopy}>
            <Text style={styles.pageTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        {children}
      </Content>

      {/* Tour Guide overlay */}
      <TourGuide
        steps={currentTourSteps}
        visible={showTour}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
      />
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({ label, value, accent = '#2563EB' }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </Card>
  );
}

export function EmptyState({ title, text }) {
  return (
    <Card style={styles.emptyState}>
      <Fish size={36} color="#9CA3AF" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!text && <Text style={styles.emptyText}>{text}</Text>}
    </Card>
  );
}

export function PrimaryButton({ title, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, disabled && styles.disabledButton, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Tag({ children, color = '#EFF6FF', textColor = '#2563EB' }) {
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text style={[styles.tagText, { color: textColor }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuToggle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    marginRight: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  adminIcon: {
    backgroundColor: '#B45309',
  },
  brandTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  drawerRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
  },
  drawerPanel: {
    width: '78%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 24,
  },
  drawerTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
  },
  drawerMenu: {
    gap: 8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  drawerItemActive: {
    backgroundColor: '#DBEAFE',
  },
  drawerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },
  drawerTextActive: {
    color: '#1D4ED8',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  drawerTourItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  drawerTourText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 32,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  pageIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pageCopy: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  pageSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 3,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  tag: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
