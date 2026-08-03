import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, ERigidBody2DType, EventTouch, Color, Sprite, CircleCollider2D, SpriteFrame, AudioClip, resources, UITransform } from 'cc';
import { GameLogic } from './GameLogic';
import { SoundManager } from './SoundManager';
const { ccclass } = _decorator;

@ccclass('CoinController')
export class CoinController extends Component {
    private static _anyDragging: boolean = false;
    private static _lastWorldPos: Vec2 = new Vec2();
    /** 从 coins.json 读取的 source_color */
    public static sourceColor: Color = Color.YELLOW;
    /** 从 coins.json 读取的 target_color */
    public static targetColor: Color = Color.GREEN;

    private _allowedOperation: boolean = false;
    private _rigidBody: RigidBody2D | null = null;
    private _isDragging: boolean = false;
    private _dragStartPos: Vec2 = new Vec2();
    private _gameLogic: GameLogic | null = null;
    private _eventRegistered: boolean = false;
    private _indicatorActive: boolean = false;
    private _indicatorTime: number = 0;
    /** 其他硬币拖拽时，本硬币高亮为绿色（表示可被打击） */
    private _targetableActive: boolean = false;

    /** 拖拽箭头 Sprite 节点与组件 */
    private _dragArrowNode: Node | null = null;
    private _dragArrowSprite: Sprite | null = null;

    /** 经墙面限位后的拖拽向量（箭头尾部不进入墙内） */
    private _clampedDragVec: Vec2 = new Vec2();
    /** 鼠标是否位于墙内（用于触发拒绝音效） */
    private _mouseInWall: boolean = false;

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
                sprite.color = Color.WHITE;
            }
        }
    }

    update(dt: number) {
        // 拖拽中每帧更新箭头（Sprite 方式，由 _drawDragLineFromPos 处理）
        if (this._isDragging) {
            this._drawDragLineFromPos(CoinController._lastWorldPos);
        }

        if (!this._indicatorActive && !this._targetableActive) return;

        this._indicatorTime += dt;
        const t = (Math.sin(this._indicatorTime * Math.PI * 2) + 1) / 2;
        const sprite = this.node.getComponent(Sprite);
        if (!sprite) return;

        if (this._targetableActive) {
            // 目标颜色脉冲：t=0 → targetColor，t=1 → 白色(255,255,255)
            sprite.color = new Color(
                Math.floor(CoinController.targetColor.r + (255 - CoinController.targetColor.r) * t),
                Math.floor(CoinController.targetColor.g + (255 - CoinController.targetColor.g) * t),
                Math.floor(CoinController.targetColor.b + (255 - CoinController.targetColor.b) * t),
            );
        } else {
            // 选中颜色脉冲：t=0 → sourceColor，t=1 → 白色(255,255,255)
            sprite.color = new Color(
                Math.floor(CoinController.sourceColor.r + (255 - CoinController.sourceColor.r) * t),
                Math.floor(CoinController.sourceColor.g + (255 - CoinController.sourceColor.g) * t),
                Math.floor(CoinController.sourceColor.b + (255 - CoinController.sourceColor.b) * t),
            );
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
            this._hideDragArrow();
            this._clearTargetableAll();
        }

        // 复位拖拽距离和预测
        this._gameLogic?.setDragDistance(0);
        this._clearPredictedTarget();
        this._hideDragArrow();

        this._mouseInWall = false;
        this._isDragging = true;
        event.getLocation(this._dragStartPos);
        // 同步更新缓存位置，防止 update() 轮询时读到未初始化的 (0,0)
        event.getLocation(CoinController._lastWorldPos);

        // 开始循环播放拖拽音效
        SoundManager.instance.startCoinDrag();

        // 其他硬币高亮为绿色（表示可被打击）
        const coinGroup = this._gameLogic?.coinGroup;
        if (coinGroup) {
            for (const child of coinGroup.children) {
                if (child === this.node) continue;
                const ctrl = child.getComponent(CoinController);
                if (ctrl) ctrl.showTargetable(true);
            }
        }

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

    /** 当前高亮的预测目标硬币 */
    private _predictedTarget: Node | null = null;

    private _onTouchMove(event: EventTouch): void {
        // 持续缓存鼠标位置，供 update 轮询兜底
        event.getLocation(CoinController._lastWorldPos);
        if (!this._isDragging) return;
        // 播放一次拖拽音效（若已在播放则跳过）
        SoundManager.instance.startCoinDrag();
        // 先绘制箭头（计算墙面限位后的拖拽向量）
        this._drawDragLine(event);
        // 使用限位后的拖拽距离
        const dx = this._clampedDragVec.x;
        const dy = this._clampedDragVec.y;
        if (this._gameLogic) {
            this._gameLogic.setDragDistance(Math.sqrt(dx * dx + dy * dy));
            // 预测目标硬币并高亮
            const hem = this._gameLogic.hitEffectManager;
            if (hem?.enableDragPrediction) {
                const dir = new Vec2(-dx, -dy);
                const len = dir.length();
                if (len > 0.001) { dir.x /= len; dir.y /= len; }
                const coinRadius = this._gameLogic?.coinRadius ?? 32;
                const predicted = hem.predictHitCoin(this.node.position, dir, coinRadius);
                this._setPredictedTarget(predicted);
            }
        }
    }

    /** 高亮/取消高亮预测目标硬币 */
    private _setPredictedTarget(coin: Node | null): void {
        if (this._predictedTarget && this._predictedTarget !== coin) {
            const oldSprite = this._predictedTarget.getComponent(Sprite);
            if (oldSprite) oldSprite.color = Color.WHITE;
        }
        if (coin) {
            const sprite = coin.getComponent(Sprite);
            if (sprite) sprite.color = new Color(255, 100, 100);
        }
        this._predictedTarget = coin;
    }

    /** 设置本硬币的可被打击高亮状态（绿色脉冲） */
    public showTargetable(show: boolean): void {
        this._targetableActive = show;
        this._indicatorTime = 0;
        if (!show) {
            const sprite = this.node.getComponent(Sprite);
            if (sprite) sprite.color = Color.WHITE;
        }
    }

    /** 清除所有硬币的可被打击高亮 */
    private _clearTargetableAll(): void {
        const coinGroup = this._gameLogic?.coinGroup;
        if (!coinGroup) return;
        for (const child of coinGroup.children) {
            const ctrl = child.getComponent(CoinController);
            if (ctrl) ctrl.showTargetable(false);
        }
    }

    /**
     * 计算经墙面限位后的拖拽向量。
     * 箭头尾部 = 硬币位置 + 拖拽向量，不能超出桌面可玩区域（墙内），
     * 超出时截断到边界，确保力度计算基于实际可视的箭头长度。
     */
    private _calcClampedDrag(rawDx: number, rawDy: number): Vec2 {
        const gl = this._gameLogic;
        if (!gl) return new Vec2(rawDx, rawDy);

        // 箭头尾部可到墙内边缘（不受硬币半径限制）
        const halfW = gl.tableWidth / 2 - gl.wallThickness;
        const halfH = gl.tableHeight / 2 - gl.wallThickness;
        const coinPos = this.node.position;

        // 箭头尾部原始位置
        let tailX = coinPos.x + rawDx;
        let tailY = coinPos.y + rawDy;

        // 检测鼠标是否超出墙内（触发拒绝音效 + 摄像机震动）
        const nowInWall = Math.abs(tailX) > halfW || Math.abs(tailY) > halfH;
        if (nowInWall && !this._mouseInWall) {
            SoundManager.instance.startNegative();
            // 震动方向：硬币中心 → 鼠标位置（= raw 拖拽向量方向）
            const hem = this._gameLogic.hitEffectManager;
            if (hem) {
                const dir = new Vec2(rawDx, rawDy);
                const len = dir.length();
                if (len > 0.001) { dir.x /= len; dir.y /= len; }
                hem.shakeCamera(0.1, dir);
            }
        }
        this._mouseInWall = nowInWall;

        // 限位到可玩区域
        tailX = Math.max(-halfW, Math.min(halfW, tailX));
        tailY = Math.max(-halfH, Math.min(halfH, tailY));

        // 从限位后的尾部反算拖拽向量
        return new Vec2(tailX - coinPos.x, tailY - coinPos.y);
    }

    /** 清理预测高亮 */
    private _clearPredictedTarget(): void {
        if (this._predictedTarget) {
            const sprite = this._predictedTarget.getComponent(Sprite);
            if (sprite) sprite.color = Color.WHITE;
            this._predictedTarget = null;
        }
    }

    /** 创建或获取拖拽箭头 Sprite */
    private _getDragArrow(): { node: Node; sprite: Sprite } | null {
        if (this._dragArrowSprite) return { node: this._dragArrowNode!, sprite: this._dragArrowSprite };

        const gl = this._gameLogic;
        if (!gl?.coinGroup) return null;

        const node = new Node('DragArrow');
        node.layer = 1; // WORLD
        gl.coinGroup.addChild(node);

        const ut = node.addComponent(UITransform);
        ut.setContentSize(32, 32);
        ut.setAnchorPoint(0.5, 0.5);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = new Color(255, 100, 100);

        // 异步加载箭头贴图
        resources.load('textures/arraw/spriteFrame', SpriteFrame, (err, sf) => {
            if (!err && sf && this._dragArrowSprite) {
                this._dragArrowSprite.spriteFrame = sf;
            }
        });

        this._dragArrowNode = node;
        this._dragArrowSprite = sprite;
        return { node, sprite };
    }

    /** 更新拖拽箭头（Sprite 方式：根据拖拽方向旋转 + 根据距离拉长） */
    private _updateDragArrow(dx: number, dy: number): void {
        const arrow = this._getDragArrow();
        if (!arrow) return;

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) { arrow.node.active = false; return; }

        arrow.node.active = true;
        arrow.node.setPosition(this.node.position);

        // 箭头默认朝上 (0,1)，旋转到发射方向 (-dx, -dy)
        const angle = Math.atan2(-dy, -dx) * 180 / Math.PI - 90;
        arrow.node.eulerAngles = new Vec3(0, 0, angle);

        // 根据拖拽距离拉长（单位高度 1px，最小 10）
        const height = Math.max(10, dist * 2);
        arrow.node.getComponent(UITransform)!.setContentSize(32, height);
    }

    /** 隐藏拖拽箭头 */
    private _hideDragArrow(): void {
        if (this._dragArrowNode) this._dragArrowNode.active = false;
    }

    /** 根据鼠标位置绘制拖拽引导线（经墙面限位后更新箭头） */
    private _drawDragLineFromPos(mousePos: Vec2): void {
        const rawDx = mousePos.x - this._dragStartPos.x;
        const rawDy = mousePos.y - this._dragStartPos.y;
        this._clampedDragVec = this._calcClampedDrag(rawDx, rawDy);
        this._updateDragArrow(this._clampedDragVec.x, this._clampedDragVec.y);
    }

    /** 绘制拖拽引导线（经墙面限位后更新箭头） */
    private _drawDragLine(event: EventTouch): void {
        const cur = event.getLocation();
        const rawDx = cur.x - this._dragStartPos.x;
        const rawDy = cur.y - this._dragStartPos.y;
        this._clampedDragVec = this._calcClampedDrag(rawDx, rawDy);
        this._updateDragArrow(this._clampedDragVec.x, this._clampedDragVec.y);
    }

    private _onPointerUp(event: EventTouch): void {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._unregisterGlobalEvents();

        // 复位拖拽距离和预测
        this._gameLogic?.setDragDistance(0);
        this._clearPredictedTarget();
        this._hideDragArrow();
        this._clearTargetableAll();

        if (!this._rigidBody) return;

        // 还原物理属性
        this._rigidBody.type = ERigidBody2DType.Dynamic;
        this._rigidBody.gravityScale = 1;

        // 使用墙面限位后的拖拽向量计算速度（与箭头视觉一致）
        const dx = this._clampedDragVec.x;
        const dy = this._clampedDragVec.y;

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
