import * as SecureStore from 'expo-secure-store';

// "Stay logged in" for Hive-key accounts.
//
// The encrypted key in SecureStore (see secure-key.ts) is the long-term vault,
// unlocked by PIN/biometric. To keep users signed in across app launches — and,
// crucially, when the app is cold-started from the Home Screen widget — we also
// cache the *active* decrypted session here, in the iOS Keychain, for SESSION_TTL_MS.
//
// Tradeoff: the posting key lives decrypted in the Keychain (device-only, never
// synced to iCloud, only readable after the device's first unlock). The posting
// key is low-privilege — it can post/vote/comment/follow but cannot move funds
// or change account keys — so this matches the standard "keep me logged in" UX.
// PIN/biometric still gates the very first login and re-login after expiry.
//
// Userbase (email) sessions persist separately via userbase/session-store.ts.

const ACTIVE_SESSION_KEY = 'active_session_v1';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PersistedSession {
  username: string;
  decryptedKey: string;
  loginTime: number;
}

const STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function saveActiveSession(s: PersistedSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACTIVE_SESSION_KEY, JSON.stringify(s), STORE_OPTS);
  } catch (error) {
    console.error('Error saving active session:', error);
  }
}

// Returns the cached session if present and still within the TTL; otherwise
// clears it and returns null.
export async function loadActiveSession(): Promise<PersistedSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedSession;
    if (!s?.username || !s?.decryptedKey || !s?.loginTime) {
      await clearActiveSession();
      return null;
    }
    if (Date.now() - s.loginTime > SESSION_TTL_MS) {
      await clearActiveSession();
      return null;
    }
    return s;
  } catch (error) {
    console.error('Error loading active session:', error);
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACTIVE_SESSION_KEY);
  } catch {
    // best-effort
  }
}
