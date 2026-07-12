import { _decorator, Component, instantiate, Node, Prefab, Input, input, KeyCode, EventKeyboard, UITransform, CircleCollider2D } from 'cc';
import { RoundManager } from './RoundManager';
import { GameLogic } from './GameLogic';
import { CoinController } from './CoinController';
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
    }
}


