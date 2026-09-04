import { _decorator, Component, Node, resources, JsonAsset, instantiate, Prefab, Label, Button, director } from 'cc';
import { LevelManager } from '../LevelManager';
import { LevelData } from '../LevelData';
const { ccclass, property } = _decorator;

@ccclass('LevelsScene')
export class LevelsScene extends Component {
    @property(Prefab)
    levelButtonPrefab: Prefab = null!;

    @property(Node)
    levelsContainer: Node = null!;

    private _levelFiles: string[] = [];

    private _loadLevelAndGo(levelFile: string, index: number): void {
        const path = 'levels/' + levelFile.replace('.json', '');
        resources.load(path, JsonAsset, (err, asset) => {
            if (err) {
                console.error(`Failed to load ${path}:`, err);
                return;
            }
            const levelData = asset.json as LevelData;
            LevelManager.setLevelList(this._levelFiles, index);
            LevelManager.setCurrent(levelData);
            director.loadScene('game');
        });
    }

    start() {
        this.loadLevels();
    }

    loadLevels() {
        resources.load('levels', JsonAsset, (err, asset) => {
            if (err) {
                console.error('Failed to load levels.json:', err);
                return;
            }
            const data = asset.json as { levels: string[] };
            this._levelFiles = data.levels;
            for (let i = 0; i < data.levels.length; i++) {
                const levelFile = data.levels[i];
                const btn = instantiate(this.levelButtonPrefab);
                btn.name = levelFile;
                this.levelsContainer.addChild(btn);

                // 设置 Label 为关卡编号
                const labelNode = btn.getChildByName('Label');
                if (labelNode) {
                    const label = labelNode.getComponent(Label);
                    if (label) {
                        label.string = `${i + 1}`;
                    }
                }

                const button = btn.getComponent(Button);
                if (button) {
                    const idx = i;
                    btn.on(Button.EventType.CLICK, () => {
                        this._loadLevelAndGo(levelFile, idx);
                    }, this);
                }
            }
        });
    }
}
