import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';

import AES from 'crypto-js/aes';
import PBKDF2 from 'crypto-js/pbkdf2';
import * as CryptoJS from 'crypto-js';

export type EncryptionMethod = 'biometric' | 'pin';

export type KdfHasher = 'SHA1' | 'SHA256';

/** Key-derivation parameters recorded per stored key so they can evolve safely. */
export interface KdfParams {
  iterations: number;
  hasher: KdfHasher;
}

// Params used before KDF versioning existed. Keys stored without a `kdf` field
// were derived with these — keep them so existing users can still unlock.
export const LEGACY_KDF: KdfParams = { iterations: 5000, hasher: 'SHA1' };

// Params for newly stored / re-encrypted keys.
//
// IMPORTANT: crypto-js runs PBKDF2 synchronously in pure JS, and on Hermes
// (the on-device engine) it is ~20-30x slower than Node. 100k iterations froze
// the JS thread for tens of seconds and made PIN login appear to hang, so we
// keep the cost at the original level here. Raising the work factor safely
// requires a NATIVE PBKDF2 (e.g. react-native-quick-crypto / a tiny native
// module) — expo-crypto has no iterated KDF. The versioning scaffold below
// (params travel with each key via `EncryptedKey.kdf`, old keys re-encrypt
// lazily) means CURRENT_KDF can be bumped to strong native params later without
// locking anyone out.
export const CURRENT_KDF: KdfParams = { iterations: 5000, hasher: 'SHA1' };

export interface EncryptedKey {
  username: string;
  encrypted: string;
  method: EncryptionMethod;
  salt: string;
  iv: string;
  createdAt: number;
  /** KDF used for this key (PIN method). Absent ⇒ legacy params (LEGACY_KDF). */
  kdf?: KdfParams;
}

// Generate a random salt
export async function generateSalt(length = 16): Promise<string> {
  try {
    const bytes = await Crypto.getRandomBytesAsync(length);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (err) {
    if (__DEV__) {
      console.warn('Native crypto not available, using insecure fallback (DEV ONLY)');
      let salt = '';
      for (let i = 0; i < length; i++) {
        salt += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
      }
      return salt;
    }
    throw new Error('Secure random generation failed. Cannot store keys safely.');
  }
}
// Derive a key from PIN using PBKDF2.
// keySize is in 32-bit words, so 256 bits = 8 words.
// `params` MUST match what the stored key was encrypted with — callers pass the
// stored key's `kdf` (or LEGACY_KDF for pre-versioning keys) on decrypt, and
// CURRENT_KDF on first encrypt. Defaults to LEGACY for safety if omitted.
export function deriveKeyFromPin(
  pin: string,
  salt: string,
  params: KdfParams = LEGACY_KDF
): string {
  const hasher = params.hasher === 'SHA256' ? CryptoJS.algo.SHA256 : CryptoJS.algo.SHA1;
  return PBKDF2(pin, salt, { keySize: 8, iterations: params.iterations, hasher }).toString();
}

// Encrypt the private key with AES 
export function encryptKey(
  key: string,
  secret: string,
  iv: string
): string {
  try {
    return AES.encrypt(key, secret, { iv: CryptoJS.enc.Hex.parse(iv) }).toString();
  } catch (error) {
    // Fail closed — never store a key in a weaker form. The previous base64
    // fallback effectively stored the key in plaintext next to its secret.
    throw new Error('Encryption failed. Cannot store keys safely.');
  }
}

// Decrypt the private key with AES.
export function decryptKey(
  encrypted: string,
  secret: string,
  iv: string
): string {
  try {
    const bytes = AES.decrypt(encrypted, secret, { iv: CryptoJS.enc.Hex.parse(iv) });
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (decrypted) return decrypted;
  } catch (e) {
    console.warn('AES decryption failed');
  }
  // Fail closed — no base64 fallback (it accepted a near-plaintext blob whose
  // "secret" sat beside the ciphertext). An empty result makes the caller drop
  // the stored credentials and prompt a fresh login, which is the safe outcome.
  return '';
}


// Validate and sanitize username for SecureStore key
function sanitizeUsername(username: string): string {
  // Trim whitespace
  const trimmed = username.trim();
  // Only allow alphanumeric, ".", "-", and "_"
  const valid = /^[a-zA-Z0-9._-]+$/.test(trimmed);
  if (!trimmed || !valid) {
    throw new Error('Invalid username for SecureStore. Must be non-empty and contain only alphanumeric characters, ".", "-", and "_".');
  }
  return trimmed;
}

// Store encrypted key in SecureStore
export async function storeEncryptedKey(
  username: string,
  encryptedKey: EncryptedKey
) {
  const safeUsername = sanitizeUsername(username);
  const key = `userkey_${safeUsername}`;
  const value = JSON.stringify(encryptedKey);
  // ...existing code...
  await SecureStore.setItemAsync(key, value);
}

// Retrieve encrypted key from SecureStore
export async function getEncryptedKey(username: string): Promise<EncryptedKey | null> {
  const safeUsername = sanitizeUsername(username);
  const data = await SecureStore.getItemAsync(`userkey_${safeUsername}`);
  return data ? JSON.parse(data) : null;
}

// Delete encrypted key from SecureStore
export async function deleteEncryptedKey(username: string) {
  const safeUsername = sanitizeUsername(username);
  await SecureStore.deleteItemAsync(`userkey_${safeUsername}`);
}

// Biometric authentication
export async function authenticateBiometric(): Promise<boolean> {
  try {
    // Check if biometric authentication is available
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    
    if (!hasHardware) {
      return false;
    }
    
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!isEnrolled) {
      return false;
    }
    
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to unlock your key',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    
    return result.success;
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return false;
  }
}

// Check if device has biometric or device PIN/passcode available
export async function hasDeviceAuthentication(): Promise<{
  hasBiometric: boolean;
  hasDevicePin: boolean;
  biometricTypes: LocalAuthentication.AuthenticationType[];
}> {
  try {
    // Check if hardware is available
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    
    // Check if biometric is enrolled
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    // Get available authentication types
    const authTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    // Check if device has a device lock (passcode/PIN)
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    
    // In simulator or development, if biometric setup seems problematic, fallback to PIN
    if (__DEV__ && (!hasHardware || !isEnrolled || authTypes.length === 0)) {
      return {
        hasBiometric: false,
        hasDevicePin: false,
        biometricTypes: [],
      };
    }
    
    return {
      hasBiometric: hasHardware && isEnrolled && authTypes.length > 0,
      hasDevicePin: securityLevel >= LocalAuthentication.SecurityLevel.SECRET,
      biometricTypes: authTypes,
    };
  } catch (error) {
    console.error('Error checking device authentication:', error);
    // On any error in development, fallback to PIN
    if (__DEV__) {
      return {
        hasBiometric: false,
        hasDevicePin: false,
        biometricTypes: [],
      };
    }
    
    // In production, still try biometric as fallback
    return {
      hasBiometric: true,
      hasDevicePin: false,
      biometricTypes: [],
    };
  }
}
