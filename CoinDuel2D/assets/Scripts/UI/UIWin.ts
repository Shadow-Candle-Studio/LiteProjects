import { _decorator, Button, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIWin')
export class UIWin extends Component {
    @property(Label)
    public level:Label = null;
    @property(Label)
    public score:Label = null;
    @property(Label)
    public time:Label = null;
    @property(Node)
    public btnNext:Node = null;
    @property(Node)
    public btnHome:Node = null;

    public onBtnNextClick:()=>void = null;
    public onBtnHomeClick:()=>void = null;

    onLoad() {
        // 绑定按钮点击事件
        if (this.btnNext) {
            this.btnNext.on(Button.EventType.CLICK, () => {
                if (this.onBtnNextClick) this.onBtnNextClick();
            }, this);
        }
        if (this.btnHome) {
            this.btnHome.on(Button.EventType.CLICK, () => {
                if (this.onBtnHomeClick) this.onBtnHomeClick();
            }, this);
        }
    }

    public show(level:number, score:number, time:number){
        if (this.level) this.level.string = level.toString();
        if (this.score) this.score.string = score.toString();
        if (this.time) {
            const h = Math.floor(time / 3600);
            const m = Math.floor((time % 3600) / 60);
            const s = time % 60;
            const pad = (n: number) => n < 10 ? '0' + n : '' + n;
            this.time.string = `${pad(h)}:${pad(m)}:${pad(s)}`;
        }
        this.node.active = true;
    }

    public close(){
        this.node.active = false;
    }

    /** 设置下一关按钮是否可用 */
    public setNextEnabled(enabled: boolean): void {
        if (this.btnNext) {
            const btn = this.btnNext.getComponent(Button);
            if (btn) btn.interactable = enabled;
            // 视觉反馈：降低透明度表示禁用
            this.btnNext.setScale(enabled ? 1 : 0.9, enabled ? 1 : 0.9, 1);
        }
    }
}

