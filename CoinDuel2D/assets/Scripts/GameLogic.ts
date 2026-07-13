import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, PhysicsSystem2D, Contact2DType, Collider2D, Graphics, UITransform, CircleCollider2D } from 'cc';
import { CoinController } from './CoinController';
import { Leaderboard } from './Leaderboard';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

enum GamePhase {
    WAITING_PLAYER, // 等待操作
    ANIMATING,      // 硬币飞行/物理运动中
    SETTLING        // 物理已静止，进行结算
}

@ccclass('GameLogic')
export class GameLogic extends Component {

    @property({ type: Node, tooltip: "所有硬币的父节点" })
    public coinGroup: Node = null!;

    public tableWidth: number = 1280;

    public tableHeight: number = 720;

    @property({ tooltip: "硬币半径" })
    public coinRadius: number = 32;

    @property({ tooltip: "判定静止的速度阈值" })
    public speedThreshold: number = 0.05;

    @property({ tooltip: "速度映射系数：拖拽距离 × 系数 = 发射初速度" })
    public velocityFactor: number = 0.5;

    @property({ tooltip: "硬币滑动阻尼（值越大摩擦越大，减速越快）" })
    public coinDamping: number = 2;

    // ── 围墙与缺口数据（每局由 GameScene 从 TableController 同步） ──
    /** 围墙厚度 */
    public wallThickness: number = 8;
    /** 本局所有缺口 */
    public gaps: { side: number; center: number }[] = [];
    /** 缺口宽度 */
    public gapWidth: number = 80;

    @property({ type: Graphics, tooltip: "拖拽引导线绘制组件" })
    public dragGraphics: Graphics = null!;

    private currentPhase: GamePhase = GamePhase.WAITING_PLAYER;
    private coinHitCount: number = 0;
    private coinFallCount: number = 0;
    private _activeShotCoin: Node | null = null;
    private _lockedCoin: Node | null = null;
    private _lastHitCoin: Node | null = null;
    private _gameStartTime: number = 0;

    public score: number = 0;
    public onGameOver: (() => void) | null = null;
    public onScoreUpdate: ((score: number) => void) | null = null;
    public onGameWin: (() => void) | null = null;

    /** 当前活跃的弹射硬币（用于碰撞检测） */
    public get activeShotCoin(): Node | null {
        return this._activeShotCoin;
    }

    protected start(): void {
        this._gameStartTime = Date.now();

        // 自动创建拖拽引导线 Graphics 节点（挂在 coinGroup 下，与硬币同坐标系）
        if (!this.dragGraphics) {
            const gNode = new Node('DragLine');
            this.coinGroup.addChild(gNode);
            this.dragGraphics = gNode.addComponent(Graphics);
        }

        // 注册全局碰撞回调
        if (PhysicsSystem2D.instance) {
            PhysicsSystem2D.instance.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
    }

    protected onDestroy(): void {
        if (PhysicsSystem2D.instance) {
            PhysicsSystem2D.instance.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
    }

    /** PhysicsSystem2D 全局碰撞回调：活跃弹射硬币撞到其他硬币时计数 */
    private _onBeginContact(a: Collider2D, b: Collider2D): void {
        if (!this._activeShotCoin) return;

        const nodeA = a.node;
        const nodeB = b.node;

        // 只处理硬币-硬币碰撞，跳过围墙碰撞
        const otherNode = nodeA === this._activeShotCoin ? nodeB : nodeA;
        if (!otherNode.getComponent(CoinController)) return;

        // 硬币与硬币碰撞音效
        SoundManager.instance.playCollisionCoin();
        this.coinHitCount++;

        this.onCoinHitByActiveShot(otherNode);
    }

    update(deltaTime: number) {
        // 1. 持续监测坠落（在任意状态下均可坠落）
        this.checkCoinFalls();

        // 2. 桌面边界反弹（含缺口侧边）
        this._applyWallBounce();

        // 3. 物理模拟中：检查是否静止
        if (this.currentPhase === GamePhase.ANIMATING) {
            if (this.isAllCoinsStopped()) {
                this.currentPhase = GamePhase.SETTLING;
                this.processResult();
            }
        }
    }

    // 检查所有硬币是否都停下了
    private isAllCoinsStopped(): boolean {
        for (let coin of this.coinGroup.children) {
            let rb = coin.getComponent(RigidBody2D);
            if (rb && rb.linearVelocity.length() > this.speedThreshold) {
                return false; // 只要有一个还在动，就不算静止
            }
        }
        return true;
    }

    /** 硬币在桌面边界反弹（考虑围墙厚度与所有缺口） */
    private _applyWallBounce(): void {
        const halfW = this.tableWidth / 2 - this.wallThickness - this.coinRadius;
        const halfH = this.tableHeight / 2 - this.wallThickness - this.coinRadius;
        const hw = this.tableWidth / 2;
        const hh = this.tableHeight / 2;
        const hg = this.gapWidth / 2;

        for (const coin of this.coinGroup.children) {
            const rb = coin.getComponent(RigidBody2D);
            if (!rb) continue;

            const pos = coin.position;
            const vel = rb.linearVelocity;
            let newX = pos.x;
            let newY = pos.y;
            let newVx = vel.x;
            let newVy = vel.y;
            let bounced = false;

            // 检查硬币当前是否处于某面墙的缺口范围内
            const inGap = (wallSide: number, alongPos: number): boolean =>
                this.gaps.some(g => g.side === wallSide && Math.abs(alongPos - g.center) < hg);

            // 右墙反弹（缺口处跳过）
            if (pos.x > halfW && vel.x > 0) {
                if (!inGap(1, pos.y)) {
                    newX = halfW;
                    newVx = -vel.x * 0.7;
                    bounced = true;
                }
            } else if (pos.x < -halfW && vel.x < 0) {
                if (!inGap(3, pos.y)) {
                    newX = -halfW;
                    newVx = -vel.x * 0.7;
                    bounced = true;
                }
            }

            // 上墙反弹（缺口处跳过）
            if (pos.y > halfH && vel.y > 0) {
                if (!inGap(0, pos.x)) {
                    newY = halfH;
                    newVy = -vel.y * 0.7;
                    bounced = true;
                }
            } else if (pos.y < -halfH && vel.y < 0) {
                if (!inGap(2, pos.x)) {
                    newY = -halfH;
                    newVy = -vel.y * 0.7;
                    bounced = true;
                }
            }

            // 缺口侧边反弹（遍历所有缺口）
            if (this.gaps.length > 0) {
                const out = { x: newX, y: newY, vx: newVx, vy: newVy };
                if (this._checkGapSideBounce(pos, vel, hw, hh, hg, out)) {
                    newX = out.x; newY = out.y;
                    newVx = out.vx; newVy = out.vy;
                    bounced = true;
                }
            }

            if (bounced) {
                coin.setPosition(newX, newY, 0);
                rb.linearVelocity = new Vec2(newVx, newVy);
                // 硬币与墙碰撞音效
                SoundManager.instance.playCollisionWall();
            }
        }
    }

    /** 缺口侧边反弹检测（遍历所有缺口） */
    private _checkGapSideBounce(
        pos: Vec3, vel: Vec2,
        hw: number, hh: number, hg: number,
        out: { x: number; y: number; vx: number; vy: number },
    ): boolean {
        const cr = this.coinRadius;
        for (const gap of this.gaps) {
            if (gap.side === 0 || gap.side === 2) {
                // 上/下墙缺口：侧边为竖直面
                const wallBot = gap.side === 0 ? hh - this.wallThickness : -(hh - this.wallThickness);
                const wallTop = gap.side === 0 ? hh : -hh;
                const overlapsY = pos.y + cr > Math.min(wallBot, wallTop) && pos.y - cr < Math.max(wallBot, wallTop);
                if (!overlapsY) continue;

                const rEdge = gap.center + hg;
                if (pos.x + cr > rEdge && pos.x < rEdge + cr && vel.x >= 0) {
                    out.x = rEdge - cr; out.vx = -vel.x * 0.7; return true;
                }
                const lEdge = gap.center - hg;
                if (pos.x - cr < lEdge && pos.x > lEdge - cr && vel.x <= 0) {
                    out.x = lEdge + cr; out.vx = -vel.x * 0.7; return true;
                }
            } else {
                // 左/右墙缺口：侧边为水平面
                const wallL = gap.side === 3 ? -(hw - this.wallThickness) : hw - this.wallThickness;
                const wallR = gap.side === 3 ? -hw : hw;
                const overlapsX = pos.x + cr > Math.min(wallL, wallR) && pos.x - cr < Math.max(wallL, wallR);
                if (!overlapsX) continue;

                const tEdge = gap.center + hg;
                if (pos.y + cr > tEdge && pos.y < tEdge + cr && vel.y >= 0) {
                    out.y = tEdge - cr; out.vy = -vel.y * 0.7; return true;
                }
                const bEdge = gap.center - hg;
                if (pos.y - cr < bEdge && pos.y > bEdge - cr && vel.y <= 0) {
                    out.y = bEdge + cr; out.vy = -vel.y * 0.7; return true;
                }
            }
        }
        return false;
    }

    private checkCoinFalls() {
        const hw = this.tableWidth / 2;
        const hh = this.tableHeight / 2;

        for (let i = this.coinGroup.children.length - 1; i >= 0; i--) {
            const coin = this.coinGroup.children[i];
            const pos = coin.position;

            // 硬币中点离开桌面范围 → 掉落
            if (Math.abs(pos.x) > hw || Math.abs(pos.y) > hh) {
                this.onCoinFall(coin);
            }
        }
    }

    private onCoinFall(coin: Node) {
        console.log("检测到硬币坠落，执行销毁...");
        SoundManager.instance.playCoinFall();
        this.coinFallCount++;
        coin.destroy();
    }

    /** 被 CoinController 调用：记录当前弹射的硬币 */
    public setActiveShotCoin(coin: Node): void {
        this._activeShotCoin = coin;
    }

    /** 活跃弹射的硬币撞到了另一枚 */
    public onCoinHitByActiveShot(hitCoin: Node): void {
        if (!this._activeShotCoin) return;
        if (hitCoin === this._activeShotCoin) return;

  
        // 记录第一枚被撞的硬币（case 1 时锁定为下一发起手子弹）
        if (!this._lastHitCoin) {
            this._lastHitCoin = hitCoin;
        }
    }

    private processResult() {
        console.log(">>> 物理静止，开始结算逻辑 <<<");

        // 1. 有任意硬币掉落 → 游戏结束
        if (this.coinFallCount > 0) {
            this._handleGameOver();
            return;
        }

        // 2. 根据主动撞击数量判定
        switch (this.coinHitCount) {
            case 0:
                this._handleGameOver();
                return;

            case 1: {
                // 得分 +1
                this.score++;
                this.onScoreUpdate?.(this.score);

                // 拿走刚弹出的硬币（先从父节点移除，children 立即更新）
                if (this._activeShotCoin) {
                    this._activeShotCoin.removeFromParent();
                    this._activeShotCoin.destroy();
                    this._activeShotCoin = null;
                }

                // 3. 胜利条件：桌面只剩最后一枚硬币（即刚弹出的已移除，仅剩 target）
                if (this.coinGroup.children.length <= 1) {
                    this._handleGameWin();
                    return;
                }

                // 锁定被撞硬币为下一发起手子弹
                this._lockedCoin = this._lastHitCoin;
                this._continueWithLockedCoin();
                return;
            }

            default: // 2 个或更多
                this._handleGameOver();
                return;
        }
    }

    /** 游戏结束处理 */
    private _handleGameOver(): void {
        console.log(">>> 游戏结束 <<<");
        const duration = Math.floor((Date.now() - this._gameStartTime) / 1000);
        if (this.score > 0) {
            Leaderboard.addEntry(this.score, duration);
        }
        this._setCoinsInteraction(false);
        this.onGameOver?.();
    }

    /** 游戏胜利（桌面仅剩 1 枚硬币） */
    private _handleGameWin(): void {
        console.log(">>> 游戏胜利 <<<");
        this._setCoinsInteraction(false);
        this.onGameWin?.();
    }

    /** 命中 1 枚硬币后的连击延续流程 */
    private _continueWithLockedCoin(): void {
        this.currentPhase = GamePhase.WAITING_PLAYER;

        // 先禁用所有硬币
        for (const coin of this.coinGroup.children) {
            const ctrl = coin.getComponent(CoinController);
            if (ctrl) {
                ctrl.allowedOperation = false;
                ctrl.showIndicator(false);
            }
        }

        // 只启用被锁定的硬币
        if (this._lockedCoin) {
            const ctrl = this._lockedCoin.getComponent(CoinController);
            if (ctrl) {
                ctrl.allowedOperation = true;
                ctrl.showIndicator(true);
            }
        }
    }

    // 提供给外部调用的接口（比如弹射硬币后）
    public startSimulation() {
        this.currentPhase = GamePhase.ANIMATING;
        this.coinHitCount = 0;
        this.coinFallCount = 0;
        this._lastHitCoin = null;
        this._setCoinsInteraction(false);
    }

    // 允许用户操作状态
    public waitingPlayerOperation(){
        this.currentPhase = GamePhase.WAITING_PLAYER;
        this._activeShotCoin = null;
        this._lockedCoin = null;
        this._lastHitCoin = null;
        this.coinHitCount = 0;
        this.coinFallCount = 0;
        this._setCoinsInteraction(true);
    }

    /** 启用/禁用所有硬币的交互 */
    private _setCoinsInteraction(allowed: boolean): void {
        for (const coin of this.coinGroup.children) {
            const ctrl = coin.getComponent(CoinController);
            if (ctrl) {
                ctrl.allowedOperation = allowed;
                ctrl.showIndicator(allowed);
            }

            // 每次启用时同步滑动阻力（持久设置，设一次即可）
            if (allowed) {
                const rb = coin.getComponent(RigidBody2D);
                if (rb) {
                    rb.linearDamping = this.coinDamping;
                }
            }
        }
    }

    /** 将当前 coinRadius 同步到所有已有硬币（尺寸 + 碰撞器） */
    public syncCoinRadius(): void {
        const r = this.coinRadius;
        for (const coin of this.coinGroup.children) {
            coin.setScale(1, 1, 1);
            const ut = coin.getComponent(UITransform);
            if (ut) ut.setContentSize(r * 2, r * 2);
            const cc = coin.getComponent(CircleCollider2D);
            if (cc) cc.radius = r;
        }
    }
}