import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, EventTouch, Color, Sprite, CircleCollider2D, SpriteFrame, AudioClip } from 'cc';
import { GameLogic } from './GameLogic';
import { SoundManager } from './SoundManager';
const { ccclass } = _decorator;

@ccclass('CoinController')
export class CoinController extends Component {
    private static _anyDragging: boolean = false;
    private static _lastWorldPos: Vec2 = new Vec2();

    private _allowedOperation: boolean = false;
    private _rigidBody: RigidBody2D | null = null;
    private _isDragging: boolean = false;
    private _dragStartPos: Vec2 = new Vec2();
    private _gameLogic: GameLogic | null = null;
    private _eventRegistered: boolean = false;
    private _indicatorActive: boolean = false;
    private _indicatorTime: number = 0;

    /** 当前硬币类型（coins.json 中的 key，如 "1", "2"） */
    private _coinTypeKey: string = '';
    /** 缓存的自定义碰撞音效 AudioClip */
    private _hitSfxClip: AudioClip | null = null;

    public get allowedOperation(): boolean {
        return this._allowedOperation;
    }

    public set allowedOperation(allowed: boolean) {
        this._allowedOperation = allowed;
    }

    /** 外部注入 GameLogic 引用 */
    public setGameLogic(gl: GameLogic): void {
        this._gameLogic = gl;
    }

    /** 获取缓存的自定义碰撞音效 */
    public get hitSfxClip(): AudioClip | null {
        return this._hitSfxClip;
    }

    /** 获取当前硬币类型 key */
    public get coinTypeKey(): string {
        return this._coinTypeKey;
    }

    /**
     * 切换硬币贴图、碰撞音效和类型标识（资源由 GameScene 预先加载好传入）
     * @param spriteFrame 目标贴图 SpriteFrame，传 null 不改变
     * @param hitSfxClip  目标碰撞音效 AudioClip，传 null 不改变
     * @param typeKey     硬币类型 key（如 "1", "2"）
     */
    public setAppearance(spriteFrame: SpriteFrame | null, hitSfxClip: AudioClip | null, typeKey: string): void {
        this._coinTypeKey = typeKey;

        if (spriteFrame) {
            const sprite = this.node.getComponent(Sprite);
            if (sprite) {
                sprite.spriteFrame = spriteFrame;
            }
        }

        if (hitSfxClip) {
            this._hitSfxClip = hitSfxClip;
        }
    }

    start() {
        this._rigidBody = this.node.getComponent(RigidBody2D);
        if (!this._rigidBody) {
            console.warn('[CoinController] 找不到 RigidBody2D 组件');
            return;
        }

        // 禁止硬币自转（只平移不旋转）
        this._rigidBody.fixedRotation = true;

        // 设置物理属性：质量、摩擦力、弹性
        const collider = this.node.getComponent(CircleCollider2D);
        if (collider) {
            collider.friction = 1;
            collider.restitution = 0.6;
            collider.density = 2 / Math.PI * Math.pow(collider.radius, 2)
        }

        // 节点触摸事件（TOUCH_START/MOVE/END 在同一节点上，Touch 会 capture 后续事件到同一节点）
        this.node.on(Node.EventType.TOUCH_START, this._onPointerDown, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this._onPointerDown, this);
        this._unregisterGlobalEvents();
    }

    public showIndicator(show: boolean): void {
        this._indicatorActive = show;
        this._indicatorTime = 0;

        if (!show) {
            const sprite = this.node.getComponent(Sprite);
            if (sprite) {
                sprite.color = Color.YELLOW;
            }
        }
    }

    update(dt: number) {
        // 拖拽中每帧重绘箭头（兜底：即使冒泡事件偶发卡顿也能持续更新）
        if (this._isDragging) {
            const graphics = this._gameLogic?.dragGraphics;
            if (graphics) {
                this._drawDragLineFromPos(CoinController._lastWorldPos);
            }
            // 不提前 return：拖拽中也可能需要更新 indicator
        }

        if (!this._indicatorActive) return;

        this._indicatorTime += dt;
        // sin 波归一化到 0~1：t=0 → 黄色(255,255,0)，t=1 → 白色(255,255,255)
        const t = (Math.sin(this._indicatorTime * Math.PI * 2) + 1) / 2;
        const sprite = this.node.getComponent(Sprite);
        if (sprite) {
            sprite.color = new Color(255, 255, Math.floor(t * 255));
        }
    }

    private _onPointerDown(event: EventTouch): void {
        if (!this._allowedOperation) return;
        // 已经有硬币在拖拽中，不再响应（防止 Cocos Creator 在鼠标经过其他节点时误触 MOUSE_DOWN）
        if (CoinController._anyDragging) return;

        // 防御：如果之前拖拽未正常结束（如鼠标移出窗口），先清理
        if (this._isDragging) {
            console.warn('[CoinController] 修复残留拖拽状态');
            this._isDragging = false;
            CoinController._anyDragging = false;
            this._unregisterGlobalEvents();
            if (this._rigidBody) {
                this._rigidBody.type = ERigidBody2DType.Dynamic;
                this._rigidBody.gravityScale = 1;
            }
            if (this._gameLogic?.dragGraphics) {
                this._gameLogic.dragGraphics.clear();
            }
        }

        // 复位拖拽距离
        this._gameLogic?.setDragDistance(0);

        this._isDragging = true;
        event.getLocation(this._dragStartPos);
        // 同步更新缓存位置，防止 update() 轮询时读到未初始化的 (0,0)
        event.getLocation(CoinController._lastWorldPos);

        // 冻结物理，防止拖拽期间受物理影响
        if (this._rigidBody) {
            this._rigidBody.type = ERigidBody2DType.Static;
        }

        // 标记全局拖拽锁定（防止其他硬币同时进入拖拽状态）
        CoinController._anyDragging = true;

        // 在当前硬币节点注册 Touch 事件（Cocos Creator 保证 TOUCH_MOVE/END 始终派发给同一节点）
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onPointerUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onPointerUp, this);
        this._eventRegistered = true;
    }

    private _unregisterGlobalEvents(): void {
        if (!this._eventRegistered) return;
        this._eventRegistered = false;
        CoinController._anyDragging = false;

        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onPointerUp, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onPointerUp, this);
    }

    private _onTouchMove(event: EventTouch): void {
        // 持续缓存鼠标位置，供 update 轮询兜底
        event.getLocation(CoinController._lastWorldPos);
        if (!this._isDragging) return;
        // 报告拖拽距离，用于镜头拉近
        if (this._gameLogic) {
            const dx = CoinController._lastWorldPos.x - this._dragStartPos.x;
            const dy = CoinController._lastWorldPos.y - this._dragStartPos.y;
            this._gameLogic.setDragDistance(Math.sqrt(dx * dx + dy * dy));
        }
        this._drawDragLine(event);
    }

    /** 根据鼠标位置绘制拖拽引导线（从 Event 对象读取） */
    private _drawDragLineFromPos(mousePos: Vec2): void {
        const graphics = this._gameLogic?.dragGraphics;
        if (!graphics) return;

        const mid = this.node.position;
        // dragStartPos 是鼠标按下时记录的 screen/UI 坐标
        const dx = mousePos.x - this._dragStartPos.x;
        const dy = mousePos.y - this._dragStartPos.y;

        const tailX = mid.x + dx;
        const tailY = mid.y + dy;
        const headX = mid.x - dx;
        const headY = mid.y - dy;

        graphics.clear();
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(255, 100, 100);
        graphics.moveTo(headX, headY);
        graphics.lineTo(tailX, tailY);
        graphics.stroke();

        const dirX = headX - tailX;
        const dirY = headY - tailY;
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len > 4) {
            const nx = dirX / len;
            const ny = dirY / len;
            const arrowSize = 12;
            const arrowWidth = 6;
            const px = -ny * arrowWidth;
            const py = nx * arrowWidth;
            const baseX = headX - nx * arrowSize;
            const baseY = headY - ny * arrowSize;

            graphics.fillColor = new Color(255, 100, 100);
            graphics.moveTo(headX, headY);
            graphics.lineTo(baseX + px, baseY + py);
            graphics.lineTo(baseX - px, baseY - py);
            graphics.close();
            graphics.fill();
        }
    }

    /** 绘制拖拽引导线：中点 = 硬币位置，尾部 = 拖拽方向延伸 */
    private _drawDragLine(event: EventTouch): void {
        const graphics = this._gameLogic?.dragGraphics;
        if (!graphics) return;

        // 以硬币自身位置为中点
        const mid = this.node.position;
        // 拖拽差值（屏幕像素），映射到世界坐标
        const cur = event.getLocation();
        const dx = cur.x - this._dragStartPos.x;
        const dy = cur.y - this._dragStartPos.y;

        // 尾部 = 中点 + 拖拽偏移（拖多远线画多长）
        const tailX = mid.x + dx;
        const tailY = mid.y + dy;
        // 头部 = 中点向反方向延伸相同距离（中点反射）
        const headX = mid.x - dx;
        const headY = mid.y - dy;

        graphics.clear();
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(255, 100, 100);
        graphics.moveTo(headX, headY);
        graphics.lineTo(tailX, tailY);
        graphics.stroke();

        // 在头部端（反射点）绘制箭头，指向发射方向
        const dirX = headX - tailX;  // 发射方向：从鼠标 → 头部
        const dirY = headY - tailY;
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len > 4) {
            const nx = dirX / len;
            const ny = dirY / len;
            const arrowSize = 12;
            const arrowWidth = 6;
            const px = -ny * arrowWidth;
            const py = nx * arrowWidth;
            // 箭尾基点（向尾部偏移）
            const baseX = headX - nx * arrowSize;
            const baseY = headY - ny * arrowSize;

            graphics.fillColor = new Color(255, 100, 100);
            graphics.moveTo(headX, headY);
            graphics.lineTo(baseX + px, baseY + py);
            graphics.lineTo(baseX - px, baseY - py);
            graphics.close();
            graphics.fill();
        }
    }

    private _onPointerUp(event: EventTouch): void {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._unregisterGlobalEvents();

        // 复位拖拽距离
        this._gameLogic?.setDragDistance(0);

        // 清除拖拽引导线
        const graphics = this._gameLogic?.dragGraphics;
        if (graphics) {
            graphics.clear();
        }

        if (!this._rigidBody) return;

        // 还原物理属性
        this._rigidBody.type = ERigidBody2DType.Dynamic;
        this._rigidBody.gravityScale = 1;

        // 计算拖拽向量
        const endPos = event.getLocation();
        const dx = endPos.x - this._dragStartPos.x;
        const dy = endPos.y - this._dragStartPos.y;

        // 拖拽距离太短则忽略（防误触）
        if (dx * dx + dy * dy < 25) return;

        // 反方向发射 - 速度与拖拽距离成正比（系数从 GameLogic 读取）
        const factor = this._gameLogic?.velocityFactor ?? 5;
        const velocity = new Vec2(-dx * factor, -dy * factor);

        // 通知 GameLogic 执行带特效的发射流程
        if (this._gameLogic) {
            this._gameLogic.launchCoin(this.node, velocity);
        } else {
            // fallback：直接发射
            this._rigidBody.linearVelocity = velocity;
            SoundManager.instance.playShot();
        }
    }
}
