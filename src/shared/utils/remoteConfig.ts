import { fetchAndActivate, getBoolean, getString } from 'firebase/remote-config';
import { initRemoteConfig } from '@/shared/lib/firebase';

export const RemoteConfigKeys = {
  MAINTENANCE_MODE: 'maintenance_mode',
  MIN_SUPPORTED_VERSION: 'min_supported_version',
} as const;

let initialized = false;

async function ensureInitialized() {
  if (initialized) return true;
  const rc = initRemoteConfig();
  if (!rc) return false;
  
  try {
    await fetchAndActivate(rc);
    initialized = true;
    return true;
  } catch (error) {
    console.warn('Failed to fetch remote config', error);
    return false;
  }
}

export async function isMaintenanceMode(): Promise<boolean> {
  await ensureInitialized();
  const rc = initRemoteConfig();
  if (!rc) return false;
  return getBoolean(rc, RemoteConfigKeys.MAINTENANCE_MODE);
}

export async function getMinimumSupportedVersion(): Promise<string> {
  await ensureInitialized();
  const rc = initRemoteConfig();
  if (!rc) return '1.0.0'; // Default fallback
  return getString(rc, RemoteConfigKeys.MIN_SUPPORTED_VERSION);
}

export async function isFeatureEnabled(flag: string): Promise<boolean> {
  await ensureInitialized();
  const rc = initRemoteConfig();
  if (!rc) return false;
  return getBoolean(rc, flag);
}

export async function isExperimentalFeatureEnabled(feature: string): Promise<boolean> {
  await ensureInitialized();
  const rc = initRemoteConfig();
  if (!rc) return false;
  return getBoolean(rc, `exp_${feature}`);
}
