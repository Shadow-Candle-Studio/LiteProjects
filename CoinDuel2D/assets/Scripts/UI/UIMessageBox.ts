import { _decorator, Button, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIMessageBox')
export class UIMessageBox extends Component {
   @property(Label)
    public lableContent: Label | null = null;
    @property(Button)
    public btnOk: Button | null = null;

    private _onCloseCallback: () => void = null;

    onLoad() {
        this.btnOk.node.on(Button.EventType.CLICK, () => {
            if (this._onCloseCallback) {
                this._onCloseCallback();
            }
            this.close();
        }, this);

    }

    public open(content: string, OnClose: () => void) {
        if (this.lableContent) {
            this.lableContent.string = content;
        }
        this.node.active = true;
        this._onCloseCallback = OnClose;
    }

    public close() {
        this.node.active = false;
        this._onCloseCallback = null;
    }
}

