import { _decorator, Component, Animation } from 'cc';
const { ccclass } = _decorator;

/**
 * 用于 effect_launch 动画节点，动画剪辑中的 "go" 事件会调用本组件的 go() 方法，
 * 从而触发 GameLogic 中的实际发射逻辑。动画播放结束时自动销毁节点。
 */
@ccclass('EffectGoHelper')
export class EffectGoHelper extends Component {
    public onGo: (() => void) | null = null;

    protected start(): void {
        const anim = this.node.getComponent(Animation);
        if (anim) {
            anim.on(Animation.EventType.FINISHED, () => {
                this.node.destroy();
            });
        }
    }

    /** 由动画剪辑事件帧调用 */
    public go(): void {
        this.onGo?.();
    }
}
