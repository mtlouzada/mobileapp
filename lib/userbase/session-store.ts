import * as SecureStore from "expo-secure-store";
import type { UserbaseUser } from "./api";

// Persists the userbase bearer session on-device. This is the ONLY auth secret
// the device holds for email accounts — no Hive posting key (server-custody).

const TOKEN_KEY = "userbase_session_token";
const USER_KEY = "userbase_session_user";

export interface UserbaseSession {
  token: string;
  user: UserbaseUser;
}

export async function saveUserbaseSession(token: string, user: UserbaseUser): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadUserbaseSession(): Promise<UserbaseSession | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userRaw = await SecureStore.getItemAsync(USER_KEY);
    if (!token || !userRaw) return null;
    return { token, user: JSON.parse(userRaw) as UserbaseUser };
  } catch {
    return null;
  }
}

export async function clearUserbaseSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
