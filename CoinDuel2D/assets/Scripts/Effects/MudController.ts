import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, CircleCollider2D } from 'cc';
const { ccclass } = _decorator;

/**
 * 泥潭物理控制器
 * - Kinematic 刚体 + 传感器碰撞体，不与硬币产生物理碰撞
 * - 维护速度并在每帧衰减，用于炸弹推开等效果
 * - 手动墙壁边界限制
 */
@ccclass('MudController')
export class MudController extends Component {

    /** 桌面尺寸（用于墙壁边界限制） */
    public tableWidth: number = 1280;
    public tableHeight: number = 720;
    public wallThickness: number = 64;
    /** 泥潭半径 */
    public mudRadius: number = 64;

    private _rb: RigidBody2D | null = null;

    /** 当前速度（像素/秒） */
    private _vx: number = 0;
    private _vy: number = 0;

    /** 速度衰减系数（每帧乘以此值，越小衰减越快） */
    private readonly _dampingFactor: number = 0.92;

    /** 速度低于此阈值时归零 */
    private readonly _speedThreshold: number = 5;

    onLoad() {
        this._rb = this.node.getComponent(RigidBody2D);
    }

    update(_dt: number) {
        if (!this._rb) return;

        // 衰减速度
        this._vx *= this._dampingFactor;
        this._vy *= this._dampingFactor;

        // 速度过小时归零
        const speed2 = this._vx * this._vx + this._vy * this._vy;
        if (speed2 < this._speedThreshold * this._speedThreshold) {
            this._vx = 0;
            this._vy = 0;
            this._rb.linearVelocity = new Vec2(0, 0);
            return;
        }

        this._rb.linearVelocity = new Vec2(this._vx, this._vy);

        // 墙壁边界限制
        this._clampToWall();
    }

    /** 限制泥潭在桌面边界内 */
    private _clampToWall(): void {
        const halfW = this.tableWidth / 2 - this.wallThickness - this.mudRadius;
        const halfH = this.tableHeight / 2 - this.wallThickness - this.mudRadius;
        const pos = this.node.position;
        let clamped = false;
        let nx = pos.x;
        let ny = pos.y;

        if (nx < -halfW) { nx = -halfW; this._vx = Math.abs(this._vx) * 0.5; clamped = true; }
        else if (nx > halfW) { nx = halfW; this._vx = -Math.abs(this._vx) * 0.5; clamped = true; }

        if (ny < -halfH) { ny = -halfH; this._vy = Math.abs(this._vy) * 0.5; clamped = true; }
        else if (ny > halfH) { ny = halfH; this._vy = -Math.abs(this._vy) * 0.5; clamped = true; }

        if (clamped) {
            this.node.setPosition(nx, ny, 0);
        }
    }

    /** 设置速度（像素/秒） */
    public setVelocity(vx: number, vy: number): void {
        this._vx = vx;
        this._vy = vy;
    }

    /** 停止移动 */
    public stop(): void {
        this._vx = 0;
        this._vy = 0;
        if (this._rb) {
            this._rb.linearVelocity = new Vec2(0, 0);
        }
    }

    onDestroy() {
        this._rb = null;
    }
}
