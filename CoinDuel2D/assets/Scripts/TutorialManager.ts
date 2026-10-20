import { _decorator, Component, Node, Vec2, Vec3, tween, Tween, Button, RigidBody2D } from 'cc';
import { GameLogic } from './GameLogic';
import { UIManager } from './UIManager';
import { CoinController } from './CoinController';
import { I18n } from './I18n';
import { UITips } from './UI/UITips';
const { ccclass, property } = _decorator;

/** 教程步骤定义 */
export interface TutorialStep {
    /** 提示文字的 i18n key */
    hintKey: string;
    /** 要求拖动的硬币索引（coinGroup.children 中的序号，教程开始时解析为 Node 引用） */
    sourceCoinIndex: number;
    /** 要求击打的目标硬币索引 */
    targetCoinIndex: number;
    /** 是否为最后一步（完成后结束教程） */
    isFinal?: boolean;
}

/** 道具介绍步骤（只展示指示器 + 文字，无需玩家操作） */
export interface IntroStep {
    /** 提示文字的 i18n key */
    hintKey: string;
    /** 指示器目标位置 */
    x: number;
    y: number;
    /** 指示器半径（对应目标大小） */
    radius: number;
}

/** 教程步骤（已解析为 Node 引用） */
interface ResolvedStep {
    hintKey: string;
    sourceCoin: Node;
    targetCoin: Node;
    isFinal: boolean;
}

@ccclass('TutorialManager')
export class TutorialManager extends Component {
    @property(UITips)
    public uiTips:UITips = null;
    @property(Button)
    public btnSkip:Button = null;
    
    // ── 引用（由 GameScene 注入）──
    public gameLogic: GameLogic | null = null;
    public uiManager: UIManager | null = null;

    // ── 教程状态 ──
    private _active: boolean = false;
    private _resolvedSteps: ResolvedStep[] = [];
    private _currentStepIndex: number = 0;
    private _coinSnapshots: { node: Node; x: number; y: number }[] = [];
    private _hitTargetThisTurn: boolean = false;
    private _foulCount: number = 0;
    private _wasLastStep: boolean = false;

    // ── 道具介绍模式 ──
    private _isIntroMode: boolean = false;
    private _introSteps: IntroStep[] = [];
    private _introIndex: number = 0;
    private _introAutoDelay: number = 4;

    // ── UI（编辑器中创建，通过 @property 注入）──

    // ── 手势提示 ──
    private static readonly _tagGesture = 100;
    private _isGestureShowing: boolean = false;

    // ── 闲置提示（从 GameLogic 移入）──
    public idleShowDelay: number = 5;
    private _idleTimer: number = 0;
    private _isClickNodeShowing: boolean = false;
    public isDragging: boolean = false;
    /** 游戏已结束（失败/胜利弹窗显示中），抑制闲置提示 */
    public gameOver: boolean = false;

    // ── 教程生命周期 ──

    /** 开始新手教程 */
    public startTutorial(steps: TutorialStep[]): void {
        this._active = true;
        this._currentStepIndex = 0;

        // 解析索引为 Node 引用（硬币销毁后索引会变，必须用引用）
        const coins = this.gameLogic?.coinGroup?.children ?? [];
        this._resolvedSteps = steps.map(s => ({
            hintKey: s.hintKey,
            sourceCoin: coins[s.sourceCoinIndex],
            targetCoin: coins[s.targetCoinIndex],
            isFinal: s.isFinal ?? false,
        }));

        this._bindSkipButton();
        console.log('[Tutorial] startTutorial, uiTips:', this.uiTips, 'btnSkip:', this.btnSkip);
        this._showHint(this._resolvedSteps[0].hintKey);
        this._showSkipButton();
        this._snapshotPositions();
        this._beginCurrentStep();
    }

    /** 跳过教程 */
    public skipTutorial(): void {
        this._active = false;
        this._isIntroMode = false;
        this._hideGestureHint();
        this._hideTargetIndicator();
        this._hideHint();
        this._hideSkipButton();
        this._clearCoinHighlight();
    }

    /** 开始道具介绍（只展示指示器 + 文字，自动或点击推进） */
    public startIntroTutorial(steps: IntroStep[]): void {
        this._active = true;
        this._isIntroMode = true;
        this._introSteps = steps;
        this._introIndex = 0;

        this._bindSkipButton();
        this._showSkipButton();
        this._showIntroStep();
    }

    /** 介绍模式：点击屏幕推进到下一步 */
    public onIntroClick(): void {
        if (!this._isIntroMode) return;
        this.unscheduleAllCallbacks();
        this._introIndex++;
        if (this._introIndex >= this._introSteps.length) {
            this.skipTutorial();
        } else {
            this._showIntroStep();
        }
    }

    /** 显示当前介绍步骤 */
    private _showIntroStep(): void {
        const step = this._introSteps[this._introIndex];
        if (!step) return;

        // 显示目标指示器
        const indicator = this.uiManager?.targetIndicator;
        if (indicator) {
            indicator.node.setPosition(step.x, step.y, 0);
            indicator.open(step.radius);
        }

        // 显示提示文字
        this._showHint(step.hintKey);

        // 自动推进到下一步
        this.scheduleOnce(() => {
            if (this._isIntroMode) {
                this._introIndex++;
                if (this._introIndex >= this._introSteps.length) {
                    this.skipTutorial();
                } else {
                    this._showIntroStep();
                }
            }
        }, this._introAutoDelay);
    }

    /** 教程是否激活 */
    public isActive(): boolean {
        return this._active;
    }

    /** 当前步骤是否为最后一步 */
    public isFinalStep(): boolean {
        const step = this._resolvedSteps[this._currentStepIndex];
        return step ? step.isFinal : false;
    }

    /** 上一次成功命中时是否为最后一步（在 onTurnSettled 中推进索引前记录） */
    public wasLastStep(): boolean {
        return this._wasLastStep;
    }

    // ── 玩家操作钩子 ──

    /**
     * 玩家开始拖动硬币时调用。
     * 返回 false 表示不允许拖动这枚硬币（CoinController 不响应操作）。
     */
    public onCoinDragStart(coin: Node): boolean {
        if (!this._active) return true;
        // 介绍模式下不允许拖动
        if (this._isIntroMode) return false;
        const step = this._resolvedSteps[this._currentStepIndex];
        if (!step) return true;

        if (coin !== step.sourceCoin) {
            // 不是当前步骤指定的硬币 → 不响应
            return false;
        }

        // 正确的硬币 → 隐藏手势提示和目标指示器，允许拖动
        this._hideGestureHint();
        this._hideTargetIndicator();
        this._hitTargetThisTurn = false;
        this._snapshotPositions();
        return true;
    }

    /** 硬币发射前调用，记录快照 */
    public onCoinLaunched(coin: Node): void {
        // 快照已在 onCoinDragStart 中记录
    }

    /** 硬币碰撞时调用，验证是否击中目标 */
    public onCoinHit(hitCoin: Node): void {
        if (!this._active) return;
        const step = this._resolvedSteps[this._currentStepIndex];
        if (!step) return;

        if (hitCoin === step.targetCoin) {
            this._hitTargetThisTurn = true;
        }
    }

    /**
     * 回合结束时调用，验证结果。
     * 返回 true 表示继续执行正常结算（硬币被打飞消失），false 表示教程已处理（重置位置）。
     */
    public onTurnSettled(): boolean {
        if (!this._active) return true;
        const step = this._resolvedSteps[this._currentStepIndex];
        if (!step) return true;

        const hitCount = this.gameLogic?.coinHitCount ?? 0;
        const fallCount = this.gameLogic?.coinFallCount ?? 0;

        if (this._hitTargetThisTurn && fallCount == 0 && hitCount == 1) {
            // ✅ 正确击中目标 → 继续正常结算（a 硬币被打飞消失）
            this._foulCount = 0;
            // 在推进索引之前，记录当前步是否为最终步
            this._wasLastStep = step.isFinal;
            if (step.isFinal) {
                // 最后一步完成 → 显示完成提示，打飞特效结束后由 processResult 调用 skipTutorial
                this._showHint('tutorial_complete');
            } else {
                // 立即推进步骤索引（让 onCoinDragStart 马上用新步骤的 sourceCoin）
                this._currentStepIndex++;
                // 延迟到打飞动画结束后更新 UI
                this.scheduleOnce(() => {
                    if (this._active) {
                        this._showHint(this._resolvedSteps[this._currentStepIndex].hintKey);
                        this._beginCurrentStep();
                    }
                }, 1.0);
            }
            return true;
        } else {
            // ❌ 失败 → 判断失败原因，提示用户，重置位置
            this._restorePositions();
            this._foulCount++;



            if (fallCount > 0) {
                this._showHint('tutorial_foul_fall');
            } else if (hitCount >= 2) {
                this._showHint('tutorial_foul_multi_hit');
            } else {
                this._showHint('tutorial_miss');
            }

            // 1秒后重新显示原始提示和手势
            this.scheduleOnce(() => {
                if (this._active) {
                    this._showHint(step.hintKey);
                    this._beginCurrentStep();
                }
            }, 2.0);
            return false;
        }
    }

    // ── 步骤管理 ──

    /** 开始当前步骤：高亮硬币 + 显示手势提示 + 目标指示器 */
    private _beginCurrentStep(): void {
        const step = this._resolvedSteps[this._currentStepIndex];
        if (!step) return;

        const { sourceCoin, targetCoin } = step;
        if (!sourceCoin || !sourceCoin.isValid || !targetCoin || !targetCoin.isValid) return;

        // 高亮源硬币
        this._clearCoinHighlight();
        this._highlightCoin(sourceCoin);

        // 显示手势提示
        this._showGestureHint(sourceCoin, targetCoin);

        // 显示目标指示器
        this._showTargetIndicator(targetCoin);
    }

    // ── 手势提示 ──

    /** 显示手指手势提示：从源硬币指向目标反方向，循环动画 */
    private _showGestureHint(sourceCoin: Node, targetCoin: Node): void {
        const clickNode = this.uiManager?.clickNode;
        if (!clickNode || !clickNode.isValid) return;

        // 计算拖拽方向（远离目标硬币）
        const dir = new Vec3();
        Vec3.subtract(dir, sourceCoin.position, targetCoin.position);
        dir.normalize();

        const startPos = new Vec3(sourceCoin.position.x, sourceCoin.position.y, 0);
        const endPos = new Vec3(
            startPos.x + dir.x * 80,
            startPos.y + dir.y * 80,
            0,
        );

        clickNode.setPosition(startPos);
        clickNode.active = true;
        this._isGestureShowing = true;

        Tween.stopAllByTag(TutorialManager._tagGesture);
        tween(clickNode)
            .tag(TutorialManager._tagGesture)
            .call(() => {
                clickNode.setPosition(startPos);
            })
            .to(0.5, { position: endPos }, { easing: 'linear' })
            .delay(0.5)
            .union()
            .repeatForever()
            .start();
    }

    /** 隐藏手势提示 */
    private _hideGestureHint(): void {
        const clickNode = this.uiManager?.clickNode;
        if (clickNode && clickNode.isValid) {
            Tween.stopAllByTag(TutorialManager._tagGesture);
            clickNode.active = false;
        }
        this._isGestureShowing = false;
    }

    // ── 目标指示器 ──

    /** 显示目标指示器，对准目标硬币 */
    private _showTargetIndicator(targetCoin: Node): void {
        const indicator = this.uiManager?.targetIndicator;
        if (!indicator) return;
        indicator.node.setPosition(targetCoin.position);
        indicator.open(this.gameLogic?.coinRadius ?? 32);
    }

    /** 隐藏目标指示器 */
    private _hideTargetIndicator(): void {
        this.uiManager?.targetIndicator?.close();
    }

    // ── 硬币高亮 ──

    /** 高亮指定硬币（脉冲绿色） */
    private _highlightCoin(coin: Node): void {
        const ctrl = coin.getComponent(CoinController);
        if (ctrl) {
            ctrl.showIndicator(true);
        }
    }

    /** 清除所有硬币高亮 */
    private _clearCoinHighlight(): void {
        const coins = this.gameLogic?.coinGroup?.children ?? [];
        for (const coin of coins) {
            const ctrl = coin.getComponent(CoinController);
            if (ctrl) {
                ctrl.showIndicator(false);
            }
        }
    }

    // ── 位置快照与重置 ──

    /** 记录所有硬币位置快照 */
    private _snapshotPositions(): void {
        this._coinSnapshots = [];
        const coins = this.gameLogic?.coinGroup?.children ?? [];
        for (const coin of coins) {
            this._coinSnapshots.push({
                node: coin,
                x: coin.position.x,
                y: coin.position.y,
            });
        }
    }

    /** 恢复硬币位置到快照 */
    private _restorePositions(): void {
        for (const snap of this._coinSnapshots) {
            if (snap.node && snap.node.isValid) {
                snap.node.setPosition(snap.x, snap.y, 0);
                // 清除速度
                const rb = snap.node.getComponent(RigidBody2D);
                if (rb) {
                    rb.linearVelocity = new Vec2(0, 0);
                    rb.angularVelocity = 0;
                }
            }
        }
        // 重置游戏状态
        this.gameLogic?.waitingPlayerOperation();
    }

    // ── UI 管理 ──

    /** 绑定跳过按钮点击事件 */
    private _bindSkipButton(): void {
        if (this.btnSkip) {
            this.btnSkip.node.on(Button.EventType.CLICK, () => {
                this.skipTutorial();
            }, this);
        }
    }

    /** 显示提示文字（传入 i18n key） */
    private _showHint(key: string): void {
        const text = I18n.t(key);
        console.log('[Tutorial] _showHint:', key, '→', text, 'uiTips:', this.uiTips);
        this.uiTips?.open(text);
    }

    /** 隐藏提示文字 */
    private _hideHint(): void {
        this.uiTips?.close();
    }

    /** 显示跳过按钮 */
    private _showSkipButton(): void {
        if (this.btnSkip) {
            this.btnSkip.node.active = true;
        }
    }

    /** 隐藏跳过按钮 */
    private _hideSkipButton(): void {
        if (this.btnSkip) {
            this.btnSkip.node.active = false;
        }
    }

    // ── 闲置提示（从 GameLogic 移入）──

    /** 重置空闲计时器（玩家有任何操作时调用） */
    public resetIdleTimer(): void {
        this._idleTimer = 0;
        this._hideClickNode();
    }

    /** 获取手势提示方向（闲置时自动查找最近目标） */
    private _getGestureHint(): { source: Node; direction: Vec3 } | null {
        const coins = this.gameLogic?.coinGroup?.children ?? [];
        if (coins.length < 2) return null;

        const source = coins[0];
        if (!source || !source.isValid) return null;

        let closestTarget: Node | null = null;
        let minDist = Infinity;
        for (const coin of coins) {
            if (!coin || !coin.isValid || coin === source) continue;
            const dist = Vec3.distance(source.position, coin.position);
            if (dist < minDist) {
                minDist = dist;
                closestTarget = coin;
            }
        }
        if (!closestTarget) return null;

        const dir = new Vec3();
        Vec3.subtract(dir, source.position, closestTarget.position);
        dir.normalize();
        return { source, direction: dir };
    }

    /** 显示闲置手势提示 */
    private _showClickNode(): void {
        const clickNode = this.uiManager?.clickNode;
        if (!clickNode || !clickNode.isValid) return;

        const hint = this._getGestureHint();
        if (!hint) {
            clickNode.active = false;
            return;
        }

        const { source, direction } = hint;
        const startPos = new Vec3(source.position.x, source.position.y, 0);
        const endPos = new Vec3(
            startPos.x + direction.x * 80,
            startPos.y + direction.y * 80,
            0,
        );

        clickNode.setPosition(startPos);
        clickNode.active = true;
        this._isClickNodeShowing = true;

        Tween.stopAllByTag(TutorialManager._tagGesture);
        tween(clickNode)
            .tag(TutorialManager._tagGesture)
            .call(() => {
                clickNode.setPosition(startPos);
            })
            .to(0.5, { position: endPos }, { easing: 'linear' })
            .delay(0.5)
            .union()
            .repeatForever()
            .start();
    }

    /** 隐藏闲置手势提示 */
    private _hideClickNode(): void {
        const clickNode = this.uiManager?.clickNode;
        if (clickNode && clickNode.isValid) {
            Tween.stopAllByTag(TutorialManager._tagGesture);
            clickNode.active = false;
        }
        this._isClickNodeShowing = false;
        this._hideTargetIndicator();
    }

    // ── 帧更新 ──

    update(deltaTime: number) {
        // 闲置提示：玩家长时间无操作时显示 clickNode（教程模式下由手势提示接管）
        if (this._active) return;
        if (this.gameOver) return;
        if (this.isDragging || this._isClickNodeShowing) return;

        // 只在等待操作阶段显示闲置提示
        this._idleTimer += deltaTime;
        if (this._idleTimer >= this.idleShowDelay) {
            this._showClickNode();
        }
    }
}
