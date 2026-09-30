import { _decorator, Button, Component, EventHandler, Label, Node, director } from 'cc';
import { Leaderboard } from './Leaderboard';
import { UIWin } from './UI/UIWin';
import { UIFail } from './UI/UIFail';
import { UIRank } from './UI/UIRank';
import { UIConfirm } from './UI/UIConfirm';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node)
    public gameOverPanel:Node = null;
    @property(Button)
    public buttonRetry:Button = null;
    @property(Label)
    public labelRank:Label = null;
    @property(Label)
    public labelScore:Label = null;
    @property(Label)
    public labelLevel:Label = null;
    @property(Node)
    public clickNode:Node = null;
    @property(Button)
    public buttonBack:Button = null;

    @property(UIWin)
    public uiWin:UIWin = null;
    @property(UIFail)
    public uiFail:UIFail = null;
    @property(UIRank)
    public uiRank:UIRank = null;

    @property(Node)
    public uiLevelPanel:Node = null;
    @property(Node)
    public uiScorePanel:Node = null;

    @property(UIConfirm)
    public uiConfirm:UIConfirm = null;

    public onRetry:()=>void;
    public onBack:()=>void;

    start() {
        this.buttonRetry.node.on(Node.EventType.TOUCH_START, ()=>{this.onRetry();});
        if (this.buttonBack) {
            this.buttonBack.node.on(Button.EventType.CLICK, () => {
                if (this.onBack)this.onBack();
            }, this);
        }
    }

    public setScore(score:number){
        this.labelScore.string = score.toString();
    }

    public setLevel(level:number){
        this.labelLevel.string = level.toString();
    }

    /** 显示最终胜利面板 */
    public showVictory(show: boolean): void {
        this.gameOverPanel.active = show;
        if (show) {
            const label = this.gameOverPanel.getComponentInChildren(Label);
            if (label) label.string = '最终胜利！';
        }
    }
}
