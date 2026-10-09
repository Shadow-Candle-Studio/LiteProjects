import { _decorator, Button, Component, Label, Node } from 'cc';
import { I18n } from '../I18n';
const { ccclass, property } = _decorator;

@ccclass('UIMessageBox')
export class UIMessageBox extends Component {
   @property(Label)
    public lableContent: Label | null = null;
    @property(Button)
    public btnOk: Button | null = null;

    private _onCloseCallback: () => void = null;

    onLoad() {
        // 翻译按钮文字
        this._translateButtons();

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

    /** 翻译按钮内的 Label 文字 */
    private _translateButtons(): void {
        const btnOkLabel = this.btnOk?.node.getComponentInChildren(Label);
        if (btnOkLabel) {
            const key = btnOkLabel.string === '确定' ? 'ui_confirm' : null;
            if (key) btnOkLabel.string = I18n.t(key);
        }
    }
}

