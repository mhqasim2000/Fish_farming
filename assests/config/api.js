import { NativeModules, Platform } from 'react-native';

const DEVICE_LAN_HOST = ' 192.168.1.13';
const getDevServerHost = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;

  if (!scriptURL || typeof scriptURL !== 'string') {
    return null;
  }

  const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?/i);
  return match?.[1] || null;
};

const getManualOverrideHost = () => {
  if (typeof global !== 'undefined' && global.__FISH_FARM_API_HOST__) {
    return global.__FISH_FARM_API_HOST__;
  }

  return null;
};

const getCandidateHosts = () => {
  const hosts = [];

  const pushHost = host => {
    if (host && !hosts.includes(host)) {
      hosts.push(host);
    }
  };

  pushHost(getManualOverrideHost());
  pushHost(DEVICE_LAN_HOST);

  if (Platform.OS === 'android') {
    pushHost(' 192.168.1.13');
  }

  pushHost(getDevServerHost());
  pushHost('localhost');
  pushHost(' 192.168.1.13');

  return hosts.map(host => String(host).trim()).filter(Boolean);
};

export const getApiBaseUrls = () =>
  getCandidateHosts().map(host => `http://${host}:5000/api`);

const BASE_URL = getApiBaseUrls()[0] || 'http:// 192.168.1.13:5000/api';

export default BASE_URL;
