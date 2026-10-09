import { _decorator, Button, Component, director, Node, Label } from 'cc';
import { LevelManager } from '../LevelManager';
import { SoundManager } from '../SoundManager';
import { I18n } from '../I18n';
const { ccclass, property } = _decorator;

@ccclass('MainScene')
export class MainScene extends Component {
    @property(Button)
    public btnLevels: Button | null = null;
    @property(Button)
    public btnTop: Button | null = null;
    @property(Button)
    public btnPVP: Button | null = null;

    start() {
        this.btnLevels.node.on(Button.EventType.CLICK, () => {
            director.loadScene('levels');
        }, this);
        this.btnTop.node.on(Button.EventType.CLICK, () => {
            LevelManager.setCurrent(null);
            director.loadScene('game');
        }, this);
        this.btnPVP.node.on(Button.EventType.CLICK, () => {
            director.loadScene('pvp');
        }, this);
        SoundManager.instance.stopBGM();

        I18n.init(() => {
            this._translateLabels();
        });
    }

    /** 翻译主菜单场景中的 Label */
    private _translateLabels(): void {
        const scene = director.getScene();
        if (!scene) return;

        const textMap: Record<string, string> = {
            '闯关模式': 'main_level_mode',
            '天梯模式': 'main_ladder_mode',
            '对战模式': 'main_pvp_mode',
        };

        const walk = (node: Node) => {
            const label = node.getComponent(Label);
            if (label) {
                const key = textMap[label.string];
                if (key) {
                    label.string = I18n.t(key);
                }
            }
            for (const child of node.children) {
                walk(child);
            }
        };
        walk(scene);
    }
}

