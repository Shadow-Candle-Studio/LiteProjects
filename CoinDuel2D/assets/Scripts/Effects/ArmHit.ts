import { _decorator, Component, Node, Vec3, RigidBody2D, ERigidBody2DType, UITransform, Color, tween } from 'cc';
import { CoinController } from '../CoinController';
const { ccclass } = _decorator;

/**
 * 被打飞特效：
 * 挂在 effect_arm_hit 根节点上（作为被撞硬币 B 的子节点）。
 * play() 后，子节点 arm 绕 B 中心转动一圈；当臂指向目标硬币 A 的方向时，
 * 关闭 A 的物理并让它逐渐透明后删除（体现被打飞消失效果）。
 * 旋转与淡出都完成后销毁自身并触发回调。
 */
@ccclass('ArmHit')
export class ArmHit extends Component {
    /** 手臂转动一圈的时长（秒） */
    public duration: number = 0.8;
    /** 目标硬币被打飞后逐渐透明淡出的时长（秒） */
    public flyDuration: number = 0.5;

    private _target: Node | null = null;
    private _arm: Node | null = null;
    private _targetAngle: number = 0;
    private _elapsed: number = 0;
    private _knocked: boolean = false;
    private _rotDone: boolean = false;
    private _flightDone: boolean = false;
    private _finished: boolean = false;
    private _onComplete: (() => void) | null = null;

    /**
     * 开始播放打飞特效
     * @param target       被打击飞的目标硬币（A）
     * @param onComplete   特效完全结束（旋转 + 淡出）后的回调
     * @param flyDuration  淡出时长（秒），缺省用组件默认值
     */
    public play(target: Node, onComplete?: () => void, flyDuration?: number): void {
        this._target = target;
        this._onComplete = onComplete ?? null;
        if (flyDuration !== undefined) this.flyDuration = flyDuration;

        this._arm = this.node.getChildByName('arm');
        if (!this._arm) {
            // 没有可旋转的手臂，直接收尾
            this._rotDone = true;
            this._flightDone = true;
            this._tryFinish();
            return;
        }

        // 目标方向：从父节点（B 硬币）指向 A 硬币
        const parent = this.node.parent;
        const dx = target.position.x - parent.position.x;
        const dy = target.position.y - parent.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // arm 的指向是本地 -Y 方向，旋转角 θ 时世界方向为 (sinθ, -cosθ)，
        // 令其等于 A 方向 (dx,dy)/|...|，解得 θ = atan2(dx, -dy)
        this._targetAngle = Math.atan2(dx, -dy) * 180 / Math.PI;

        // 按 A/B 距离拉伸 arm，使其尖部够到 A 硬币：
        // 尖部到支点(B中心)的距离 = anchorY * height * scaleY
        const ut = this._arm.getComponent(UITransform);
        if (ut && ut.height > 0.001 && ut.anchorY > 0.001) {
            const reachScale = dist / (ut.anchorY * ut.height);
            // x/y 按相同比例拉伸（保持 arm 宽高比）
            this._arm.setScale(reachScale, reachScale, 1);
        }

        // 从目标角对面开始，转动一圈（360°）；中点（t=0.5）时臂正好与 A 重合
        this._arm.eulerAngles = new Vec3(0, 0, this._targetAngle + 180);

        this._elapsed = 0;
        this._knocked = false;
        this._rotDone = false;
        this._flightDone = false;
        this._finished = false;
    }

    update(dt: number): void {
        if (!this._target || !this._arm) return;

        if (!this._target.isValid) {
            // 目标已不存在，直接收尾
            this._rotDone = true;
            this._flightDone = true;
            this._tryFinish();
            return;
        }

        this._elapsed += dt;
        const t = Math.min(1, this._elapsed / this.duration);
        // 顺时针挥动：角度递减；中点（t=0.5）时 arm 正好指向 A
        const angle = this._targetAngle + 180 - t * 360;
        this._arm.eulerAngles = new Vec3(0, 0, angle);

        // 臂指向 A 时，关闭 A 物理并打飞出界
        if (!this._knocked && t >= 0.5) {
            this._knocked = true;
            this._knockOutTarget();
        }

        if (t >= 1) {
            this._rotDone = true;
            this._tryFinish();
        }
    }

    /** 关闭目标硬币物理并让它逐渐透明后删除 */
    private _knockOutTarget(): void {
        const target = this._target!;

        // 关闭物理（只保留视觉，位置保持不变）
        const rb = target.getComponent(RigidBody2D);
        if (rb) rb.type = ERigidBody2DType.Static;

        // 标记为"正在被打飞"，避免被 checkCoinFalls 误判为掉进缺口
        const ctrl = target.getComponent(CoinController);
        if (ctrl) ctrl.isKnockingOut = true;

        // 逐渐透明 → 最后删除
        const dur = Math.max(0.05, this.flyDuration);
        const sprite = CoinController.getCoinSprite(target);
        if (sprite) {
            tween(sprite)
                .to(dur, { color: new Color(255, 255, 255, 0) }, { easing: 'quadOut' })
                .call(() => {
                    target.removeFromParent();
                    target.destroy();
                    this._flightDone = true;
                    this._tryFinish();
                })
                .start();
        } else {
            target.removeFromParent();
            target.destroy();
            this._flightDone = true;
            this._tryFinish();
        }
    }

    /** 旋转与飞行都完成（或目标已失效）时，触发一次回调并销毁自身 */
    private _tryFinish(): void {
        if (!this._rotDone || !this._flightDone) return;
        if (this._finished) return;
        this._finished = true;

        if (this._onComplete) {
            const cb = this._onComplete;
            this._onComplete = null;
            cb();
        }
        this.node.destroy();
    }
}
