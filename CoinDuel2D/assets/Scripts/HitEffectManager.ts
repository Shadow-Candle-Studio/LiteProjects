import { _decorator, Component, Node, Vec2, Vec3, Prefab, instantiate, Camera, Sprite, SpriteFrame, RenderTexture, UITransform, Animation } from 'cc';
import { GameLogic } from './GameLogic';
import { EffectGoHelper } from './EffectGoHelper';
const { ccclass, property } = _decorator;

/**
 * 击中特效管理器 — 可独立开关的模块化特效系统。
 * 每个特效由独立的布尔开关控制，可在编辑器面板中自由组装。
 */
@ccclass('HitEffectManager')
export class HitEffectManager extends Component {

    // ══════════════════════════════════════════
    //  特效开关（可在编辑器自由组合）
    // ══════════════════════════════════════════

    // ── 蓄力阶段 ──
    @property({ tooltip: "蓄力时镜头根据拖拽距离拉近" })
    public enableDragZoom: boolean = true;

    @property({ tooltip: "蓄力时预测目标硬币并高亮为红色" })
    public enableDragPrediction: boolean = true;

    // ── 发射阶段 ──
    @property({ tooltip: "发射时播放蓄力完毕特效（effect_launch）" })
    public enableLaunchEffect: boolean = true;

    @property({ tooltip: "发射后进入慢动作" })
    public enableSlowMotion: boolean = true;

    @property({ tooltip: "发射后主镜头追踪发射硬币" })
    public enableLaunchTracking: boolean = true;

    // ── 击中阶段 ──
    @property({ tooltip: "击中时物理暂停" })
    public enableHitPause: boolean = true;

    @property({ tooltip: "击中时屏幕震动" })
    public enableHitShake: boolean = true;

    @property({ tooltip: "击中时飞溅粒子特效" })
    public enableHitParticle: boolean = true;

    @property({ tooltip: "击中时子画面镜头（PIP 特写）" })
    public enableHitSubCamera: boolean = false;

    @property({ tooltip: "击中后主镜头追踪被撞硬币" })
    public enableHitTracking: boolean = true;

    // ══════════════════════════════════════════
    //  参数
    // ══════════════════════════════════════════

    // ── 摄像机过渡（通用） ──
    @property({ tooltip: "镜头拉近过渡时长（秒）" })
    public cameraZoomInDuration: number = 0.5;

    @property({ tooltip: "镜头恢复过渡时长（秒）" })
    public cameraZoomOutDuration: number = 0.5;

    // ── 发射特效 ──
    @property({ type: Prefab, tooltip: "发射特效预制体（effect_launch）" })
    public launchEffectPrefab: Prefab | null = null;

    @property({ tooltip: "发射特效动画播放速度倍率" })
    public launchAnimSpeed: number = 1;

    // ── 击中暂停 ──
    @property({ tooltip: "击中暂停时长（秒）" })
    public hitPauseDuration: number = 0.01;

    // ── 击中粒子 ──
    @property({ type: Prefab, tooltip: "击中飞溅粒子预制体（particle_hit）" })
    public hitParticlePrefab: Prefab | null = null;

    // ── 击中镜头追踪 ──
    @property({ tooltip: "击中后追踪被撞硬币的时长（秒）" })
    public cameraTrackDuration: number = 2.0;

    // ── 子画面 ──
    @property({ type: Node, tooltip: "子画面挂载节点（panel），特效开启时在此节点上显示特写画面" })
    public subViewNode: Node | null = null;

    @property({ tooltip: "子画面摄像机 orthoHeight（越小画面越放大）" })
    public subCameraOrthoHeight: number = 80;

    @property({ tooltip: "子画面宽度" })
    public subViewWidth: number = 256;

    @property({ tooltip: "子画面高度" })
    public subViewHeight: number = 256;

    @property({ tooltip: "子画面显示时长（秒）" })
    public subViewDuration: number = 2.0;

    // ══════════════════════════════════════════
    //  运行时状态
    // ══════════════════════════════════════════

    /** 蓄力拖拽距离 */
    private _dragDistance: number = 0;
    /** 当前发射硬币 */
    private _activeShotCoin: Node | null = null;

    // ── 击中停顿用 ──
    public isHitPausing: boolean = false;

    // ── 击中震动用 ──
    public isShaking: boolean = false;
    public shakeStartTime: number = 0;
    public shakeEndTime: number = 0;
    public shakeDir: Vec2 = new Vec2(1, 0);

    // ── 碰撞后追踪用 ──
    public isTrackingHitCoin: boolean = false;
    public trackTargetNode: Node | null = null;
    public trackStartTime: number = 0;

    // ── 子画面预创建 ──
    private _subCamNode: Node | null = null;
    private _subCam: Camera | null = null;
    private _renderTex: RenderTexture | null = null;
    private _subViewContentSprite: Sprite | null = null;

    // ══════════════════════════════════════════
    //  生命周期
    // ══════════════════════════════════════════

    protected start(): void {
        if (this.enableHitSubCamera) {
            this._initSubViewResources();
        }
    }

    /** 预先创建子画面 Camera + RenderTexture */
    private _initSubViewResources(): void {
        if (!this.subViewNode) return;

        const subCamNode = new Node('_SubCamera');
        subCamNode.layer = 1;
        subCamNode.active = false;
        const parent = this.node.parent;
        if (parent) parent.addChild(subCamNode);
        else return;

        const subCam = subCamNode.addComponent(Camera);
        subCam.projection = Camera.ProjectionType.ORTHO;
        subCam.orthoHeight = this.subCameraOrthoHeight;
        subCam.clearFlags = 7;
        subCam.priority = 10;
        subCam.visibility = 1;

        const renderTex = new RenderTexture();
        renderTex.reset({ width: this.subViewWidth, height: this.subViewHeight });
        subCam.targetTexture = renderTex;

        const spriteNode = new Node('SubViewContent');
        spriteNode.layer = 33554432;
        spriteNode.active = true;

        const ut = spriteNode.addComponent(UITransform);
        ut.setContentSize(this.subViewWidth, this.subViewHeight);

        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const sf = new SpriteFrame();
        sf.texture = renderTex;
        sprite.spriteFrame = sf;

        this.subViewNode.addChild(spriteNode);

        this._subCamNode = subCamNode;
        this._subCam = subCam;
        this._renderTex = renderTex;
        this._subViewContentSprite = sprite;
    }

    // ══════════════════════════════════════════
    //  公开 API（由 GameLogic / CoinController 调用）
    // ══════════════════════════════════════════

    /** 设置蓄力拖拽距离 */
    public setDragDistance(dist: number): void {
        if (!this.enableDragZoom) return;
        this._dragDistance = dist;
    }

    /** 硬币发射时调用，触发发射阶段特效 */
    public onLaunch(coin: Node, gl: GameLogic): void {
        this._activeShotCoin = coin;

        if (this.enableLaunchEffect && this.launchEffectPrefab) {
            this._playLaunchEffect(coin, gl);
        }

        if (this.enableSlowMotion) {
            gl.setGameSpeed(0.3);
        } else {
            gl.setGameSpeed(1);
        }
        // 发射追踪由 updateCamera 根据 enableLaunchTracking 控制
    }

    /** 首次击中时调用，触发击中阶段特效 */
    public onHit(hitPos: Vec3, hitCoin: Node, shotCoin: Node | null, gl: GameLogic): void {
        if (this.isHitPausing) return;

        if (this.enableHitPause) {
            this._doHitPause(hitPos, hitCoin, shotCoin, gl);
        } else {
            // 无暂停，直接触发其他特效
            if (this.enableHitParticle && this.hitParticlePrefab) {
                this._spawnParticle(hitPos, gl);
            }
            if (this.enableHitShake) {
                this._startShake(0.05, this._calcShakeDir(hitCoin, shotCoin));
            }
            if (this.enableHitSubCamera) {
                this._showSubCamera(hitPos);
            }
            if (this.enableHitTracking) {
                this._startTrackHitCoin(hitCoin);
            }
        }
    }

    /**
     * 预测发射硬币将会撞击的第一个硬币基于圆扫掠检测。
     * 从发射硬币位置沿方向步进，检查移动圆是否与目标圆相交。
     * @param fromPos 发射硬币世界坐标
     * @param direction 发射方向（归一化向量）
     * @param radius 硬币半径
     * @param maxDistance 最大搜索距离
     */
    public predictHitCoin(fromPos: Vec3, direction: Vec2, radius: number = 32, maxDistance: number = 2000): Node | null {
        const minDist = radius * 2;
        const stepSize = radius; // 每一步约一个半径，不漏检

        // 收集所有硬币（排除自身用 fromPos 近似判断）
        const targets: { pos: Vec2; node: Node }[] = [];
        const gl = this.node.parent?.getComponent(GameLogic)
                  ?? this.getComponent(GameLogic);
        if (gl?.coinGroup) {
            for (const child of gl.coinGroup.children) {
                const ddx = child.position.x - fromPos.x;
                const ddy = child.position.y - fromPos.y;
                if (ddx * ddx + ddy * ddy > 10) { // 排除自身
                    targets.push({ pos: new Vec2(child.position.x, child.position.y), node: child });
                }
            }
        }

        let px = fromPos.x + direction.x * (radius + 1);
        let py = fromPos.y + direction.y * (radius + 1);
        let dist = 0;

        while (dist < maxDistance) {
            for (const t of targets) {
                const dx = px - t.pos.x;
                const dy = py - t.pos.y;
                if (dx * dx + dy * dy < minDist * minDist) {
                    return t.node;
                }
            }
            px += direction.x * stepSize;
            py += direction.y * stepSize;
            dist += stepSize;
        }
        return null;
    }

    /** 停止追踪 */
    public stopTracking(): void {
        this.isTrackingHitCoin = false;
        this.trackTargetNode = null;
        this._activeShotCoin = null;
    }

    /**
     * 每帧更新摄像机行为
     */
    public updateCamera(
        dt: number,
        camNode: Node,
        camComp: Camera,
        origPos: Vec3,
        defaultOrthoHeight: number,
        isSlowMotion: boolean,
    ): void {
        // ── 发射追踪 ──
        if (this.enableLaunchTracking && isSlowMotion && this._activeShotCoin?.isValid) {
            this._trackTarget(dt, camNode, this._activeShotCoin.position, this.cameraZoomInDuration);
        }
        // ── 碰撞后追踪 ──
        else if (this.enableHitTracking && this.isTrackingHitCoin && this.trackTargetNode?.isValid) {
            this._trackTarget(dt, camNode, this.trackTargetNode.position, this.cameraZoomOutDuration);
            if (Date.now() - this.trackStartTime >= this.cameraTrackDuration * 1000) {
                this.stopTracking();
            }
        }
        // ── 蓄力拉近 ──
        else if (this.enableDragZoom && this._dragDistance > 0) {
            this._restorePosition(dt, camNode, origPos, this.cameraZoomOutDuration);
            this._applyDragZoom(dt, camComp, defaultOrthoHeight);
        }
        // ── 空闲恢复 ──
        else {
            this._restorePosition(dt, camNode, origPos, this.cameraZoomOutDuration);
            this._restoreOrthoHeight(dt, camComp, defaultOrthoHeight, this.cameraZoomOutDuration);
        }

        // ── 屏幕震动 ──
        if (this.isShaking) {
            const elapsed = Date.now() - this.shakeStartTime;
            const duration = this.shakeEndTime - this.shakeStartTime;
            if (elapsed < duration && duration > 0) {
                const progress = elapsed / duration;
                const amplitude = Math.sin(progress * Math.PI * 2) * 4;
                const pos = camNode.position;
                camNode.setPosition(
                    pos.x + this.shakeDir.x * amplitude,
                    pos.y + this.shakeDir.y * amplitude,
                    pos.z,
                );
            } else {
                this.isShaking = false;
            }
        }
    }

    // ══════════════════════════════════════════
    //  发射阶段特效
    // ══════════════════════════════════════════

    /** 播放蓄力完毕特效 */
    private _playLaunchEffect(coin: Node, gl: GameLogic): void {
        const effectNode = instantiate(this.launchEffectPrefab!);
        effectNode.setPosition(coin.position);
        gl.addChildToWorld(effectNode);

        const anim = effectNode.getComponent(Animation);
        if (anim) {
            const helper = effectNode.addComponent(EffectGoHelper);
            helper.onGo = () => {
                this._dragDistance = 0;
            };
            const animState = anim.getState(anim.defaultClip?.name ?? '');
            if (animState) animState.speed = this.launchAnimSpeed;
            anim.play();
        }
    }

    // ══════════════════════════════════════════
    //  击中阶段特效
    // ══════════════════════════════════════════

    /** 击中停顿 + 连锁特效 */
    private _doHitPause(hitPos: Vec3, hitCoin: Node, shotCoin: Node | null, gl: GameLogic): void {
        this.isHitPausing = true;
        gl.setGameSpeed(0);

        if (this.enableHitShake) {
            this._startShake(this.hitPauseDuration, this._calcShakeDir(hitCoin, shotCoin));
        }
        if (this.enableHitSubCamera) {
            this._showSubCamera(hitPos);
        }

        this.scheduleOnce(() => {
            this.isHitPausing = false;
            gl.restoreSpeed();

            if (this.enableHitParticle && this.hitParticlePrefab) {
                this._spawnParticle(hitPos, gl);
            }
            if (this.enableHitTracking) {
                this._startTrackHitCoin(hitCoin);
            }
        }, this.hitPauseDuration);
    }

    /** 生成飞溅粒子 */
    private _spawnParticle(pos: Vec3, gl: GameLogic): void {
        const node = instantiate(this.hitParticlePrefab!);
        gl.addChildToWorld(node);
        node.setPosition(pos);
    }

    /** 开启子画面摄像机 */
    private _showSubCamera(hitPos: Vec3): void {
        if (this._subCamNode && this._subCam) {
            this._subCamNode.setPosition(hitPos.x, hitPos.y, 300);
            this._subCamNode.active = true;
        }
        if (this.subViewNode) {
            this.subViewNode.active = true;
        }
        // 子画面延时关闭
        this.scheduleOnce(() => {
            if (this._subCamNode) this._subCamNode.active = false;
            if (this.subViewNode) this.subViewNode.active = false;
        }, this.subViewDuration);
    }

    // ══════════════════════════════════════════
    //  原子工具方法
    // ══════════════════════════════════════════

    private _calcShakeDir(hitCoin: Node, shotCoin: Node | null): Vec2 {
        const dir = new Vec2(
            hitCoin.position.x - (shotCoin?.position.x ?? 0),
            hitCoin.position.y - (shotCoin?.position.y ?? 0),
        );
        const len = dir.length();
        if (len > 0.001) { dir.x /= len; dir.y /= len; }
        return dir;
    }

    private _startShake(duration: number, dir: Vec2): void {
        this.isShaking = true;
        this.shakeStartTime = Date.now();
        this.shakeEndTime = this.shakeStartTime + duration * 1000;
        this.shakeDir.set(dir);
    }

    private _startTrackHitCoin(coin: Node): void {
        this.isTrackingHitCoin = true;
        this.trackTargetNode = coin;
        this.trackStartTime = Date.now();
    }

    private _trackTarget(dt: number, camNode: Node, targetPos: Vec3, duration: number): void {
        const factor = 3 / Math.max(duration, 0.001);
        const t = Math.min(1, dt * factor);
        const pos = camNode.position;
        camNode.setPosition(
            pos.x + (targetPos.x - pos.x) * t,
            pos.y + (targetPos.y - pos.y) * t,
            camNode.position.z,
        );
    }

    private _restorePosition(dt: number, camNode: Node, origPos: Vec3, duration: number): void {
        const factor = 3 / Math.max(duration, 0.001);
        const t = Math.min(1, dt * factor);
        const pos = camNode.position;
        const dx = origPos.x - pos.x;
        const dy = origPos.y - pos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0.1) {
            camNode.setPosition(pos.x + dx * t, pos.y + dy * t, origPos.z);
        } else {
            camNode.setPosition(origPos);
        }
    }

    private _restoreOrthoHeight(dt: number, camComp: Camera, targetH: number, duration: number): void {
        const curH = camComp.orthoHeight;
        const diff = targetH - curH;
        if (Math.abs(diff) > 0.1) {
            const t = Math.min(1, dt * 3 / Math.max(duration, 0.001));
            camComp.orthoHeight = curH + diff * t;
        } else {
            camComp.orthoHeight = targetH;
        }
    }

    private _applyDragZoom(dt: number, camComp: Camera, defaultOrthoHeight: number): void {
        const targetH = Math.max(50, defaultOrthoHeight - this._dragDistance * 0.1);
        this._restoreOrthoHeight(dt, camComp, targetH, this.cameraZoomInDuration);
    }
}
