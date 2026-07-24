import { _decorator, Component, Node, Vec2, Vec3, RigidBody2D, PhysicsSystem2D, Contact2DType, Collider2D, Graphics, UITransform, CircleCollider2D, AudioClip, Camera, Prefab, instantiate, ParticleSystem2D, Animation } from 'cc';
import { CoinController } from './CoinController';
import { EffectGoHelper } from './EffectGoHelper';
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

    @property({ tooltip: "首次碰撞时暂停物理的时长（秒），用于增强撞击感" })
    public hitPauseDuration: number = 0.01;

    @property({ tooltip: "摄像机拉近过渡时长（秒），值越大过渡越慢，默认0.5" })
    public cameraZoomInDuration: number = 0.5;

    @property({ tooltip: "摄像机恢复过渡时长（秒），值越大过渡越慢，默认0.5" })
    public cameraZoomOutDuration: number = 0.5;

    @property({ tooltip: "首次碰撞后追踪被撞硬币的时长（秒），追踪结束后恢复摄像机" })
    public cameraTrackDuration: number = 2.0;

    @property({ type: Prefab, tooltip: "硬币首次碰撞时的粒子特效预制体" })
    public hitParticlePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: "硬币发射时的特效预制体（effect_launch），播放完自动发射" })
    public launchEffectPrefab: Prefab | null = null;

    @property({ tooltip: "发射特效动画播放速度倍率（1=正常，2=二倍速，0.5=慢放）" })
    public launchAnimSpeed: number = 1;

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

    /** 首次碰撞暂停中 */
    private _isHitPausing: boolean = false;

    /** 屏幕震动中 */
    private _isShaking: boolean = false;
    /** 震动开始时间（ms） */
    private _shakeStartTime: number = 0;
    /** 震动结束时间（ms） */
    private _shakeEndTime: number = 0;
    /** 震动方向（归一化） */
    private _shakeDir: Vec2 = new Vec2(1, 0);

    /** 正在追踪被撞硬币 */
    private _isTrackingHitCoin: boolean = false;
    /** 被追踪的被撞硬币节点 */
    private _trackTargetNode: Node | null = null;
    /** 追踪开始时间（ms） */
    private _trackStartTime: number = 0;

    /** 当前拖拽距离（拖拽时用于镜头缩放，0=未拖拽） */
    private _dragDistance: number = 0;

    /** 设置拖拽距离（由 CoinController 每帧更新），用于拖拽时拉近镜头 */
    public setDragDistance(dist: number): void {
        this._dragDistance = dist;
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
        const hitCtrl = otherNode.getComponent(CoinController);
        if (!hitCtrl) return;

        // 首次碰撞：暂停物理增强撞击感，暂停结束后恢复速度、播放粒子、追踪被撞硬币
        if (this.coinHitCount === 0 && this.hitPauseDuration > 0) {
            const hitPos = new Vec3(
                (nodeA.position.x + nodeB.position.x) / 2,
                (nodeA.position.y + nodeB.position.y) / 2,
                0,
            );
            this._pauseAndRestore(hitPos, otherNode);
        } else {
            // 后续碰撞直接恢复速度
            this._restoreSpeed();
        }

        // 根据被撞硬币的配置播放碰撞音效
        if (hitCtrl.hitSfxClip) {
            SoundManager.instance.playClip(hitCtrl.hitSfxClip);
        } else {
            SoundManager.instance.playCollisionCoin();
        }

        this.coinHitCount++;

        this.onCoinHitByActiveShot(otherNode);
    }

    /** 首次碰撞时暂停物理，暂停结束后恢复速度、播放粒子、追踪被撞硬币 */
    private _pauseAndRestore(hitPos: Vec3, hitCoin: Node): void {
        if (this._isHitPausing) return;
        this._isHitPausing = true;
        this._setGameSpeed(0);
        // 屏幕震动：沿被撞硬币即将移动的方向（发射硬币→被撞硬币），一去一回
        const dir = new Vec2(
            hitCoin.position.x - (this._activeShotCoin?.position.x ?? 0),
            hitCoin.position.y - (this._activeShotCoin?.position.y ?? 0),
        );
        const len = dir.length();
        if (len > 0.001) { dir.x /= len; dir.y /= len; }
        this._startShake(this.hitPauseDuration, dir);
        this.scheduleOnce(() => {
            this._isHitPausing = false;
            this._restoreSpeed();
            // 在碰撞点生成粒子特效
            if (this.hitParticlePrefab) {
                const particleNode = instantiate(this.hitParticlePrefab);
                this.node.parent?.addChild(particleNode);
                particleNode.setPosition(hitPos);
            }
            // 开始追踪被撞硬币
            this._startTrackHitCoin(hitCoin);
        }, this.hitPauseDuration);
    }

    /** 开始追踪被撞硬币，持续 cameraTrackDuration 秒后自动恢复摄像机 */
    private _startTrackHitCoin(coin: Node): void {
        this._isTrackingHitCoin = true;
        this._trackTargetNode = coin;
        this._trackStartTime = Date.now();
    }

    /** 开始屏幕震动，沿指定方向一去一回，持续指定时长（秒） */
    private _startShake(duration: number, dir: Vec2): void {
        this._isShaking = true;
        this._shakeStartTime = Date.now();
        this._shakeEndTime = this._shakeStartTime + duration * 1000;
        this._shakeDir.set(dir);
    }

    /** 停止追踪被撞硬币 */
    private _stopTrackHitCoin(): void {
        this._isTrackingHitCoin = false;
        this._trackTargetNode = null;
    }

    update(deltaTime: number) {
        // 1. 持续监测坠落（在任意状态下均可坠落）
        this.checkCoinFalls();

        // 2. 桌面边界反弹（含缺口侧边）
        this._applyWallBounce();

        // 3. 慢动作超时保护：3秒后自动恢复
        if (this._isSlowMotion && Date.now() - this._slowMotionStartTime >= this._slowMotionMaxDuration) {
            this._restoreSpeed();
        }

        // 4. 摄像机跟踪：发射中跟随硬币，否则平滑回到原始位置
        this._updateCamera(deltaTime);

        // 5. 物理模拟中：检查是否静止
        if (this.currentPhase === GamePhase.ANIMATING) {
            if (this.isAllCoinsStopped()) {
                this.currentPhase = GamePhase.SETTLING;
                this.processResult();
            }
        }
    }

    /** 摄像机跟随逻辑（位置 + orthoHeight 缩放 + 屏幕震动） */
    private _updateCamera(dt: number): void {
        if (!this._mainCameraNode || !this._mainCameraComp) return;

        if (this._isSlowMotion && this._activeShotCoin?.isValid) {
            // 慢动作中：平滑跟踪硬币位置（不拉近镜头）
            const factor = 3 / Math.max(this.cameraZoomInDuration, 0.001);
            const t = Math.min(1, dt * factor);
            const target = this._activeShotCoin.position;
            const camPos = this._mainCameraNode.position;
            this._mainCameraNode.setPosition(
                camPos.x + (target.x - camPos.x) * t,
                camPos.y + (target.y - camPos.y) * t,
                this._originalCamPos.z,
            );
        } else if (this._isTrackingHitCoin && this._trackTargetNode?.isValid) {
            // 追踪被撞硬币（正常缩放），超时或节点销毁后自动恢复
            const factor = 3 / Math.max(this.cameraZoomOutDuration, 0.001);
            const t = Math.min(1, dt * factor);
            const target = this._trackTargetNode.position;
            const camPos = this._mainCameraNode.position;
            this._mainCameraNode.setPosition(
                camPos.x + (target.x - camPos.x) * t,
                camPos.y + (target.y - camPos.y) * t,
                this._originalCamPos.z,
            );
            // 检查追踪时长是否已到
            if (Date.now() - this._trackStartTime >= this.cameraTrackDuration * 1000) {
                this._stopTrackHitCoin();
            }
        } else if (this._dragDistance > 0) {
            // 拖拽中：平滑回到原始位置 + 根据拖拽距离拉近镜头
            const camPos = this._mainCameraNode.position;
            const dx = this._originalCamPos.x - camPos.x;
            const dy = this._originalCamPos.y - camPos.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.1) {
                const t = Math.min(1, dt * 3 / Math.max(this.cameraZoomOutDuration, 0.001));
                this._mainCameraNode.setPosition(
                    camPos.x + dx * t,
                    camPos.y + dy * t,
                    this._originalCamPos.z,
                );
            } else {
                this._mainCameraNode.setPosition(this._originalCamPos);
            }
            // 根据拖拽距离计算目标 orthoHeight（越远拉得越近）
            const dragZoomFactor = 0.1;
            const targetH = Math.max(50, this._defaultOrthoHeight - this._dragDistance * dragZoomFactor);
            const curH = this._mainCameraComp.orthoHeight;
            const diffH = targetH - curH;
            if (Math.abs(diffH) > 0.1) {
                const t = Math.min(1, dt * 3 / Math.max(this.cameraZoomInDuration, 0.001));
                this._mainCameraComp.orthoHeight = curH + diffH * t;
            }
        } else {
            // 慢动作/追踪结束：平滑回到原始位置 + 原始缩放
            const factor = 3 / Math.max(this.cameraZoomOutDuration, 0.001);
            const t = Math.min(1, dt * factor);
            const camPos = this._mainCameraNode.position;
            const dx = this._originalCamPos.x - camPos.x;
            const dy = this._originalCamPos.y - camPos.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.1) {
                this._mainCameraNode.setPosition(
                    camPos.x + dx * t,
                    camPos.y + dy * t,
                    this._originalCamPos.z,
                );
            } else {
                this._mainCameraNode.setPosition(this._originalCamPos);
            }
            const curH = this._mainCameraComp.orthoHeight;
            const diffH = this._defaultOrthoHeight - curH;
            if (Math.abs(diffH) > 0.1) {
                this._mainCameraComp.orthoHeight = curH + diffH * t;
            } else {
                this._mainCameraComp.orthoHeight = this._defaultOrthoHeight;
            }
        }

        // 屏幕震动：沿被撞硬币移动方向一去一回（一整个正弦周期）
        if (this._isShaking) {
            const elapsed = Date.now() - this._shakeStartTime;
            const duration = this._shakeEndTime - this._shakeStartTime;
            if (elapsed < duration && duration > 0) {
                const progress = elapsed / duration;                               // 0→1
                const amplitude = Math.sin(progress * Math.PI * 2) * 4;            // 一去一回
                const pos = this._mainCameraNode.position;
                this._mainCameraNode.setPosition(
                    pos.x + this._shakeDir.x * amplitude,
                    pos.y + this._shakeDir.y * amplitude,
                    pos.z,
                );
            } else {
                this._isShaking = false;
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
        this._restoreSpeed();
        this._stopTrackHitCoin();
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
        this._stopTrackHitCoin();
        this._setCoinsInteraction(false);
        this.onGameWin?.();
    }

    /** 命中 1 枚硬币后的连击延续流程 */
    private _continueWithLockedCoin(): void {
        this._restoreSpeed();
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

    /** 发射硬币：先播放特效，特效完成后执行实际发射 */
    public launchCoin(coin: Node, velocity: Vec2): void {
        this.setActiveShotCoin(coin);

        if (this.launchEffectPrefab) {
            const effectNode = instantiate(this.launchEffectPrefab);
            effectNode.setPosition(coin.position);
            this.node.parent?.addChild(effectNode);

            const anim = effectNode.getComponent(Animation);
            if (anim) {
                // 添加辅助组件，让动画剪辑中的 "go" 事件能触发发射
                const helper = effectNode.addComponent(EffectGoHelper);
                helper.onGo = () => {
                    //effectNode.destroy();
                    this._doLaunch(coin, velocity);
                };
                const animState = anim.getState(anim.defaultClip?.name ?? '');
                if (animState) animState.speed = this.launchAnimSpeed;
                anim.play();
                return;
            }
        }

        // 没有特效或没有 Animation 组件，直接发射
        this._doLaunch(coin, velocity);
    }

    /** 实际执行发射：设置速度、播放音效、进入物理模拟 */
    private _doLaunch(coin: Node, velocity: Vec2): void {
        const rb = coin.getComponent(RigidBody2D);
        if (!rb) return;
        rb.linearVelocity = velocity;
        SoundManager.instance.playShot();
        this.startSimulation();
    }

    /** 进入物理模拟阶段 */
    public startSimulation() {
        this.currentPhase = GamePhase.ANIMATING;
        this.coinHitCount = 0;
        this.coinFallCount = 0;
        this._lastHitCoin = null;
        this._setCoinsInteraction(false);
        // 发射时开启慢动作
        this._setGameSpeed(0.3);
    }

    // 允许用户操作状态
    public waitingPlayerOperation(){
        this._restoreSpeed();
        this._stopTrackHitCoin();
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