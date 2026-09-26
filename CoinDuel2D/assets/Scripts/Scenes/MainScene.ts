import { _decorator, Button, Component, director, Node } from 'cc';
import { LevelManager } from '../LevelManager';
import { SoundManager } from '../SoundManager';
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
    }


}

