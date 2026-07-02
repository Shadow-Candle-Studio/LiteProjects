import { _decorator, Component, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RoundManager')
export class RoundManager extends Component {
    // 生成coin初始位置，随机分布在不重叠的圆形范围内
    public newRound(tableRadius: number, coinRadius: number, coinCount: number): Vec3[] {
        const positions: Vec3[] = [];
        const minDist = coinRadius * 2;          // 两枚硬币中心之间的最小距离（不重叠）
        const maxAttempts = coinCount * 50;       // 每枚硬币最多尝试次数，防止死循环
        let attempts = 0;

        while (positions.length < coinCount && attempts < maxAttempts) {
            attempts++;

            // 在圆形范围内均匀随机采样（缩进一个 coinRadius 确保不越界）
            const spawnRadius = Math.max(0, tableRadius - coinRadius);
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * spawnRadius;
            const x = r * Math.cos(angle);
            const y = r * Math.sin(angle);

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

        // 如果未能生成足够数量的硬币，输出警告
        if (positions.length < coinCount) {
            console.warn(
                `[RoundManager] 无法生成 ${coinCount} 枚硬币（已有 ${positions.length} 枚），` +
                `tableRadius=${tableRadius}, coinRadius=${coinRadius} 可能过小`
            );
        }

        return positions;
    }
}


