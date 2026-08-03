import { _decorator, AudioClip, AudioSource, Component, Node, resources } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SoundManager')
export class SoundManager extends Component {
    public static instance:SoundManager = null;

    @property(AudioClip)
    public collisionWall:AudioClip = null;

    @property(AudioClip)
    public collisionCoin:AudioClip = null;

    @property(AudioClip)
    public shot:AudioClip = null;

    @property(AudioClip)
    public coinfall:AudioClip = null;

    @property(AudioClip)
    public coindrag:AudioClip = null;
    
    @property(AudioClip)
    public negative:AudioClip = null;

    @property(AudioClip)
    public dragIncrease:AudioClip = null;

    @property(AudioClip)
    public dragDecrease:AudioClip = null;

    @property(AudioClip)
    public dragRelease:AudioClip = null;

    private audioSource:AudioSource = null;
    /** 专门用于拖拽方向循环音效的独立 AudioSource（避免与主音效冲突） */
    private _dirLoopSource:AudioSource = null;
    /** 当前循环播放的方向音效 clip */
    private _dirLoopClip:AudioClip = null;

    protected onLoad(): void {
        SoundManager.instance =  this;
        this.audioSource = this.getComponent(AudioSource);
        // 动态创建独立的方向循环音源
        const node = this.node;
        let src = node.getComponent(AudioSource);
        if (src && src !== this.audioSource) {
            this._dirLoopSource = src;
        } else {
            this._dirLoopSource = node.addComponent(AudioSource);
        }
    }

    /** 硬币与硬币碰撞 */
    public playCollisionWall(){
        if (this.collisionWall && this.audioSource){
            this.audioSource.playOneShot(this.collisionWall);
        }
    }

    /** 硬币与墙碰撞 */
    public playCollisionCoin(){
        if (this.collisionCoin && this.audioSource){
            this.audioSource.playOneShot(this.collisionCoin);
        }
    }

    /** 硬币发射 */
    public playShot(){
        if (this.shot && this.audioSource){
            this.audioSource.playOneShot(this.shot);
        }
    }

    public playCoinFall(){
        if (this.coinfall && this.audioSource){
            this.audioSource.playOneShot(this.coinfall);
        }
    }

    /** 播放任意 AudioClip（用于硬币自定义碰撞音效） */
    public playClip(clip: AudioClip): void {
        if (clip && this.audioSource) {
            this.audioSource.playOneShot(clip);
        }
    }

    /** 游戏结束音效 */
    public playGameOver(): void {
        resources.load('sounds/gameover', AudioClip, (err: any, clip: AudioClip) => {
            if (!err && clip && this.audioSource) {
                this.audioSource.playOneShot(clip);
            }
        });
    }

    /** 播放一次拖拽音效（若已在播放则跳过） */
    public startCoinDrag(): void {
        if (!this.coindrag || !this.audioSource) return;
        if (this.audioSource.playing) return;
        this.audioSource.clip = this.coindrag;
        this.audioSource.play();
    }

    /** 播放一次拒绝音效（one-shot，可与拖拽音效叠加） */
    public startNegative(): void {
        if (!this.negative || !this.audioSource) return;
        this.audioSource.playOneShot(this.negative);
    }

    /** 开始循环播放拖拽增加音效（若已在循环则跳过，不刷屏） */
    public startDragIncreaseLoop(): void {
        if (this.dragIncrease && this._dirLoopSource) {
            if (this._dirLoopClip === this.dragIncrease && this._dirLoopSource.playing) return;
            this._dirLoopSource.stop();
            this._dirLoopSource.clip = this.dragIncrease;
            this._dirLoopSource.loop = true;
            this._dirLoopSource.play();
            this._dirLoopClip = this.dragIncrease;
        }
    }

    /** 开始循环播放拖拽减少音效（若已在循环则跳过，不刷屏） */
    public startDragDecreaseLoop(): void {
        if (this.dragDecrease && this._dirLoopSource) {
            if (this._dirLoopClip === this.dragDecrease && this._dirLoopSource.playing) return;
            this._dirLoopSource.stop();
            this._dirLoopSource.clip = this.dragDecrease;
            this._dirLoopSource.loop = true;
            this._dirLoopSource.play();
            this._dirLoopClip = this.dragDecrease;
        }
    }

    /** 停止拖拽方向循环音效 */
    public stopDragDirectionLoop(): void {
        if (this._dirLoopSource && this._dirLoopClip) {
            this._dirLoopSource.stop();
            this._dirLoopSource.clip = null;
            this._dirLoopClip = null;
        }
    }

    /** 松开音效 */
    public playDragRelease(): void {
        if (this.dragRelease && this.audioSource) this.audioSource.playOneShot(this.dragRelease);
    }
}


