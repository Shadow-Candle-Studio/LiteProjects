import { _decorator, Component, Node, Vec3, ParticleSystem2D } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 龙卷风特效控制脚本（挂在 Tornado.prefab 根节点上）：
 * - 释放位置：release() 或直接 node.setPosition()
 * - 整体缩放：release() 的 scale 参数或直接 node.setScale()。
 *   所有粒子系统（Body 下各层级的 Core/Edge 环）都采用 RELATIVE 模式，
 *   节点缩放会同时缩放粒子的轨道半径与大小，因此无需逐项修改粒子参数。
 * - 3D 斜视立体感：Body 节点 Y 方向压扁(scale.y≈0.72)做 45° 透视，
 *   并在不同高度堆叠多个椭圆环。
 * - release() 后会按组件 duration 自动播放，最后 0.5 秒停止发射，
 *   等待存活粒子自然淡出后销毁自身（用法同 ArmHit 特效）。
 */
@ccclass('Tornado')
export class Tornado extends Component {
    /** 释放后持续时长（秒），超过后停止发射并淡出销毁 */
    @property({ tooltip: '释放后持续时长（秒）' })
    public duration: number = 3;

    /** 节点下所有 ParticleSystem2D（各层级 Core/Edge 环） */
    private _systems: ParticleSystem2D[] = [];

    private _elapsed: number = 0;
    private _playDuration: number = -1;
    private _playing: boolean = false;
    private _fadeStarted: boolean = false;

    onLoad(): void {
        this._systems = this.getComponentsInChildren(ParticleSystem2D);
    }

    /**
     * 在指定位置以指定缩放释放龙卷风并开始播放。
     * @param pos      释放位置（相对父节点坐标系；挂到场景根/桌面节点后传入世界坐标即可）
     * @param scale    整体缩放倍数，>0，默认 1
     * @param duration 持续时长（秒）；缺省或 <=0 时用组件上的 duration
     */
    public release(pos: Vec3, scale: number = 1, duration?: number): void {
        this.node.setPosition(pos);
        this.node.setScale(scale, scale, 1);
        this.play(duration);
    }

    /**
     * 在当前节点位置/缩放下开始播放（重复调用会重置粒子）。
     * @param duration 持续时长（秒）；缺省或 <=0 时用组件上的 duration
     */
    public play(duration?: number): void {
        this._playDuration = duration !== undefined && duration > 0 ? duration : this.duration;
        this._elapsed = 0;
        this._fadeStarted = false;
        this._playing = true;
        for (const ps of this._systems) ps.resetSystem();
    }

    /** 立即停止发射（存活粒子仍会淡出） */
    public stop(): void {
        this._playing = false;
        for (const ps of this._systems) ps.stopSystem();
    }

    update(dt: number): void {
        if (!this._playing) return;
        // -1 表示持续播放、不自动销毁（由外部控制 stop/destroy）
        if (this._playDuration <= 0) return;

        this._elapsed += dt;

        // 最后 0.5 秒停止发射，让存活粒子自然淡出
        if (!this._fadeStarted && this._elapsed >= this._playDuration - 0.5) {
            this._fadeStarted = true;
            for (const ps of this._systems) ps.stopSystem();
        }

        // 粒子最长寿命约 1 秒，停止发射后再等 1 秒确保全部淡出后才销毁
        if (this._elapsed >= this._playDuration + 1) {
            this._playing = false;
            this.node.destroy();
        }
    }
}
