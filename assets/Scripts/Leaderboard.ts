import { sys } from 'cc';

const STORAGE_KEY = 'coin_duel_leaderboard';
const MAX_ENTRIES = 20;

export interface LeaderboardEntry {
    score: number;
    time: number;     // Unix 时间戳（毫秒）
    duration: number; // 游戏时长（秒）
}

export class Leaderboard {
    /**
     * 添加一条记录（按分数降序排列，保留前 MAX_ENTRIES 条）
     * @param score   最终分数
     * @param duration 游戏时长（秒）
     */
    public static addEntry(score: number, duration: number): void {
        const entries = this.getEntries();
        entries.push({ score, time: Date.now(), duration });
        entries.sort((a, b) => b.score - a.score || a.duration - b.duration);
        const trimmed = entries.slice(0, MAX_ENTRIES);
        sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }

    /**
     * 获取所有记录（已按分数降序排列）
     */
    public static getEntries(): LeaderboardEntry[] {
        const raw = sys.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            return JSON.parse(raw) as LeaderboardEntry[];
        } catch {
            return [];
        }
    }

    /**
     * 清空排行榜
     */
    public static clear(): void {
        sys.localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * 调试接口：从控制台输出排行榜
     */
    public static debugPrint(): void {
        const entries = this.getEntries();
        if (entries.length === 0) {
            console.log('[Leaderboard] （空）');
            return;
        }
        console.log('===== 排行榜 =====');
        entries.forEach((e, i) => {
            const date = new Date(e.time);
            const dateStr = `${date.getFullYear()}-${_pad(date.getMonth()+1)}-${_pad(date.getDate())}`;
            const min = Math.floor(e.duration / 60);
            const sec = e.duration % 60;
            const timeStr = `${_pad(min)}:${_pad(sec)}`;
            console.log(`  #${i+1}  ${_pad(e.score, 4)}分  ${timeStr}  ${dateStr}`);
        });
        console.log('==================');
    }

}

function _pad(n: number, width: number = 2): string {
    let s = '' + n;
    while (s.length < width) s = ' ' + s;
    return s;
}
