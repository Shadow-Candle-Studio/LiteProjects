import { _decorator, Component, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RoundManager')
export class RoundManager extends Component {
    /**
     * 在矩形桌面（排除缺口区域）内生成不重叠的硬币初始位置
     * @param tableWidth  桌面宽度
     * @param tableHeight 桌面高度
     * @param coinRadius  硬币半径
     * @param coinCount   需要生成的硬币数量
     * @param gapPosition 缺口中心位置
     * @param gapWidth    缺口宽度
     * @param gapHeight   缺口高度
     */
    public newRound(
        tableWidth: number,
        tableHeight: number,
        coinRadius: number,
        coinCount: number,
        gapPosition: Vec3,
        gapWidth: number,
        gapHeight: number,
    ): Vec3[] {
        const positions: Vec3[] = [];
        const minDist = coinRadius * 2;               // 两枚硬币中心之间的最小距离（不重叠）
        const margin = coinRadius;                     // 离桌面边缘/缺口边缘的间距
        const maxAttempts = coinCount * 100;
        let attempts = 0;

        // 桌面矩形边界（缩进一个 coinRadius）
        const left   = -tableWidth / 2  + margin;
        const right  =  tableWidth / 2  - margin;
        const bottom = -tableHeight / 2 + margin;
        const top   =   tableHeight / 2 - margin;

        // 缺口矩形边界（向外扩一个 coinRadius，作为禁入区）
        const gapLeft   = gapPosition.x - gapWidth  / 2 - margin;
        const gapRight  = gapPosition.x + gapWidth  / 2 + margin;
        const gapBottom = gapPosition.y - gapHeight / 2 - margin;
        const gapTop    = gapPosition.y + gapHeight / 2 + margin;

        /** 检查点 (x,y) 是否在缺口禁入区内 */
        const inGap = (x: number, y: number): boolean =>
            x >= gapLeft && x <= gapRight && y >= gapBottom && y <= gapTop;

        while (positions.length < coinCount && attempts < maxAttempts) {
            attempts++;

            const x = Math.random() * (right - left) + left;
            const y = Math.random() * (top - bottom) + bottom;

            // 跳过落在缺口禁入区的位置
            if (inGap(x, y)) continue;

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
                `桌面 ${tableWidth}x${tableHeight} 缺口 ${gapWidth}x${gapHeight} 可能过小`
            );
        }

        return positions;
    }
}
