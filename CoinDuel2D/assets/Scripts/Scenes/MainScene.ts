import { _decorator, Button, Component, director, Node, Label, resources, instantiate, Prefab } from 'cc';
import { LevelManager } from '../LevelManager';
import { SoundManager } from '../SoundManager';
import { I18n } from '../I18n';
import { UpdateManager } from '../UpdateManager';
import { GameMode, GameScene } from './GameScene';
const { ccclass, property } = _decorator;

@ccclass('MainScene')
export class MainScene extends Component {
    @property(Button)
    public btnLevels: Button | null = null;
    @property(Button)
    public btnLadder: Button | null = null;
    @property(Button)
    public btnPVP: Button | null = null;
    @property(Label)
    public labelUpdateMessage: Label | null = null;
    @property(Prefab)
    public soundManagerPrefab: Prefab | null = null;

    onLoad() {

        this.btnLevels.node.on(Button.EventType.CLICK, () => {
            GameScene.mode = GameMode.Level;
            director.loadScene('levels');
        }, this);
        this.btnLadder.node.on(Button.EventType.CLICK, () => {
            GameScene.mode = GameMode.Ladder;
            LevelManager.setCurrent(null);
            director.loadScene('game');
        }, this);
        this.btnPVP.node.on(Button.EventType.CLICK, () => {
            director.loadScene('pvp');
        }, this);
        if (SoundManager.instance == null) {
            let sm = instantiate(this.soundManagerPrefab);
            director.getScene()?.addChild(sm);
        }
        if (SoundManager.instance != null) {
            SoundManager.instance.stopBGM();
        }
    }

    start(){
        I18n.init(() => {
            this._translateLabels();

            this.showMenus(false);
            this.labelUpdateMessage.string = I18n.t('main_check_update');
            
            // 游戏启动时从服务器更新关卡和配置（后台进行，不阻塞界面）
            UpdateManager.checkUpdate(
                (p) => {
                    console.log(`[Update] 更新进度 ${(p * 100).toFixed(0)}%`);
                    this.labelUpdateMessage.string = I18n.t('main_update_progress') + (p * 100).toFixed(0) + "%";
                },
                (err, errParams) => {
                    if (err) {
                        console.warn('[Update] 更新失败:', err, errParams);
                        this.labelUpdateMessage.string = I18n.t('main_update_error') + I18n.t(err, errParams);
                    } else {
                        console.log('[Update] 更新完成');
                        this.labelUpdateMessage.string = I18n.t('main_update_complete');
                    }
                    this.showMenus(true);
                }
            );

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

    private showMenus(e:boolean){
        this.btnLevels.node.active = e;
        this.btnLadder.node.active = e;
        //this.btnPVP.node.active = e;
    }

}

