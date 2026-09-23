import { _decorator, Button, Component, director, Node } from 'cc';
import { UIMessageBox } from '../UI/UIMessageBox';
const { ccclass, property } = _decorator;

@ccclass('PVPScene')
export class PVPScene extends Component {
    @property(Button)
    public btnMatch: Button | null = null;
    @property(Button)
    public btnCreate: Button | null = null;
    @property(Button)
    public btnJoin: Button | null = null;
    @property(UIMessageBox)
    public messageBox: UIMessageBox | null = null;

    onLoad() {
        this.btnMatch.node.on(Button.EventType.CLICK, () => {
            console.log('Match button clicked');
        }, this);
        this.btnCreate.node.on(Button.EventType.CLICK, () => {
            console.log('Create button clicked');
        }, this);
        this.btnJoin.node.on(Button.EventType.CLICK, () => {
            console.log('Join button clicked');
        }, this);
    }

    start(){
        this.messageBox.open("暂不支持对战模式", () => {
            director.loadScene('main');
        });
    }
}

