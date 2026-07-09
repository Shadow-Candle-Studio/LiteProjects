import { _decorator, AudioClip, AudioSource, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SoundManager')
export class SoundManager extends Component {
    public static instance:SoundManager = null;

    @property(AudioClip)
    public hit:AudioClip = null;

    @property(AudioClip)
    public coinfall:AudioClip = null;

    private audioSource:AudioSource = null;

    protected onLoad(): void {
        SoundManager.instance =  this;
        this.audioSource = this.getComponent(AudioSource);
    }

    public playHit(){
        if (this.hit && this.audioSource){
            this.audioSource.playOneShot(this.hit);
        }
    }

    public playCoinFall(){
        if (this.coinfall && this.audioSource){
            this.audioSource.playOneShot(this.coinfall);
        }
    }
}


