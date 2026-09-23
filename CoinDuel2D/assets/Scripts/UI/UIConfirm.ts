import { _decorator, Button, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIConfirm')
export class UIConfirm extends Component {
    @property(Label)
    public lableContent: Label | null = null;
    @property(Button)
    public btnOk: Button | null = null;
    @property(Button)
    public btnCancel: Button | null = null;

    private _onResultCallback: (ok:boolean) => void = null;

    onLoad() {
        this.btnOk.node.on(Button.EventType.CLICK, () => {
            
            if (this._onResultCallback) {
                this._onResultCallback(true);
            }
            this.close();
        }, this);
        this.btnCancel.node.on(Button.EventType.CLICK, () => {
            
            if (this._onResultCallback) {
                this._onResultCallback(false);
            }
            this.close();
        }, this);
    }

    public open(content: string, OnResult: (ok:boolean) => void) {
        if (this.lableContent) {
            this.lableContent.string = content;
        }
        this.node.active = true;
        this._onResultCallback = OnResult;
    }

    public close() {
        this.node.active = false;
        this._onResultCallback = null;
    }

}

