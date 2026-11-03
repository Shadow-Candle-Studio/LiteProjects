import { _decorator, Button, Color, Component, EventHandler, Label, Node, Tween, UIOpacity, UITransform, Vec3, director, tween } from 'cc';
import { Leaderboard } from './Leaderboard';
import { I18n } from './I18n';
import { UIWin } from './UI/UIWin';
import { UIFail } from './UI/UIFail';
import { UIRank } from './UI/UIRank';
import { UIConfirm } from './UI/UIConfirm';
import { UITips } from './UI/UITips';
import { TargetIndicator } from './Effects/TargetIndicator';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Label)
    public labelScore:Label = null;
    @property(Label)
    public labelLevel:Label = null;
    @property(Label)
    public labelCoinsLeft: Label = null;
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

    @property(TargetIndicator)
    public targetIndicator:TargetIndicator = null;

    public onBack:()=>void;
    private _shownScore = 0;

    start() {
        if (this.buttonBack) {
            this.buttonBack.node.on(Button.EventType.CLICK, () => {
                if (this.onBack)this.onBack();
            }, this);
        }
    }

    public setScore(score: number, multiplier: number = 1): void {
        const gain = score - this._shownScore;
        this._shownScore = score;
        const shown = Number.isInteger(score) ? String(score) : score.toFixed(1);
        const rate = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
        if (!this.labelScore) return;
        this.labelScore.string = multiplier > 1 ? `${shown}  x${rate}` : shown;
        this.labelScore.color = multiplier > 1
            ? new Color(255, 214, 90, 255)
            : new Color(255, 255, 255, 255);
        if (gain > 0) this._popScore(gain);
    }

    public setLevel(level:number){
        this.labelLevel.string = level.toString();
    }

    public setCoinsLeft(count: number): void {
        const label = this.labelCoinsLeft;
        if (!label) return;
        label.string = `剩餘: ${count}`;
        const lastTwo = count > 0 && count <= 2;
        label.color = lastTwo ? new Color(255, 214, 90, 255) : new Color(255, 255, 255, 255);
        label.fontSize = lastTwo ? 28 : 24;
    }

    /** 加分時分數彈一下，並浮出這次拿到的點數。 */
    private _popScore(gain: number): void {
        const scoreNode = this.labelScore?.node;
        if (!scoreNode) return;
        Tween.stopAllByTarget(scoreNode);
        scoreNode.setScale(1.22, 1.22, 1);
        tween(scoreNode).to(0.16, { scale: new Vec3(1, 1, 1) }).start();

        const host = scoreNode.parent;
        if (!host) return;
        const floater = new Node('ScoreGain');
        floater.layer = host.layer;
        host.addChild(floater);
        floater.setPosition(scoreNode.position.x + 36, scoreNode.position.y, 0);
        const ui = floater.addComponent(UITransform);
        ui.setContentSize(90, 32);
        const label = floater.addComponent(Label);
        label.string = Number.isInteger(gain) ? `+${gain}` : `+${gain.toFixed(1)}`;
        label.fontSize = 22;
        label.lineHeight = 24;
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.color = gain > 1 ? new Color(255, 214, 90, 255) : new Color(255, 255, 255, 255);
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 200);
        label.outlineWidth = 2;
        const opacity = floater.addComponent(UIOpacity);
        const rise = new Vec3(floater.position.x, floater.position.y + 26, 0);
        tween(floater).to(0.42, { position: rise }).start();
        tween(opacity)
            .delay(0.12)
            .to(0.3, { opacity: 0 })
            .call(() => { if (floater.isValid) floater.destroy(); })
            .start();
    }

}
