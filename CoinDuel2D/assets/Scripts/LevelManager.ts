import { LevelData } from './LevelData';

/**
 * 跨场景传递关卡数据的静态管理器
 */
export class LevelManager {
    private static _current: LevelData | null = null;
    /** levels.json 中的文件列表 */
    private static _levelFiles: string[] = [];
    /** 当前关卡在 _levelFiles 中的索引 */
    private static _levelIndex: number = -1;

    static setCurrent(data: LevelData): void {
        LevelManager._current = data;
    }

    static getCurrent(): LevelData | null {
        return LevelManager._current;
    }

    /** 设置关卡文件列表和当前索引（由 LevelsScene 调用） */
    static setLevelList(files: string[], index: number): void {
        LevelManager._levelFiles = files;
        LevelManager._levelIndex = index;
    }

    static getLevelFiles(): string[] {
        return LevelManager._levelFiles;
    }

    static getLevelIndex(): number {
        return LevelManager._levelIndex;
    }

    /** 是否还有下一关 */
    static hasNextLevel(): boolean {
        return LevelManager._levelIndex >= 0
            && LevelManager._levelIndex < LevelManager._levelFiles.length - 1;
    }

    static clear(): void {
        LevelManager._current = null;
        LevelManager._levelFiles = [];
        LevelManager._levelIndex = -1;
    }
}
