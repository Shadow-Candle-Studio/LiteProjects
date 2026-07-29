import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, ERigidBody2DType, EventTouch, Color, Sprite, CircleCollider2D, SpriteFrame, AudioClip, resources, UITransform } from 'cc';
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
        // 拖拽中每帧更新箭头（Sprite 方式，由 _drawDragLineFromPos 处理）
        if (this._isDragging) {
            this._drawDragLineFromPos(CoinController._lastWorldPos);
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
            this._hideDragArrow();
        }

        // 复位拖拽距离和预测
        this._gameLogic?.setDragDistance(0);
        this._clearPredictedTarget();
        this._hideDragArrow();

        this._isDragging = true;
        event.getLocation(this._dragStartPos);
        // 同步更新缓存位置，防止 update() 轮询时读到未初始化的 (0,0)
        event.getLocation(CoinController._lastWorldPos);

        // 开始循环播放拖拽音效
        SoundManager.instance.startCoinDrag();

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
        // 报告拖拽距离，用于镜头拉近
        if (this._gameLogic) {
            const dx = CoinController._lastWorldPos.x - this._dragStartPos.x;
            const dy = CoinController._lastWorldPos.y - this._dragStartPos.y;
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
        this._drawDragLine(event);
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

    /** 根据鼠标位置绘制拖拽引导线（Sprite 方式） */
    private _drawDragLineFromPos(mousePos: Vec2): void {
        const dx = mousePos.x - this._dragStartPos.x;
        const dy = mousePos.y - this._dragStartPos.y;
        this._updateDragArrow(dx, dy);
    }

    /** 绘制拖拽引导线（Sprite 方式） */
    private _drawDragLine(event: EventTouch): void {
        const cur = event.getLocation();
        const dx = cur.x - this._dragStartPos.x;
        const dy = cur.y - this._dragStartPos.y;
        this._updateDragArrow(dx, dy);
    }

    private _onPointerUp(event: EventTouch): void {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._unregisterGlobalEvents();

        // 复位拖拽距离和预测
        this._gameLogic?.setDragDistance(0);
        this._clearPredictedTarget();
        this._hideDragArrow();

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
