import { _decorator, Component, Node, ParticleSystem2D, Vec2, Vec3 } from 'cc';
const { ccclass } = _decorator;

/**
 * 击中光效：0.1 秒内将 5 个子节点 sp1-sp5 的 scaleY 从 0.1 平滑到 1.0，然后自销毁。
 */
@ccclass('HitLight2')
export class HitLight2 extends Component {
    private _children: Node[] = [];
    private _light1:ParticleSystem2D = null;
    private _light2:ParticleSystem2D = null;
    private _defautScale:Vec3[] = [];
    private _elapsed: number = 0;
    private _duration: number = 0.3;

    start() {
        // 收集 5 个子节点
        const names = ['sp1', 'sp2', 'sp3', 'sp4', 'sp5'];
        for (let i=0; i<names.length; i++) {
            let nodename = names[i]
            const child = this.node.getChildByName(nodename);
            if (child) {
                this._defautScale[i] = child.getScale();
                child.setScale(1, 0.1, 1);
                this._children.push(child);
            }
        }
        const ln1 = this.node.getChildByName("light1");
        if (ln1) this._light1 = ln1.getComponent(ParticleSystem2D);
        const ln2 = this.node.getChildByName("light2");
        if (ln2) this._light2 = ln2.getComponent(ParticleSystem2D);
    }

    public play(duration:number){
        this._duration = duration;
        if (this._light1) this._light1.duration = this._duration;
        if (this._light2) this._light2.duration = this._duration;
    }

    update(deltaTime: number) {
        this._elapsed += deltaTime;
        const progress = Math.min(this._elapsed / this._duration, 1);

        // scaleY: 0.1 → 1.0
        for (let i=0; i<this._children.length; i++) {
            let child = this._children[i];
            child.setScale(0.1 + progress * this._defautScale[i].x, 
                            0.1 + progress * this._defautScale[i].y, 
                            1);
        }

        if (progress >= 1) {
            this.node.destroy();
        }
    }
}

