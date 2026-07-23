import { _decorator, Component, instantiate, Node, Prefab, Input, input, KeyCode, EventKeyboard, UITransform, CircleCollider2D, resources, SpriteFrame, AudioClip } from 'cc';
import { CoinController } from './CoinController';
import { GameLogic } from './GameLogic';
import { RoundManager } from './RoundManager';
import { UIManager } from './UIManager';
import { TableController } from './TableController';
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

    private tableController: TableController = null!;
    private _debugPanel: Node | null = null;
    /** 缺口宽度基数（从 TableController 面板值快照） */
    private _baseGapWidth: number = 80;

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

        // 数字键 1-9：读取 coins.json 配置并切换所有硬币贴图/音效
        if (event.keyCode >= KeyCode.DIGIT_1 && event.keyCode <= KeyCode.DIGIT_9) {
            const keyIndex = event.keyCode - KeyCode.DIGIT_1 + 1;
            this._applyCoinConfig(keyIndex.toString());
        }
    }

    /**
     * 读取 coins.json，根据 key 查找对应硬币配置并应用到场上所有硬币
     * @param key coins.json 中的硬币类型标识，如 "1", "2"
     */
    private _applyCoinConfig(key: string): void {
        resources.load('coins', (err: any, asset: any) => {
            if (err) {
                console.warn('[GameScene] 加载 coins.json 失败:', err);
                return;
            }

            const coinsData = asset.json?.coins;
            if (!coinsData) {
                console.warn('[GameScene] coins.json 格式错误：缺少 coins 字段');
                return;
            }

            const config = coinsData[key] as { texture?: string; hit_sfx?: string } | undefined;
            if (!config) {
                console.log(`[GameScene] coins.json 中未找到 key "${key}" 的配置，不做处理`);
                return;
            }

            const textureFile = config.texture;
            const hitSfxFile = config.hit_sfx;
            if (!textureFile) {
                console.warn(`[GameScene] key "${key}" 缺少 texture 字段`);
                return;
            }

            // 去除扩展名用于 resources.load
            const texBaseName = textureFile.replace(/\.[^/.]+$/, '');
            const sfxBaseName = hitSfxFile ? hitSfxFile.replace(/\.[^/.]+$/, '') : null;

            console.log(`[GameScene] 切换硬币贴图为 ${textureFile}，碰撞音效为 ${hitSfxFile || '默认'}`);

            // 并行加载贴图（SpriteFrame 子资源）和音效，然后应用到所有硬币
            let loadedSprite: SpriteFrame | null = null;
            let loadedClip: AudioClip | null = null;
            let pending = 1 + (sfxBaseName ? 1 : 0);

            const applyToCoins = () => {
                if (--pending > 0) return;
                for (const coin of this.gameLogic.coinGroup.children) {
                    const ctrl = coin.getComponent(CoinController);
                    if (ctrl) {
                        ctrl.setAppearance(loadedSprite, loadedClip, key);
                    }
                }
            };

            // 图片资源需指定 SpriteFrame 子资源路径
            resources.load(texBaseName + '/spriteFrame', SpriteFrame, (errTex: any, spriteFrame: SpriteFrame) => {
                if (!errTex && spriteFrame) {
                    loadedSprite = spriteFrame;
                } else {
                    console.warn(`[GameScene] 加载贴图 ${textureFile} 失败:`, errTex);
                }
                applyToCoins();
            });

            if (sfxBaseName) {
                resources.load(sfxBaseName, AudioClip, (errSfx: any, clip: AudioClip) => {
                    if (!errSfx && clip) {
                        loadedClip = clip;
                    } else {
                        console.warn(`[GameScene] 加载音效 ${hitSfxFile} 失败:`, errSfx);
                    }
                    applyToCoins();
                });
            } else {
                applyToCoins();
            }
        });
    }
}


