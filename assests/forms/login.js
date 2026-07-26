import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Fish, Lock, Mail, Shield, ShoppingCart } from 'lucide-react-native';
import { clearSession, farmApi, setSession } from '../integration/farmApi';

const ROLE_THEMES = {
  farmer: {
    icon: Fish,
    title: 'Fish Farming Guide',
    subtitle: 'Smart Fish Farming Management',
    cardTitle: 'Welcome Back',
    cardSubtitle: 'Log in to continue',
    background: '#E0F2FE',
    logoBg: '#2563EB',
    titleColor: '#334155',
    subtitleColor: '#64748B',
    cardBg: '#FFFFFF',
    buttonBg: '#2563EB',
    linkColor: '#2563EB',
    switchLinks: [
      { label: 'Login as Admin', role: 'admin', icon: Shield },
      { label: 'Login as Consumer', role: 'consumer', icon: ShoppingCart },
    ],
  },
  admin: {
    icon: Shield,
    title: 'Fish Farming Guide',
    subtitle: 'Manage Platform & Operations',
    cardTitle: 'Admin Portal',
    cardSubtitle: 'Log in to continue',
    background: '#0F172A',
    logoBg: '#475569',
    titleColor: '#FFFFFF',
    subtitleColor: '#CBD5E1',
    cardBg: '#1E293B',
    buttonBg: '#475569',
    linkColor: '#93C5FD',
    switchLinks: [
      { label: 'Login as Farmer', role: 'farmer', icon: Fish },
      { label: 'Login as Consumer', role: 'consumer', icon: ShoppingCart },
    ],
  },
  consumer: {
    icon: ShoppingCart,
    title: 'Fish Farming Guide',
    subtitle: 'Buy Fresh Fish & Seafood',
    cardTitle: 'Consumer Marketplace',
    cardSubtitle: 'Log in to continue',
    background: '#D1FAE5',
    logoBg: '#059669',
    titleColor: '#064E3B',
    subtitleColor: '#047857',
    cardBg: '#FFFFFF',
    buttonBg: '#059669',
    linkColor: '#059669',
    switchLinks: [
      { label: 'Login as Farmer', role: 'farmer', icon: Fish },
      { label: 'Login as Admin', role: 'admin', icon: Shield },
    ],
  },
};

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeRole, setActiveRole] = useState('farmer');

  const theme = ROLE_THEMES[activeRole];
  const IconComponent = theme.icon;
  const isAdmin = activeRole === 'admin';

  const clearRejectedLogin = message => {
    clearSession();
    setError(message);
    setLoading(false);
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const data = await farmApi.login(email.trim(), password);

      if (data?.success) {
        const role = data.user?.role;

        if (activeRole === 'admin' && role !== 'admin') {
          clearRejectedLogin('This account is not authorized for Admin access.');
          return;
        }

        if (activeRole === 'consumer' && role !== 'Consumer') {
          clearRejectedLogin(
            'This account is not a Consumer account. Please use Farmer login.',
          );
          return;
        }

        if (
          activeRole === 'farmer' &&
          (role === 'admin' || role === 'Consumer')
        ) {
          clearRejectedLogin(
            `This is a ${role} account. Please use the correct portal.`,
          );
          return;
        }

        setSession({ token: data.token, user: data.user });

        const destination =
          role === 'admin'
            ? 'Admin'
            : role === 'Consumer'
            ? 'Marketplace'
            : 'Dashboard';

        navigation.reset({
          index: 0,
          routes: [
            {
              name: destination,
              ...(destination === 'Dashboard' ? { params: { firstLogin: true } } : {}),
            },
          ],
        });
      } else {
        setError(data?.error || 'Invalid email or password');
      }
    } catch (err) {
      setError(
        err.message || 'Cannot connect to server. Check if backend is running.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.logoWrap}>
        <View style={[styles.logo, { backgroundColor: theme.logoBg }]}>
          <IconComponent size={34} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        <Text style={[styles.appTitle, { color: theme.titleColor }]}>
          {theme.title}
        </Text>
        <Text style={[styles.appSubtitle, { color: theme.subtitleColor }]}>
          {theme.subtitle}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          isAdmin && styles.adminCard,
          { backgroundColor: theme.cardBg },
        ]}
      >
        <Text style={[styles.title, isAdmin && styles.adminTitle]}>
          {theme.cardTitle}
        </Text>
        <Text style={[styles.subtitle, isAdmin && styles.adminSubtitle]}>
          {theme.cardSubtitle}
        </Text>

        <Text style={[styles.label, isAdmin && styles.adminLabel]}>
          Email Address
        </Text>
        <View style={[styles.inputWrap, isAdmin && styles.adminInputWrap]}>
          <Mail size={19} color={isAdmin ? '#CBD5E1' : '#6B7280'} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={isAdmin ? '#94A3B8' : '#9CA3AF'}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, isAdmin && styles.adminInput]}
          />
        </View>

        <Text style={[styles.label, isAdmin && styles.adminLabel]}>
          Password
        </Text>
        <View style={[styles.inputWrap, isAdmin && styles.adminInputWrap]}>
          <Lock size={19} color={isAdmin ? '#CBD5E1' : '#6B7280'} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={isAdmin ? '#94A3B8' : '#9CA3AF'}
            secureTextEntry
            style={[styles.input, isAdmin && styles.adminInput]}
          />
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.buttonBg }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={[styles.footerText, isAdmin && styles.adminFooterText]}>
            New to Fish Farming Guide?{' '}
            <Text style={[styles.link, { color: theme.linkColor }]}>
              Create Account
            </Text>
          </Text>
        </TouchableOpacity>

        <View style={[styles.switchWrap, isAdmin && styles.adminSwitchWrap]}>
          {theme.switchLinks.map(link => {
            const SwitchIcon = link.icon;

            return (
              <TouchableOpacity
                key={link.role}
                style={styles.switchButton}
                onPress={() => {
                  setActiveRole(link.role);
                  setError('');
                }}
              >
                <SwitchIcon size={16} color={isAdmin ? '#CBD5E1' : '#64748B'} />
                <Text
                  style={[
                    styles.switchText,
                    isAdmin && styles.adminSwitchText,
                  ]}
                >
                  {link.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 34,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  appTitle: {
    color: '#334155',
    fontSize: 17,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  appSubtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  adminCard: {
    borderColor: '#334155',
  },
  title: {
    color: '#1F2937',
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  adminTitle: {
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 24,
  },
  adminSubtitle: {
    color: '#CBD5E1',
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
  },
  adminLabel: {
    color: '#E2E8F0',
  },
  inputWrap: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  adminInputWrap: {
    backgroundColor: '#334155',
    borderColor: '#475569',
  },
  input: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    marginLeft: 10,
  },
  adminInput: {
    color: '#FFFFFF',
  },
  error: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    color: '#DC2626',
    textAlign: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 14,
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    height: 50,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  footerText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 24,
    fontSize: 14,
  },
  adminFooterText: {
    color: '#CBD5E1',
  },
  link: {
    color: '#2563EB',
    fontWeight: '900',
  },
  switchWrap: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 20,
    paddingTop: 16,
    gap: 10,
    alignItems: 'center',
  },
  adminSwitchWrap: {
    borderTopColor: '#475569',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '800',
  },
  adminSwitchText: {
    color: '#CBD5E1',
  },
});
