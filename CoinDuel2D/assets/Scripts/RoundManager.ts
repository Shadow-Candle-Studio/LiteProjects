import { _decorator, Component, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RoundManager')
export class RoundManager extends Component {
    /**
     * 在矩形桌面内生成不重叠的硬币初始位置（避开围墙区域）
     * @param tableWidth   桌面宽度
     * @param tableHeight  桌面高度
     * @param coinRadius   硬币半径
     * @param coinCount    需要生成的硬币数量
     * @param wallThickness 围墙厚度
     */
    public newRound(
        tableWidth: number,
        tableHeight: number,
        coinRadius: number,
        coinCount: number,
        wallThickness: number = 0,
    ): Vec3[] {
        const positions: Vec3[] = [];
        const minDist = coinRadius * 2;               // 两枚硬币中心之间的最小距离（不重叠）
        const margin = coinRadius + wallThickness;     // 离桌面边缘的间距（含围墙厚度）
        const maxAttempts = coinCount * 100;
        let attempts = 0;

        // 桌面矩形边界（缩进 wallThickness + coinRadius）
        const left   = -tableWidth / 2  + margin;
        const right  =  tableWidth / 2  - margin;
        const bottom = -tableHeight / 2 + margin;
        const top   =   tableHeight / 2 - margin;

        while (positions.length < coinCount && attempts < maxAttempts) {
            attempts++;

            const x = Math.random() * (right - left) + left;
            const y = Math.random() * (top - bottom) + bottom;

            // 检查是否与已放置的硬币重叠
            let overlap = false;
            for (const pos of positions) {
                const dx = x - pos.x;
                const dy = y - pos.y;
                if (dx * dx + dy * dy < minDist * minDist) {
                    overlap = true;
                    break;
                }
            }

            if (!overlap) {
                positions.push(new Vec3(x, y, 0));
            }
        }

        if (positions.length < coinCount) {
            console.warn(
                `[RoundManager] 无法生成 ${coinCount} 枚硬币（已有 ${positions.length} 枚），` +
                `桌面 ${tableWidth}x${tableHeight} 可能过小`
            );
        }

        return positions;
    }

    /**
     * 为天梯模式生成随机道具位置（障碍物/陷阱/炸弹硬币）
     * - 与硬币、围墙、已放置道具保持不重叠
     * - 放不下时跳过（不报错）
     */
    public generateRandomProps(
        tableWidth: number,
        tableHeight: number,
        wallThickness: number,
        coinRadius: number,
        coinPositions: Vec3[],
        level: number,
    ): { type: 'blocker' | 'mud' | 'bomb'; x: number; y: number; radius: number }[] {
        // 难度曲线：第 1 关 3 个，每关 +1
        const itemCount = level + 2;
        if (itemCount <= 0) return [];

        // 种类解锁：blocker >= 1, mud >= 2, bomb >= 3
        const pool: ('blocker' | 'mud' | 'bomb')[] = [];
        if (level >= 1) pool.push('blocker');
        if (level >= 2) pool.push('mud');
        if (level >= 3) pool.push('bomb');
        if (pool.length === 0) return [];

        // 物品类型对应的半径
        const radiusMap = { blocker: 32, mud: 64, bomb: coinRadius };

        // 已占用位置：硬币 + 已放置道具（用 {x, y, r} 表示碰撞圆）
        const occupied: { x: number; y: number; r: number }[] = [];
        for (const pos of coinPositions) {
            occupied.push({ x: pos.x, y: pos.y, r: coinRadius });
        }

        const GAP = 8; // 物品之间、物品与硬币之间的最小间隙
        const margin = wallThickness + GAP;
        const halfW = tableWidth / 2;
        const halfH = tableHeight / 2;
        const maxAttempts = 100;

        const result: { type: 'blocker' | 'mud' | 'bomb'; x: number; y: number; radius: number }[] = [];

        for (let i = 0; i < itemCount; i++) {
            // 随机选类型
            const type = pool[Math.floor(Math.random() * pool.length)];
            const r = radiusMap[type];

            // 尝试找一个不重叠的位置
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = (Math.random() * 2 - 1) * (halfW - margin - r);
                const y = (Math.random() * 2 - 1) * (halfH - margin - r);

                // 检查与所有已占用位置是否重叠
                let overlap = false;
                for (const occ of occupied) {
                    const dx = x - occ.x;
                    const dy = y - occ.y;
                    const minDist = r + occ.r + GAP;
                    if (dx * dx + dy * dy < minDist * minDist) {
                        overlap = true;
                        break;
                    }
                }

                if (!overlap) {
                    occupied.push({ x, y, r });
                    result.push({ type, x, y, radius: r });
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                console.log(`[RoundManager] 第 ${i + 1} 个道具（${type}）放置失败，跳过`);
            }
        }

        return result;
    }
}
