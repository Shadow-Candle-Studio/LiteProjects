import { _decorator, Button, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIFail')
export class UIFail extends Component {
    @property(Label)
    public level:Label = null;
    @property(Label)
    public score:Label = null;
    @property(Label)
    public time:Label = null;
    @property(Node)
    public btnHome:Node = null;
    @property(Node)
    public btnRank:Node = null;
    @property(Node)
    public btnRetry:Node = null;

    public onBtnHomeClick:()=>void = null;
    public onBtnRankClick:()=>void = null;
    public onBtnRetryClick:()=>void = null;

    onLoad() {
        // 绑定按钮点击事件
        if (this.btnHome) {
            this.btnHome.on(Button.EventType.CLICK, () => {
                this.close();
                if (this.onBtnHomeClick) this.onBtnHomeClick();
            }, this);
        }
        if (this.btnRank) {
            this.btnRank.on(Button.EventType.CLICK, () => {
                if (this.onBtnRankClick) this.onBtnRankClick();
            }, this);
        }
        if (this.btnRetry) {
            this.btnRetry.on(Button.EventType.CLICK, () => {
                this.close();
                if (this.onBtnRetryClick) this.onBtnRetryClick();
            }, this);
        }
    }

    public show(level:number, score:number, time:number){
        if (this.level) this.level.string = level.toString();
        if (this.score) this.score.string = score.toString();
        if (this.time) this.time.string = time.toString();
        this.node.active = true;
    }

    public close(){
        this.node.active = false;
    }
}

