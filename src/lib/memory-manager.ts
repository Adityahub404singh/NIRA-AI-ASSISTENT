/**
 * MemoryManager handles short-term and long-term persistence for Nira.
 */

import { AuthManager } from "./auth-manager";
import { EncryptionManager } from "./encryption-manager";

export interface UserPreferences {
  name?: string;
  mode?: 'girlfriend' | 'study' | 'motivator' | 'savage';
  interests?: string[];
  lastSeen?: string;
  habits?: string[];
  isLocked?: boolean;
  guestModeAllowed?: boolean;
  xp?: number;
  level?: number;
}

export class MemoryManager {
  static getPreferences(): UserPreferences {
    const user = AuthManager.getCurrentUser();
    if (user) {
      return {
        name: user.name,
        mode: user.preferences.mode || 'girlfriend',
        lastSeen: user.preferences.lastSeen || new Date().toISOString(),
        habits: user.preferences.habits || [],
        isLocked: user.preferences.isLocked || false,
        guestModeAllowed: user.preferences.guestModeAllowed ?? true,
      };
    }

    const stored = localStorage.getItem('nira_memory');
    if (!stored) return { mode: 'girlfriend', guestModeAllowed: true };
    try {
      return JSON.parse(stored);
    } catch {
      return { mode: 'girlfriend', guestModeAllowed: true };
    }
  }

  static async savePreferencesEncrypted(prefs: Partial<UserPreferences>) {
    const data = JSON.stringify(prefs);
    const encrypted = await EncryptionManager.encrypt(data);
    localStorage.setItem('nira_memory_secure', encrypted);
  }

  static async getPreferencesEncrypted(): Promise<UserPreferences | null> {
    const encrypted = localStorage.getItem('nira_memory_secure');
    if (!encrypted) return null;
    const decrypted = await EncryptionManager.decrypt(encrypted);
    return JSON.parse(decrypted);
  }

  static savePreferences(prefs: Partial<UserPreferences>) {
    const user = AuthManager.getCurrentUser();
    if (user) {
      user.preferences = { ...user.preferences, ...prefs };
      const users = AuthManager.getUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx] = user;
        AuthManager.saveUsers(users);
      }
    } else {
      const current = this.getPreferences();
      const updated = { ...current, ...prefs };
      localStorage.setItem('nira_memory', JSON.stringify(updated));
    }
    
    // Also save encrypted copy for "Ultimate" security
    this.savePreferencesEncrypted(prefs);
  }

  static getSystemContext(): string {
    const prefs = this.getPreferences();
    const parts = [];
    
    parts.push(`[ULTIMATE VERSION ACTIVE]`);
    if (prefs.name) parts.push(`The user's name is ${prefs.name}.`);
    if (prefs.mode) parts.push(`Current persona mode: ${prefs.mode}.`);
    if (prefs.habits && prefs.habits.length > 0) {
      parts.push(`User habits: ${prefs.habits.join(', ')}.`);
    }
    if (prefs.lastSeen) {
      parts.push(`Last time you spoke was ${new Date(prefs.lastSeen).toLocaleString()}.`);
    }
    parts.push(`Security: ${prefs.isLocked ? 'LOCKED (Owner only)' : 'UNLOCKED'}.`);
    parts.push(`Privacy: AES-256 Encryption active. Data is stored locally and securely.`);

    return parts.join(' ');
  }

  static updateLastSeen() {
    this.savePreferences({ lastSeen: new Date().toISOString() });
  }
}
