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

    private audioSource:AudioSource = null;

    protected onLoad(): void {
        SoundManager.instance =  this;
        this.audioSource = this.getComponent(AudioSource);
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
}


