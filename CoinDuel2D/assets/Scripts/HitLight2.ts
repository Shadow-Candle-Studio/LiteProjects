import { _decorator, Component, Node } from 'cc';
const { ccclass } = _decorator;

/**
 * 击中光效：0.1 秒内将 5 个子节点 sp1-sp5 的 scaleY 从 0.1 平滑到 1.0，然后自销毁。
 */
@ccclass('HitLight2')
export class HitLight2 extends Component {
    private _children: Node[] = [];
    private _elapsed: number = 0;
    private readonly _duration: number = 0.2;

    start() {
        // 收集 5 个子节点
        const names = ['sp1', 'sp2', 'sp3', 'sp4', 'sp5'];
        for (const name of names) {
            const child = this.node.getChildByName(name);
            if (child) {
                child.setScale(1, 0.1, 1);
                this._children.push(child);
            }
        }
    }

    update(deltaTime: number) {
        this._elapsed += deltaTime;
        const progress = Math.min(this._elapsed / this._duration, 1);

        // scaleY: 0.1 → 1.0
        for (const child of this._children) {
            const sy = 0.1 + progress * 0.9;
            child.setScale(1, sy, 1);
        }

        if (progress >= 1) {
            this.node.destroy();
        }
    }
}

