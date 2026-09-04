/** 关卡配置数据接口（对应 LevelEditor 导出的 JSON 格式） */
export interface LevelCoinData {
    /** 硬币类型（对应 config.json 中 coins 的 key） */
    class: number;
    x: number;
    y: number;
}

export interface LevelBlockData {
    x: number;
    y: number;
    shape: string;
    radius: number;
    /** 移动路径（可选），每帧沿路径循环移动 */
    path?: { x: number; y: number }[];
}

export interface LevelMudData {
    x: number;
    y: number;
    shape: string;
    radius: number;
    friction: number;
}

export interface LevelData {
    id: number;
    width: number;
    height: number;
    wall: { thickness: number };
    coins: LevelCoinData[];
    blocks: LevelBlockData[];
    muds: LevelMudData[];
}
