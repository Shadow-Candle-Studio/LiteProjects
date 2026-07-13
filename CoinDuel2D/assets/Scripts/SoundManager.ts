import { _decorator, AudioClip, AudioSource, Component, Node } from 'cc';
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
}


