import { _decorator, Component, Node, Animation, AnimationComponent, Vec2, Vec3, RigidBody2D, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Bomb')
export class Bomb extends Component {
    /** 爆炸推力半径 */
    public pushRadius: number = 200;
    /** 爆炸推力大小 */
    public pushForce: number = 500;
    /** 硬币父节点（用于遍历） */
    public coinGroup: Node | null = null;

    private _played = false;

    start() {
        const anim = this.node.getComponent(AnimationComponent);
        if (anim) {
            anim.on(AnimationComponent.EventType.FINISHED, () => {
                if (this.node.isValid) this.node.destroy();
            });
        }
    }

    /** 落地后由 _flyBomb 调用，播放爆炸动画 */
    public play() {
        if (this._played) return;
        this._played = true;
        const anim = this.node.getComponent(AnimationComponent);
        if (anim) {
            anim.play();
        }

        // 延迟 1 秒后释放推力
        tween(this.node).delay(1).call(() => {
            this._applyExplosion();
        }).start();
    }

    /** 爆炸时对范围内硬币施加径向推力 */
    private _applyExplosion(): void {
        if (!this.coinGroup) return;
        const bombPos = this.node.worldPosition;
        const r2 = this.pushRadius * this.pushRadius;

        for (const coin of this.coinGroup.children) {
            const rb = coin.getComponent(RigidBody2D);
            if (!rb) continue;
            const coinPos = coin.worldPosition;
            const dx = coinPos.x - bombPos.x;
            const dy = coinPos.y - bombPos.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 > r2 || dist2 < 0.001) continue;

            // 距离越近推力越大（线性衰减）
            const dist = Math.sqrt(dist2);
            const strength = 1 - dist / this.pushRadius;
            const nx = dx / dist;
            const ny = dy / dist;
            rb.applyLinearImpulseToCenter(
                new Vec2(nx * this.pushForce * strength, ny * this.pushForce * strength),
                true,
            );
        }
    }
}
