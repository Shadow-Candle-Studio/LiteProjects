import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TargetIndicator')
export class TargetIndicator extends Component {
    @property(Node)
    public arrowUp:Node = null;
    @property(Node)
    public arrowDown:Node = null;
    @property(Node)
    public arrowLeft:Node = null;
    @property(Node)
    public arrowRight:Node = null;

    /** 箭头在轨道上的来回移动范围（从最近距离向外延伸） */
    @property({ tooltip: '箭头来回移动的范围（像素）' })
    public bounceAmplitude: number = 30;

    /** 箭头来回移动的速度（越大越快） */
    @property({ tooltip: '箭头来回移动的速度' })
    public bounceSpeed: number = 3;

    /** 箭头到中心的最近距离（由 open() 设置） */
    private _radius: number = 0;

    private _elapsed: number = 0;

    update(deltaTime: number) {
        if (!this.node.active) return;

        this._elapsed += deltaTime * this.bounceSpeed;
        const t = Math.sin(this._elapsed); // -1 ~ 1

        // 箭头到中心的偏移量：radius（最近）~ radius + amplitude（最远）
        const dist = this._radius + (t * 0.5 + 0.5) * this.bounceAmplitude;

        this._setArrowPos(this.arrowUp,    0,  dist);
        this._setArrowPos(this.arrowDown,  0, -dist);
        this._setArrowPos(this.arrowLeft, -dist, 0);
        this._setArrowPos(this.arrowRight, dist, 0);
    }

    private _setArrowPos(node: Node | null, x: number, y: number): void {
        if (node && node.isValid) {
            node.setPosition(x, y, node.position.z);
        }
    }

    public open(radius:number){
        this._radius = radius;
        this._elapsed = 0;
        this.node.active = true;
    }

    public close(){
        this.node.active = false;
    }
}
