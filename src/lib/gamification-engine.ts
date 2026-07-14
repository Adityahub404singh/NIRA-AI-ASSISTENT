/**
 * GamificationEngine handles XP, levels, and streaks for Nira.
 */

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastActive: number;
  rewards: string[];
}

export class GamificationEngine {
  private static XP_PER_INTERACTION = 10;
  private static XP_PER_LEVEL = 1000;

  static getStats(): UserStats {
    const data = localStorage.getItem('nira_stats');
    if (data) return JSON.parse(data);
    return {
      xp: 0,
      level: 1,
      streak: 0,
      lastActive: Date.now(),
      rewards: []
    };
  }

  static addXP(amount: number = this.XP_PER_INTERACTION): { leveledUp: boolean, newStats: UserStats } {
    const stats = this.getStats();
    stats.xp += amount;
    
    let leveledUp = false;
    if (stats.xp >= stats.level * this.XP_PER_LEVEL) {
      stats.level += 1;
      leveledUp = true;
    }
    
    this.updateStreak(stats);
    localStorage.setItem('nira_stats', JSON.stringify(stats));
    return { leveledUp, newStats: stats };
  }

  private static updateStreak(stats: UserStats) {
    const now = Date.now();
    const diff = now - stats.lastActive;
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay * 2) {
      if (diff > oneDay) {
        stats.streak += 1;
      }
    } else {
      stats.streak = 1;
    }
    stats.lastActive = now;
  }
}
