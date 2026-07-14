import { VoicePrint, VoiceIdentityEngine } from "./voice-identity-engine";

export interface UserProfile {
  id: string;
  name: string;
  voicePrint?: VoicePrint;
  preferences: any;
  isOwner: boolean;
}

export class AuthManager {
  private static STORAGE_KEY = 'nira_users';
  private static CURRENT_USER_KEY = 'nira_current_user';

  static getUsers(): UserProfile[] {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  static saveUsers(users: UserProfile[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  }

  static getCurrentUser(): UserProfile | null {
    const id = localStorage.getItem(this.CURRENT_USER_KEY);
    if (!id) return null;
    return this.getUsers().find(u => u.id === id) || null;
  }

  static login(userId: string) {
    localStorage.setItem(this.CURRENT_USER_KEY, userId);
  }

  static logout() {
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }

  static register(name: string, isOwner: boolean = false): UserProfile {
    const users = this.getUsers();
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      name,
      preferences: {},
      isOwner
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }

  static updateVoicePrint(userId: string, voicePrint: VoicePrint) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users[index].voicePrint = voicePrint;
      this.saveUsers(users);
    }
  }
}
