import { _decorator, Button, Color, Component, Label, Node, Sprite } from 'cc';
import { LevelState } from '../LevelData';
const { ccclass, property } = _decorator;

@ccclass('UILevelItem')
export class UILevelItem extends Component {
    @property(Label)
    public labelLevel: Label | null = null;

    @property(Node)
    public nodeLock: Node | null = null;

    @property(Node )
    public nodePassed: Node | null = null;

    @property(Color)
    public colorLocked: Color = new Color(255, 0, 0, 255);
    @property(Color)
    public colorUnlocked: Color = new Color(0, 255, 0, 255);
    @property(Color)
    public colorPassed: Color = new Color(0, 255, 0, 255);

    public setLevel(level: number, state: LevelState) {
        if (this.labelLevel) {
            this.labelLevel.string = level.toString();
        }
        if (state == LevelState.Locked) {
            this.nodeLock.active = true;
            this.nodePassed.active = false;
            this.getComponent(Sprite).color = this.colorLocked;
            this.getComponent(Button).interactable = false;
        }else if (state == LevelState.Unlocked) {
            this.nodeLock.active = false;
            this.nodePassed.active = false;
            this.getComponent(Sprite).color = this.colorUnlocked;
            this.getComponent(Button).interactable = true;
        }else if (state == LevelState.Passed) {
            this.nodeLock.active = false;
            this.nodePassed.active = true;
            this.getComponent(Sprite).color = this.colorPassed;
            this.getComponent(Button).interactable = true;
        }
    }
}

