import { resources, JsonAsset } from 'cc';

/** GameLogic 相关配置 */
export interface GameLogicConfig {
    coinRadius: number;
    speedThreshold: number;
    velocityFactor: number;
    coinDamping: number;
    mudDamping: number;
    bombPushRadius: number;
    bombPushForce: number;
    aimLineFactor: number;
    idleShowDelay: number;
}

/** TableController 相关配置 */
export interface TableControllerConfig {
    wallThickness: number;
    gapWidth: number;
    gapWidthIncrement: number;
}

/** HitEffectManager 相关配置 */
export interface HitEffectManagerConfig {
    enableDragZoom: boolean;
    enableDragPrediction: boolean;
    enableLaunchEffect: boolean;
    enableSlowMotion: boolean;
    enableLaunchTracking: boolean;
    enableHitPause: boolean;
    enableHitShake: boolean;
    enableHitParticle: boolean;
    enableHitSubCamera: boolean;
    enableHitTracking: boolean;
    enableKnockOut: boolean;
    enableTornado: boolean;
    cameraZoomInDuration: number;
    cameraZoomOutDuration: number;
    launchAnimSpeed: number;
    hitPauseDuration: number;
    cameraTrackDuration: number;
    subCameraOrthoHeight: number;
    subViewWidth: number;
    subViewHeight: number;
    subViewDuration: number;
}

/** 完整配置结构 */
export interface GameConfig {
    gameLogic: GameLogicConfig;
    tableController: TableControllerConfig;
    hitEffectManager: HitEffectManagerConfig;
}

/**
 * 配置管理器 — 从 game_config.json 加载游戏参数
 */
export class ConfigManager {
    private static _config: GameConfig | null = null;

    /** 加载配置文件 */
    static load(callback: (err: Error | null) => void): void {
        resources.load('config', JsonAsset, (err, asset) => {
            if (err) {
                console.warn('[ConfigManager] 加载 config.json 失败:', err);
                callback(err);
                return;
            }
            ConfigManager._config = asset.json as GameConfig;
            console.log('[ConfigManager] 配置加载完成');
            callback(null);
        });
    }

    /** 获取完整配置 */
    static getConfig(): GameConfig | null {
        return ConfigManager._config;
    }

    /** 获取 GameLogic 配置 */
    static getGameLogicConfig(): GameLogicConfig | null {
        return ConfigManager._config?.gameLogic ?? null;
    }

    /** 获取 TableController 配置 */
    static getTableControllerConfig(): TableControllerConfig | null {
        return ConfigManager._config?.tableController ?? null;
    }

    /** 获取 HitEffectManager 配置 */
    static getHitEffectManagerConfig(): HitEffectManagerConfig | null {
        return ConfigManager._config?.hitEffectManager ?? null;
    }
}
