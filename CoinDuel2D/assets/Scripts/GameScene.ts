import { _decorator, Component, instantiate, Node, Prefab, Input, input, KeyCode, EventKeyboard, UITransform, CircleCollider2D, resources, SpriteFrame, AudioClip, Color } from 'cc';
import { CoinController } from './CoinController';
import { GameLogic } from './GameLogic';
import { RoundManager } from './RoundManager';
import { UIManager } from './UIManager';
import { TableController } from './TableController';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

@ccclass('GameScene')
export class GameScene extends Component {
    @property(RoundManager)
    public roundManager:RoundManager = null;
    @property(GameLogic)
    public gameLogic:GameLogic = null;
    @property(Prefab)
    public coinPrefab:Prefab = null;
    @property(UIManager)
    public uiManager:UIManager = null;
    @property({ tooltip: "开局使用的硬币 id（config.json 中 coins 的 key，默认为 1）" })
    public coinId: string = "1";

    private tableController: TableController = null!;
    private _debugPanel: Node | null = null;
    /** 缺口宽度基数（从 TableController 面板值快照） */
    private _baseGapWidth: number = 80;
    /** 缓存的 config.json 数据 */
    private _coinsConfig: any = null;

    private level:number = 1;

    start() {
        // Q 键开关 DebugPanel（提前注册，即使面板初始 inactive 也能生效）
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this._debugPanel = this.node.parent?.getChildByName('UIManager')?.getChildByName('DebugPanel') ?? null;

        // 在 Table 节点上挂载桌面渲染控制器
        const tableNode = this.node.parent?.getChildByName('Table');
        if (tableNode) {
            this.tableController = tableNode.getComponent(TableController)!
                               || tableNode.addComponent(TableController);
        } else {
            console.warn('未找到 Table 节点，动态创建');
            const newNode = new Node('Table');
            newNode.layer = 1; // WORLD
            this.node.parent?.addChild(newNode);
            this.tableController = newNode.addComponent(TableController);
        }

        this.level = 1;
        this.uiManager.setLevel(this.level);
        this.uiManager.showGameOver(false);
        this.gameLogic.score = 0;
        this.uiManager.setScore(0);

        // 同步围墙厚度到 GameLogic（反弹边界用）
        this.gameLogic.wallThickness = this.tableController.wallThickness;

        // 快照缺口宽度基数
        this._baseGapWidth = this.tableController.gapWidth;

        // 启动时读取全局 config.json 配置
        this._loadCoinsConfig();

        this.startNewRound();

        this.uiManager.onRetry = ()=>{
            this.level = 1;
            this.uiManager.setLevel(this.level);
            this.uiManager.showGameOver(false);
            this.gameLogic.score = 0;
            this.uiManager.setScore(0);
            this.startNewRound();
        };

        this.gameLogic.onGameOver = () => {
            this.uiManager.showGameOver(true);
        };

        this.gameLogic.onScoreUpdate = (score: number) => {
            this.uiManager.setScore(score);
        };

        this.gameLogic.onGameWin = () => {
            this.level ++;
            this.uiManager.setLevel(this.level);
            // 随机进入下一关（保留分数，重置硬币布局）
            this.startNewRound();
        };
    }

    // 开始新的一局
    private startNewRound(){
        // 删除现存硬币
        this.clearCoins();

        // 关卡递增缺口宽度
        const inc = this.tableController.gapWidthIncrement;
        this.tableController.gapWidth = this._baseGapWidth + this.level * inc;
        // 缺口数量 = ((level - 1) % 4) + 1，每边最多一个
        const gapCount = ((this.level - 1) % 4) + 1;
        this.tableController.generateRandomGaps(gapCount);
        // 同步缺口数据到 GameLogic（反弹跳过 + 侧边反弹用）
        this.gameLogic.gaps = this.tableController.gaps.slice();
        this.gameLogic.gapWidth = this.tableController.gapWidth;

        // 绘制绿色桌面 + 围墙（含缺口）
        this.tableController.drawTable();
        let coinCount = 6;
        let coinPositions = this.roundManager.newRound(
            this.tableController.tableWidth,
            this.tableController.tableHeight,
            this.gameLogic.coinRadius,
            coinCount,
            this.gameLogic.wallThickness,
        );

        // 根据coin数量和位置生成coin
        const radius = this.gameLogic.coinRadius;
        for (let i=0; i<coinCount; i++){
            let coin = instantiate(this.coinPrefab);
            this.gameLogic.coinGroup.addChild(coin);
            coin.setPosition(coinPositions[i]);
            // 按 coinRadius 设置外观尺寸和碰撞器
            coin.setScale(1, 1, 1);
            const ut = coin.getComponent(UITransform);
            if (ut) ut.setContentSize(radius * 2, radius * 2);
            const cc = coin.getComponent(CircleCollider2D);
            if (cc) cc.radius = radius;
            // 注入 GameLogic 引用，用于弹射后通知状态切换
            let ctrl = coin.addComponent(CoinController);
            ctrl.setGameLogic(this.gameLogic);
        }
        this.gameLogic.waitingPlayerOperation();

        // 开局按指定 coin id 应用外观（配置已加载时）
        if (this._coinsConfig) {
            this._applyCoinConfig(this.coinId);
        }
    }

    private clearCoins(){
        this.gameLogic.coinGroup.removeAllChildren();
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    private _onKeyDown(event: EventKeyboard) {
        if (event.keyCode === KeyCode.KEY_Q && this._debugPanel) {
            this._debugPanel.active = !this._debugPanel.active;
        }

        // 数字键 1-9：读取 config.json 配置并切换所有硬币贴图/音效
        if (event.keyCode >= KeyCode.DIGIT_1 && event.keyCode <= KeyCode.DIGIT_9) {
            const keyIndex = event.keyCode - KeyCode.DIGIT_1 + 1;
            this._applyCoinConfig(keyIndex.toString());
        }
    }

    /** 启动时读取全局 config.json，缓存数据并应用全局颜色 */
    private _loadCoinsConfig(): void {
        resources.load('config', (err: any, asset: any) => {
            if (err) {
                console.warn('[GameScene] 加载 config.json 失败:', err);
                return;
            }
            this._coinsConfig = asset.json ?? {};

            // 应用全局颜色配置
            const parseHex = (hex: string) => new Color(
                parseInt(hex.slice(1, 3), 16),
                parseInt(hex.slice(3, 5), 16),
                parseInt(hex.slice(5, 7), 16), 255,
            );
            const srcHex = this._coinsConfig.source_color as string | undefined;
            if (srcHex?.length >= 7) CoinController.sourceColor = parseHex(srcHex);
            const tgtHex = this._coinsConfig.target_color as string | undefined;
            if (tgtHex?.length >= 7) CoinController.targetColor = parseHex(tgtHex);

            // 加载拖拽音效到 SoundManager
            const sm = SoundManager.instance;
            if (sm) {
                const loadSfx = (field: string) => {
                    const base = (this._coinsConfig[field] as string)?.replace(/\.[^/.]+$/, '');
                    if (!base) return;
                    resources.load(base, AudioClip, (sfxErr: any, clip: AudioClip) => {
                        if (!sfxErr && clip) {
                            if (field === 'drag_increase_sfx') sm.dragIncrease = clip;
                            else if (field === 'drag_decrease_sfx') sm.dragDecrease = clip;
                            else if (field === 'drag_release_sfx') sm.dragRelease = clip;
                        }
                    });
                };
                loadSfx('drag_increase_sfx');
                loadSfx('drag_decrease_sfx');
                loadSfx('drag_release_sfx');
            }

            // 全局配置加载完成，按开局 coinId 应用硬币外观
            this._applyCoinConfig(this.coinId);
        });
    }

    /**
     * 使用缓存的 config.json 配置，根据 key 查找并应用到场上所有硬币
     * @param key config.json 中的硬币类型标识，如 "1", "2"
     */
    private _applyCoinConfig(key: string): void {
        const asset = this._coinsConfig;
        if (!asset) {
            console.warn('[GameScene] config.json 尚未加载完成');
            return;
        }

        const coinsData = asset.coins;
        if (!coinsData) {
            console.warn('[GameScene] config.json 格式错误：缺少 coins 字段');
            return;
        }

        const config = coinsData[key] as {
            texture?: string;
            idle_texture?: string;
            aim_texture?: string;
            shot_texture?: string;
            hitted_texture?: string;
            shot_sfx?: string;
            hitted_sfx?: string;
        } | undefined;
        if (!config) {
            console.log(`[GameScene] config.json 中未找到 key "${key}" 的配置，不做处理`);
            return;
        }

        console.log(`[GameScene] 切换硬币为 ${key} 号外观（默认/空闲/拖拽/发射/被打击 贴图 + 发射/被打击 音效）`);

        // 并行加载各状态贴图（SpriteFrame 子资源）和音效，全部就绪后应用到所有硬币
        let defaultFrame: SpriteFrame | null = null;
        let idleFrame: SpriteFrame | null = null;
        let aimFrame: SpriteFrame | null = null;
        let shotFrame: SpriteFrame | null = null;
        let hittedFrame: SpriteFrame | null = null;
        let shotClip: AudioClip | null = null;
        let hittedClip: AudioClip | null = null;
        let total = 0;
        let loaded = 0;

        const applyToCoins = () => {
            loaded++;
            if (loaded < total) return;
            for (const coin of this.gameLogic.coinGroup.children) {
                const ctrl = coin.getComponent(CoinController);
                if (ctrl) {
                    ctrl.setAppearance({
                        defaultFrame,
                        idleFrame,
                        aimFrame,
                        shotFrame,
                        hittedFrame,
                        shotSfxClip: shotClip,
                        hittedSfxClip: hittedClip,
                        typeKey: key,
                    });
                }
            }
        };

        // 图片资源需指定 SpriteFrame 子资源路径
        const loadFrame = (field: keyof typeof config, assign: (f: SpriteFrame) => void) => {
            const file = config[field];
            if (!file) return;
            total++;
            const base = file.replace(/\.[^/.]+$/, '');
            resources.load(base + '/spriteFrame', SpriteFrame, (err: any, sf: SpriteFrame) => {
                if (!err && sf) {
                    assign(sf);
                } else {
                    console.warn(`[GameScene] 加载贴图 ${file} 失败:`, err);
                }
                applyToCoins();
            });
        };
        const loadClip = (field: keyof typeof config, assign: (c: AudioClip) => void) => {
            const file = config[field];
            if (!file) return;
            total++;
            const base = file.replace(/\.[^/.]+$/, '');
            resources.load(base, AudioClip, (err: any, clip: AudioClip) => {
                if (!err && clip) {
                    assign(clip);
                } else {
                    console.warn(`[GameScene] 加载音效 ${file} 失败:`, err);
                }
                applyToCoins();
            });
        };

        loadFrame('texture', f => { defaultFrame = f; });
        loadFrame('idle_texture', f => { idleFrame = f; });
        loadFrame('aim_texture', f => { aimFrame = f; });
        loadFrame('shot_texture', f => { shotFrame = f; });
        loadFrame('hitted_texture', f => { hittedFrame = f; });
        loadClip('shot_sfx', c => { shotClip = c; });
        loadClip('hitted_sfx', c => { hittedClip = c; });

        // 无任何可加载资源时也会应用一次（保持当前贴图，仅记录类型 key）
        applyToCoins();
    }
}


