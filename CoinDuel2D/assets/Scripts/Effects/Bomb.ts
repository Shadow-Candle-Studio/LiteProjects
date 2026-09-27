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
    /** 场上道具列表（爆炸时销毁范围内的障碍物） */
    public props: Node[] | null = null;

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

    /** 爆炸时对范围内硬币施加径向推力，并销毁范围内的障碍物 */
    private _applyExplosion(): void {
        const bombPos = this.node.worldPosition;
        const r2 = this.pushRadius * this.pushRadius;

        // 对范围内硬币施加推力
        if (this.coinGroup) {
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

        // 销毁范围内的障碍物（Blocker），陷阱（Mud）不受影响
        if (this.props) {
            for (let i = this.props.length - 1; i >= 0; i--) {
                const prop = this.props[i];
                if (!prop || !prop.isValid) continue;
                if (prop.name !== 'Blocker') continue;
                const propPos = prop.worldPosition;
                const dx = propPos.x - bombPos.x;
                const dy = propPos.y - bombPos.y;
                if (dx * dx + dy * dy > r2) continue;
                prop.destroy();
                this.props.splice(i, 1);
            }
        }
    }
}
