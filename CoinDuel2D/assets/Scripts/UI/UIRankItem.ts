import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIRankItem')
export class UIRankItem extends Component {
    private labelScore:Label = null;
    private labelTime:Label = null;
    onLoad() {  
        this.labelScore = this.node.getChildByName("Score").getComponent(Label);
        this.labelTime = this.node.getChildByName("Time").getComponent(Label);
    }
    public init(){
        this.labelScore.string = "";
        this.labelTime.string = "";
    }
    public setData(score:number, time:number){
        if (this.labelScore) this.labelScore.string = score.toString();
        if (this.labelTime) {
            const min = Math.floor(time / 60);
            const sec = time % 60;
            this.labelTime.string = `${min}:${sec < 10 ? '0' : ''}${sec}`;
        }
    }
}

