import { _decorator, Color, Component, Label, Node } from 'cc';
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
        if (this.nodeLock) {
            this.nodeLock.active = state === LevelState.Locked;
        }
        if (this.nodePassed) {
            this.nodePassed.active = state === LevelState.Passed;
        }
    }
}

