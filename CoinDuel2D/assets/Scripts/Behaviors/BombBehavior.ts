import { _decorator, Color, ERigidBody2DType, Node, RigidBody2D, Vec2 } from 'cc';
import type { GameLogic } from '../GameLogic';
import { BombCoinMarker } from '../BombCoinMarker';
import { BehaviorBase, BehaviorMode } from './BehaviorBase';
import { BehaviorRegistry } from './BehaviorRegistry';
import { BehaviorVisual, BehaviorVisualConfig } from './BehaviorVisual';

const { ccclass, property } = _decorator;

/**
 * 炸彈（主動）。
 * 被其他硬幣撞到時爆炸：對範圍內的其他硬幣施加向外的推力，越近推力越大。
 * 優先級 90，高於閃身步（80），確保被撞到時一定引爆。
 */
@ccclass('BombBehavior')
export class BombBehavior extends BehaviorBase {
    public priority = 100;
    public mode: BehaviorMode = 'dominant';
    public exclusive = true;

    @property({ tooltip: '爆炸推力範圍（像素，從硬幣中心算起）' })
    public range = 60;

    @property({ tooltip: '爆炸推力大小' })
    public force = 60;

    /** 同一次撞擊可能回報多次接觸，短時間內只炸一次。 */
    private static readonly COOLDOWN_MS = 250;
    private _cooldownUntil = 0;

    protected start(): void {
        BehaviorVisual.startIdle(this.node, this.getVisualConfig());
    }

    public getVisualConfig(): BehaviorVisualConfig {
        return {
            color: new Color(255, 90, 60, 255),
            label: 'BOOM!',
            idlePulse: true,
        };
    }

    public tryFire(self: Node, other: Node, gl: GameLogic): boolean {
        if (Date.now() < this._cooldownUntil) return false;
        // 只有被硬幣撞到才引爆，撞牆不算
        if (!other.getComponent('CoinController') && !other.getComponent(BombCoinMarker)) {
            return false;
        }

        this._explode(self, gl);
        this._cooldownUntil = Date.now() + BombBehavior.COOLDOWN_MS;
        this._fireVisual(self);
        return true;
    }

    /** 對範圍內的動態硬幣施加徑向衝量，距離越近推力越大。 */
    private _explode(self: Node, gl: GameLogic): void {
        const coins = gl.coinGroup?.children;
        if (!coins || coins.length === 0) return;

        const center = self.worldPosition;

        for (const coin of coins) {
            if (coin === self) continue;

            const rb = coin.getComponent(RigidBody2D);
            if (!rb || rb.type !== ERigidBody2DType.Dynamic) continue;

            const pos = coin.worldPosition;
            const dx = pos.x - center.x;
            const dy = pos.y - center.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 距離從硬幣中心算起，越近推力越大
            if (dist > this.range) continue;

            // 完全重疊時方向無從計算，固定往右推
            const nx = dist > 0.001 ? dx / dist : 1;
            const ny = dist > 0.001 ? dy / dist : 0;
            const strength = 1 - dist / Math.max(this.range, 0.0001);
            if (strength <= 0) continue;

            const impulse = this.force * strength;
            rb.applyLinearImpulseToCenter(new Vec2(nx * impulse, ny * impulse), true);
        }
    }
}

BehaviorRegistry.register('BombBehavior', BombBehavior);
