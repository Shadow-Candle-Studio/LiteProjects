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
}
