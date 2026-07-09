import { _decorator, Component, Node, Vec2, RigidBody2D, ERigidBody2DType, input, Input, EventMouse, EventTouch, Color, Sprite, Graphics } from 'cc';
import { GameLogic } from './GameLogic';
const { ccclass } = _decorator;

@ccclass('CoinController')
export class CoinController extends Component {
    private _allowedOperation: boolean = false;
    private _rigidBody: RigidBody2D | null = null;
    private _isDragging: boolean = false;
    private _dragStartPos: Vec2 = new Vec2();
    private _gameLogic: GameLogic | null = null;
    private _eventRegistered: boolean = false;
    private _indicatorActive: boolean = false;
    private _indicatorTime: number = 0;

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

    start() {
        this._rigidBody = this.node.getComponent(RigidBody2D);
        if (!this._rigidBody) {
            console.warn('[CoinController] 找不到 RigidBody2D 组件');
            return;
        }

        // 禁止硬币自转（只平移不旋转）
        this._rigidBody.fixedRotation = true;

        // 节点鼠标事件
        this.node.on(Node.EventType.MOUSE_DOWN, this._onPointerDown, this);
        this.node.on(Node.EventType.MOUSE_MOVE, this._onMouseMove, this);
        this.node.on(Node.EventType.MOUSE_UP, this._onPointerUp, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.MOUSE_DOWN, this._onPointerDown, this);
        this.node.off(Node.EventType.MOUSE_MOVE, this._onMouseMove, this);
        this.node.off(Node.EventType.MOUSE_UP, this._onPointerUp, this);
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
        if (!this._indicatorActive) return;

        this._indicatorTime += dt;
        // sin 波归一化到 0~1：t=0 → 黄色(255,255,0)，t=1 → 白色(255,255,255)
        const t = (Math.sin(this._indicatorTime * Math.PI * 2) + 1) / 2;
        const sprite = this.node.getComponent(Sprite);
        if (sprite) {
            sprite.color = new Color(255, 255, Math.floor(t * 255));
        }
    }

    private _onPointerDown(event: EventMouse | EventTouch): void {
        if (!this._allowedOperation) return;

        // 防御：如果之前拖拽未正常结束（如鼠标移出窗口），先清理
        if (this._isDragging) {
            console.warn('[CoinController] 修复残留拖拽状态');
            this._isDragging = false;
            this._unregisterGlobalEvents();
            if (this._rigidBody) {
                this._rigidBody.type = ERigidBody2DType.Dynamic;
                this._rigidBody.gravityScale = 1;
            }
            if (this._gameLogic?.dragGraphics) {
                this._gameLogic.dragGraphics.clear();
            }
        }

        this._isDragging = true;
        event.getLocation(this._dragStartPos);

        // 冻结物理，防止拖拽期间受物理影响
        if (this._rigidBody) {
            this._rigidBody.type = ERigidBody2DType.Static;
        }

        // 注册全局追踪事件（桌面鼠标 + 移动端触摸各一套，平台自动选择）
        input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this._onPointerUp, this);
        // input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        // input.on(Input.EventType.TOUCH_END, this._onPointerUp, this);
        // input.on(Input.EventType.TOUCH_CANCEL, this._onPointerUp, this);
        this._eventRegistered = true;
    }

    private _unregisterGlobalEvents(): void {
        if (!this._eventRegistered) return;
        this._eventRegistered = false;

        input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this._onPointerUp, this);
        // input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        // input.off(Input.EventType.TOUCH_END, this._onPointerUp, this);
        // input.off(Input.EventType.TOUCH_CANCEL, this._onPointerUp, this);
    }

    private _onMouseMove(event: EventMouse): void {
        if (!this._isDragging) return;
        this._drawDragLine(event);
    }

    private _onTouchMove(event: EventTouch): void {
        if (!this._isDragging) return;
        this._drawDragLine(event);
    }

    /** 绘制拖拽引导线：中点 = 硬币位置，尾部 = 拖拽方向延伸 */
    private _drawDragLine(event: EventMouse | EventTouch): void {
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

    private _onPointerUp(event: EventMouse | EventTouch): void {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._unregisterGlobalEvents();

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
        this._rigidBody.linearVelocity = velocity;

        // 通知 GameLogic：标记此硬币为活跃弹射、进入物理模拟阶段
        if (this._gameLogic) {
            this._gameLogic.setActiveShotCoin(this.node);
            this._gameLogic.startSimulation();
        }
    }
}
