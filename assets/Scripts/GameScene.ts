import { _decorator, Component, instantiate, Node, Prefab } from 'cc';
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

    private level:number = 1;

    start() {
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
        this.uiManager.setScore(0);
        this.startNewRound();

        this.uiManager.onRetry = ()=>{
            this.level = 1;
            this.uiManager.setLevel(this.level);
            this.uiManager.showGameOver(false);
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

        // 随机生成缺口位置并绘制绿色桌面 + 黑色缺口
        this.tableController.generateRandomGapPosition();
        this.gameLogic.gapPosition = this.tableController.gapPosition;
        this.tableController.drawTableWithGap();

        // 在矩形桌面（避开缺口区域）内随机生成硬币位置
        let coinCount = 6;
        let coinPositions = this.roundManager.newRound(
            this.tableController.tableWidth,
            this.tableController.tableHeight,
            this.gameLogic.coinRadius,
            coinCount,
            this.tableController.gapPosition,
            this.tableController.gapWidth,
            this.tableController.gapHeight,
        );

        // 根据coin数量和位置生成coin
        for (let i=0; i<coinCount; i++){
            let coin = instantiate(this.coinPrefab);
            this.gameLogic.coinGroup.addChild(coin);
            coin.setPosition(coinPositions[i]);
            // 注入 GameLogic 引用，用于弹射后通知状态切换
            let ctrl = coin.addComponent(CoinController);
            ctrl.setGameLogic(this.gameLogic);
        }
        this.gameLogic.waitingPlayerOperation();
    }

    private clearCoins(){
        this.gameLogic.coinGroup.removeAllChildren();
    }

}


