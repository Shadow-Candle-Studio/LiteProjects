import { _decorator, Component, Label } from 'cc';
import { I18n } from './I18n';
const { ccclass, property } = _decorator;

/**
 * 挂在 Label 节点上，在编辑器中填写 key，游戏启动时自动翻译。
 * 也可以通过 apply() 手动刷新（比如运行时切换语言）。
 */
@ccclass('I18nLabel')
export class I18nLabel extends Component {
    @property({ tooltip: 'I18n 翻译 key（对应 JSON 中的键名）' })
    public key: string = '';

    start() {
        this.apply();
    }

    /** 应用翻译 */
    public apply() {
        const label = this.getComponent(Label);
        if (label && this.key) {
            label.string = I18n.t(this.key);
        }
    }
}