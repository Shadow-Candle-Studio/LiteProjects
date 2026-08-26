import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, PhysicsSystem2D, Contact2DType, Collider2D, Graphics, UITransform, CircleCollider2D, Camera, input, Input, EventMouse, EventTouch, Prefab, instantiate, tween } from 'cc';
import { Bomb } from './Effects/Bomb';
import { CoinController } from './CoinController';
import { HitEffectManager } from './HitEffectManager';
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

    @property({ type: HitEffectManager, tooltip: "击中特效管理器（控制拖拽拉近/发射追踪/暂停/震动/粒子/碰撞追踪/恢复）" })
    public hitEffectManager: HitEffectManager | null = null;

    @property({ type: Prefab, tooltip: "障碍物 prefab（静态圆盘，硬币碰到会反弹）" })
    public blockerPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: "陷阱 prefab（泥潭区域，硬币中心进入后改变摩擦力）" })
    public mudPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: "炸弹 prefab（抛物线飞入，播放爆炸动画后自动销毁）" })
    public bombPrefab: Prefab | null = null;

    @property({ tooltip: "炸弹爆炸推力半径（硬币中心在此范围内会被推开）" })
    public bombPushRadius: number = 200;

    @property({ tooltip: "炸弹爆炸推力大小（越大推开越远）" })
    public bombPushForce: number = 500;

    @property({ tooltip: "泥潭内硬币滑动阻尼（越大减速越明显）" })
    public mudDamping: number = 8;

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

    /** 场上所有道具节点（障碍物 + 陷阱），关卡开始时统一清理 */
    private _props: Node[] = [];

    /** 场上所有泥潭区域节点（硬币中心进入后提高摩擦阻尼） */
    private _muds: Node[] = [];

    /** 场上泥潭区域列表 */
    public get muds(): Node[] {
        return this._muds;
    }

    // ── 摄像机追踪 ──
    private _mainCameraNode: Node | null = null;
    private _mainCameraComp: Camera | null = null;
    private _originalCamPos: Vec3 = new Vec3();
    private _defaultOrthoHeight: number = 0;

    /** 慢动作是否生效中 */
    private _isSlowMotion: boolean = false;

    /** 慢动作开始时间（毫秒） */
    private _slowMotionStartTime: number = 0;

    /** 慢动作最长持续毫秒数 */
    private readonly _slowMotionMaxDuration: number = 3000;

    /** 设置拖拽距离（由 CoinController 每帧更新），委托给 HitEffectManager */
    public setDragDistance(dist: number): void {
        this.hitEffectManager?.setDragDistance(dist);
    }

    /** 设置游戏物理速度倍率（只改 fixedTimeStep，不重置累积器） */
    private _setGameSpeed(speed: number): void {
        PhysicsSystem2D.instance.fixedTimeStep = (1 / 60) * speed;
        if (speed >= 1) {
            PhysicsSystem2D.instance.resetAccumulator(0);
        }
        this._isSlowMotion = speed < 1;
        if (this._isSlowMotion) {
            this._slowMotionStartTime = Date.now();
        }
    }

    /** 恢复速度到正常值（仅在慢动作时生效） */
    private _restoreSpeed(): void {
        if (!this._isSlowMotion) return;
        this._setGameSpeed(1);
    }

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
            gNode.layer = 1; // WORLD
            this.coinGroup.addChild(gNode);
            this.dragGraphics = gNode.addComponent(Graphics);
        }

        // 获取 MainCamera 并保存原始位置和默认 orthoHeight
        const camNode = this.node.parent?.getChildByName('MainCamera');
        if (camNode) {
            this._mainCameraNode = camNode;
            this._originalCamPos.set(camNode.position);
            this._mainCameraComp = camNode.getComponent(Camera);
            if (this._mainCameraComp) {
                this._defaultOrthoHeight = this._mainCameraComp.orthoHeight;
            }
        }

        // 注册全局碰撞回调
        if (PhysicsSystem2D.instance) {
            PhysicsSystem2D.instance.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }

        // 收集场景中已放置的道具节点（如 Table/Mud），使其同样生效
        this._collectExistingProps();

        // 测试钩子：点击桌面空白处播放龙卷风
        //input.on(Input.EventType.MOUSE_DOWN, this._onTestClick, this);
    }

    protected onDestroy(): void {
        if (PhysicsSystem2D.instance) {
            PhysicsSystem2D.instance.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
        input.off(Input.EventType.MOUSE_DOWN, this._onTestClick, this);
    }

    /** PhysicsSystem2D 全局碰撞回调：活跃弹射硬币撞到其他硬币时计数 */
    private _onBeginContact(a: Collider2D, b: Collider2D): void {
        if (!this._activeShotCoin) return;

        const nodeA = a.node;
        const nodeB = b.node;

        // 只处理硬币-硬币碰撞，跳过围墙碰撞
        const otherNode = nodeA === this._activeShotCoin ? nodeB : nodeA;
        const hitCtrl = otherNode.getComponent(CoinController);
        if (!hitCtrl) return;

        // 首次碰撞：委托给 HitEffectManager 处理特效
        if (this.coinHitCount === 0) {
            const hitPos = new Vec3(
                (nodeA.position.x + nodeB.position.x) / 2,
                (nodeA.position.y + nodeB.position.y) / 2,
                0,
            );
            this.hitEffectManager?.onHit(hitPos, otherNode, this._activeShotCoin, this);
        } else {
            // 后续碰撞直接恢复速度
            this._restoreSpeed();
        }

        // 被打击硬币切换被打击贴图 + 播放被打击音效（优先使用 config.json 配置的 hitted_sfx）
        hitCtrl.showHit();
        if (hitCtrl.hittedSfxClip) {
            SoundManager.instance.playClip(hitCtrl.hittedSfxClip);
        } else {
            SoundManager.instance.playCollisionCoin();
        }

        this.coinHitCount++;

        this.onCoinHitByActiveShot(otherNode);
    }

    // ── 供 HitEffectManager 调用的公开桥接方法 ──

    /** 设置物理速度（公开桥接） */
    public setGameSpeed(speed: number): void {
        this._setGameSpeed(speed);
    }

    /** 恢复物理速度（公开桥接） */
    public restoreSpeed(): void {
        this._restoreSpeed();
    }

    /** 向世界根节点添加子节点（公开桥接，用于特效） */
    public addChildToWorld(node: Node): void {
        this.node.parent?.addChild(node);
    }

    // ── 道具：障碍物（Blocker）与陷阱（Mud） ──

    /** 生成一个障碍物：从屏幕外随机一侧飞入，随机落在场地某处 */
    public spawnBlocker(): void {
        if (!this.blockerPrefab) {
            console.warn('[GameLogic] blockerPrefab 未配置');
            return;
        }
        this._flyInProp(instantiate(this.blockerPrefab), false);
    }

    /** 生成一个陷阱：从屏幕外随机一侧飞入，随机落在场地某处 */
    public spawnMud(): void {
        if (!this.mudPrefab) {
            console.warn('[GameLogic] mudPrefab 未配置');
            return;
        }
        this._flyInProp(instantiate(this.mudPrefab), true);
    }

    /** 点击炸弹按钮：从桌面右侧抛物线飞入，动画结束后自动销毁 */
    public spawnBomb(): void {
        if (!this.bombPrefab) {
            console.warn('[GameLogic] bombPrefab 未配置');
            return;
        }
        const node = instantiate(this.bombPrefab);
        this.addChildToWorld(node);
        // 注入推力参数
        const bomb = node.getComponent(Bomb);
        if (bomb) {
            bomb.pushRadius = this.bombPushRadius;
            bomb.pushForce = this.bombPushForce;
            bomb.coinGroup = this.coinGroup;
        }
        this._flyBomb(node);
    }

    /** 收集场景中已放置的道具节点（如 Table/Mud 占位），使其同样生效 */
    private _collectExistingProps(): void {
        const world = this.node.parent;
        if (!world) return;
        const stack: Node[] = [world];
        while (stack.length > 0) {
            const n = stack.pop()!;
            if (n !== world && n.isValid && (n.name === 'Mud' || n.name === 'Blocker')) {
                if (!this._props.includes(n)) {
                    this._props.push(n);
                    if (n.name === 'Mud') this._muds.push(n);
                }
            }
            for (const c of n.children) stack.push(c);
        }
    }

    /** 关卡开始时清理场上所有道具（障碍物与陷阱），并重置追踪列表 */
    public clearProps(): void {
        // 兜底收集（避免与 GameLogic.start 的执行顺序无关地漏掉场景预放的道具）
        this._collectExistingProps();
        for (const p of this._props) {
            if (p && p.isValid) p.destroy();
        }
        this._props.length = 0;
        this._muds.length = 0;
    }

    /** 道具飞入动画：从屏幕左右两侧以抛物线轨迹飞入，落地后恢复大小 */
    private _flyInProp(node: Node, isMud: boolean): void {
        this.addChildToWorld(node);
        this._props.push(node);

        // 随机着陆位置（可玩区域边缘留出物体半径的边距）
        const halfW = this.tableWidth / 2 - this.wallThickness;
        const halfH = this.tableHeight / 2 - this.wallThickness;
        const margin = 70;
        const landX = (Math.random() * 2 - 1) * Math.max(0, halfW - margin);
        const landY = (Math.random() * 2 - 1) * Math.max(0, halfH - margin);

        // 起始位置在屏幕外，只从屏幕左侧或右侧飞入（同一高度）
        const off = 400;
        const fromRight = Math.random() < 0.5;
        const startX = fromRight ? halfW + off : -halfW - off;
        const startY = landY;

        // 飞行期间缩小（0.3），落地后恢复 1；同时禁用碰撞，落地后再启用
        node.setPosition(startX, startY, 0);
        node.setScale(0.3, 0.3, 1);
        const collider = node.getComponent(Collider2D);
        if (collider) collider.enabled = false;

        // 抛物线轨迹：x 线性推进，y 沿二次抛物线先抬升后落下
        const arcH = 250;
        tween(node)
            .to(0.6, { scale: new Vec3(1, 1, 1) }, {
                easing: 'quadOut',
                onUpdate: (target: Node, ratio: number) => {
                    const x = startX + (landX - startX) * ratio;
                    const y = startY + (landY - startY) * ratio + 4 * arcH * ratio * (1 - ratio);
                    target.setPosition(x, y, 0);
                },
            })
            .call(() => {
                if (collider) collider.enabled = true;
                if (isMud) this._muds.push(node);
            })
            .start();
    }

    /** 炸弹飞入动画：从桌面右侧以抛物线轨迹飞入，动画播放完由 Bomb 组件自动销毁 */
    private _flyBomb(node: Node): void {
        const halfW = this.tableWidth / 2 - this.wallThickness;
        const halfH = this.tableHeight / 2 - this.wallThickness;
        const landX = (Math.random() * 2 - 1) * Math.max(0, halfW - 70);
        const landY = (Math.random() * 2 - 1) * Math.max(0, halfH - 70);

        // 从右侧飞入
        const startX = halfW + 400;
        const startY = landY;

        node.setPosition(startX, startY, 0);
        node.setScale(0.3, 0.3, 1);

        const arcH = 300;
        const bomb = node.getComponent(Bomb);
        tween(node)
            .to(0.6, { scale: new Vec3(1, 1, 1) }, {
                easing: 'quadOut',
                onUpdate: (target: Node, ratio: number) => {
                    const x = startX + (landX - startX) * ratio;
                    const y = startY + (landY - startY) * ratio + 4 * arcH * ratio * (1 - ratio);
                    target.setPosition(x, y, 0);
                },
            })
            .call(() => {
                if (bomb) bomb.play();
            })
            .start();
    }

    /** 泥潭摩擦：硬币中心在泥潭区域内时提高线性阻尼，离开后恢复 */
    private _applyMudFriction(): void {
        if (this._muds.length === 0) return;
        for (const coin of this.coinGroup.children) {
            const rb = coin.getComponent(RigidBody2D);
            if (!rb) continue;
            const pos = coin.worldPosition;
            let inMud = false;
            for (const mud of this._muds) {
                if (!mud.isValid) continue;
                const ut = mud.getComponent(UITransform);
                const radius = (ut ? ut.width / 2 : 64) * mud.worldScale.x;
                const mpos = mud.worldPosition;
                const dx = pos.x - mpos.x;
                const dy = pos.y - mpos.y;
                if (dx * dx + dy * dy <= radius * radius) {
                    inMud = true;
                    break;
                }
            }
            const target = inMud ? this.mudDamping : this.coinDamping;
            if (rb.linearDamping !== target) rb.linearDamping = target;
        }
    }

    // ── 测试辅助：点击桌面空白处播放龙卷风 ──

    /** 点击空白处（不在任何硬币上）时，在该处播放龙卷风，方便测试 */
    private _onTestClick(event: EventMouse | EventTouch): void {
        if (!this.hitEffectManager) return;

        const wp = this._screenToTablePos(event.getLocation());
        if (!wp) return;

        // 点击到硬币上（会触发拖拽），不触发测试龙卷风
        if (this._hitTestCoin(wp)) return;

        this.hitEffectManager.playTestTornado(Vec3.ZERO, 5);
    }

    /** 屏幕坐标 → 桌面平面（z=0）上的世界坐标 */
    private _screenToTablePos(loc: Vec2): Vec3 | null {
        const camNode = this._mainCameraNode;
        const cam = this._mainCameraComp;
        if (!camNode || !cam) return null;
        // screenToWorld 的 z 参数为沿相机前方向的距离；相机在 z=1000，桌面在 z=0
        const wp = cam.screenToWorld(new Vec3(loc.x, loc.y, camNode.position.z));
        return new Vec3(wp.x, wp.y, 0);
    }

    /** 点击位置是否落在某枚硬币上 */
    private _hitTestCoin(worldPos: Vec3): boolean {
        if (!this.coinGroup) return false;
        const r = this.coinRadius;
        for (const coin of this.coinGroup.children) {
            const dx = coin.position.x - worldPos.x;
            const dy = coin.position.y - worldPos.y;
            if (dx * dx + dy * dy <= r * r) {
                return true;
            }
        }
        return false;
    }

    update(deltaTime: number) {
        // 1. 持续监测坠落（在任意状态下均可坠落）
        this.checkCoinFalls();

        // 2. 桌面边界反弹（含缺口侧边）
        this._applyWallBounce();

        // 2.5 泥潭摩擦：硬币中心在泥潭区域内时提高阻尼
        this._applyMudFriction();

        // 3. 慢动作超时保护：3秒后自动恢复
        if (this._isSlowMotion && Date.now() - this._slowMotionStartTime >= this._slowMotionMaxDuration) {
            this._restoreSpeed();
        }

        // 4. 摄像机跟踪：发射中跟随硬币，否则平滑回到原始位置
        this._updateCamera(deltaTime);

        // 5. 摄像机还原后，启用待命的下一次击打
        if (this._pendingLockedCoin && this.hitEffectManager?.isCameraAtRest) {
            const ctrl = this._pendingLockedCoin.getComponent(CoinController);
            if (ctrl) {
                ctrl.allowedOperation = true;
                ctrl.showIndicator(true);
            }
            this._pendingLockedCoin = null;
        }

        // 6. 物理模拟中：检查是否静止
        if (this.currentPhase === GamePhase.ANIMATING) {
            if (this.isAllCoinsStopped()) {
                this.currentPhase = GamePhase.SETTLING;
                this.processResult();
            }
        }
    }

    /** 摄像机跟随逻辑，委托给 HitEffectManager */
    private _updateCamera(dt: number): void {
        if (!this._mainCameraNode || !this._mainCameraComp) return;
        this.hitEffectManager?.updateCamera(
            dt,
            this._mainCameraNode,
            this._mainCameraComp,
            this._originalCamPos,
            this._defaultOrthoHeight,
            this._isSlowMotion,
        );
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
                // 撞到墙 → 恢复速度
                this._restoreSpeed();
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

            // 正在被打飞出界的硬币不判为掉落（由打飞特效自行处理）
            const ctrl = coin.getComponent(CoinController);
            if (ctrl && ctrl.isKnockingOut) continue;

            // 硬币中点离开桌面范围 → 掉落
            if (Math.abs(pos.x) > hw || Math.abs(pos.y) > hh) {
                this.onCoinFall(coin);
            }
        }
    }

    private onCoinFall(coin: Node) {
        console.log("检测到硬币坠落，执行销毁...");
        // 硬币掉落 → 恢复速度
        this._restoreSpeed();
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

                // 打飞特效（B 硬币旋转手臂将 A 打飞出界）结束后再结算
                const afterKnockOut = () => {
                    this._activeShotCoin = null;

                    // 胜利条件：桌面只剩最后一枚硬币（排除 DragLine 等非硬币节点）
                    let coinCount = 0;
                    for (const child of this.coinGroup.children) {
                        if (child.getComponent(CoinController)) coinCount++;
                    }
                    if (coinCount <= 1) {
                        this._handleGameWin();
                        return;
                    }

                    // 锁定被撞硬币为下一发起手子弹
                    this._lockedCoin = this._lastHitCoin;
                    this._continueWithLockedCoin();
                };

                const shotCoin = this._activeShotCoin;
                const hitCoin = this._lastHitCoin;
                if (shotCoin && hitCoin && this.hitEffectManager) {
                    this.hitEffectManager.playKnockOut(shotCoin, hitCoin, afterKnockOut);
                } else {
                    // 无打飞特效时：立即移除发射硬币再结算
                    if (shotCoin) {
                        shotCoin.removeFromParent();
                        shotCoin.destroy();
                    }
                    afterKnockOut();
                }
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
        this._restoreSpeed();
        this.hitEffectManager?.stopTracking();
        this._pendingLockedCoin = null;
        SoundManager.instance.playGameOver();
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
        this._restoreSpeed();
        this.hitEffectManager?.stopTracking();
        this._pendingLockedCoin = null;
        this._setCoinsInteraction(false);
        this.onGameWin?.();
    }

    /** 命中 1 枚硬币后的连击延续流程（延迟到摄像机还原后才启用操作） */
    private _continueWithLockedCoin(): void {
        this._restoreSpeed();

        // 先禁用所有硬币
        for (const coin of this.coinGroup.children) {
            const ctrl = coin.getComponent(CoinController);
            if (ctrl) {
                ctrl.allowedOperation = false;
                ctrl.showIndicator(false);
            }
        }

        // 等待摄像机还原后启用操作
        this._pendingLockedCoin = this._lockedCoin;
        this.currentPhase = GamePhase.WAITING_PLAYER;
    }

    /** 待摄像机还原后启用的锁定硬币 */
    private _pendingLockedCoin: Node | null = null;

    /** 发射硬币：委托 HitEffectManager 处理发射特效，然后进入物理模拟 */
    public launchCoin(coin: Node, velocity: Vec2): void {
        this.setActiveShotCoin(coin);
        this._doLaunch(coin, velocity);
    }

    /** 实际执行发射：设置速度、切换发射贴图、播放音效、触发管理器特效、进入物理模拟 */
    private _doLaunch(coin: Node, velocity: Vec2): void {
        const rb = coin.getComponent(RigidBody2D);
        if (!rb) return;
        rb.linearVelocity = velocity;

        // 切换发射贴图 + 播放发射音效（优先使用 config.json 配置的 shot_sfx）
        const ctrl = coin.getComponent(CoinController);
        if (ctrl) {
            ctrl.showShot();
            if (ctrl.shotSfxClip) {
                SoundManager.instance.playClip(ctrl.shotSfxClip);
            } else {
                SoundManager.instance.playShot();
            }
        } else {
            SoundManager.instance.playShot();
        }

        this.hitEffectManager?.onLaunch(coin, this);
        this.startSimulation();
    }

    /** 进入物理模拟阶段 */
    public startSimulation() {
        this.currentPhase = GamePhase.ANIMATING;
        this.coinHitCount = 0;
        this.coinFallCount = 0;
        this._lastHitCoin = null;
        this._setCoinsInteraction(false);
        // 游戏速度由 HitEffectManager.onLaunch 控制
    }

    // 允许用户操作状态
    public waitingPlayerOperation(){
        this._restoreSpeed();
        this.hitEffectManager?.stopTracking();
        this._pendingLockedCoin = null;
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