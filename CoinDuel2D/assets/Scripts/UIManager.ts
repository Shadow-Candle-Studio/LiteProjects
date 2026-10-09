import { _decorator, Button, Component, EventHandler, Label, Node, director } from 'cc';
import { Leaderboard } from './Leaderboard';
import { I18n } from './I18n';
import { UIWin } from './UI/UIWin';
import { UIFail } from './UI/UIFail';
import { UIRank } from './UI/UIRank';
import { UIConfirm } from './UI/UIConfirm';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
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

    public onBack:()=>void;

    start() {
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
}
