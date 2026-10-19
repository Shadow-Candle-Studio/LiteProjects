import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UITips')
export class UITips extends Component {
    @property(Label)
    public message:Label = null;

    public open(msg:string){
        if (this.message) {
            this.message.string = msg;
            this.node.active = true;
        }
    }
    public close(){
        this.node.active = false;
    }
}

