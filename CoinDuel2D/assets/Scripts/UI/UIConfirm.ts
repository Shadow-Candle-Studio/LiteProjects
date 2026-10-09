import { _decorator, Button, Component, Label, Node } from 'cc';
import { I18n } from '../I18n';
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
        // 翻译按钮文字
        this._translateButtons();

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

    /** 翻译按钮内的 Label 文字 */
    private _translateButtons(): void {
        const btnOkLabel = this.btnOk?.node.getComponentInChildren(Label);
        if (btnOkLabel) {
            const key = btnOkLabel.string === '确定' ? 'ui_confirm' : null;
            if (key) btnOkLabel.string = I18n.t(key);
        }
        const btnCancelLabel = this.btnCancel?.node.getComponentInChildren(Label);
        if (btnCancelLabel) {
            const key = btnCancelLabel.string === '取消' ? 'ui_cancel' : null;
            if (key) btnCancelLabel.string = I18n.t(key);
        }
    }

}

