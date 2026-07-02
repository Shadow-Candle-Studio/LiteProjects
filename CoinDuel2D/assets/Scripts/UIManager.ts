import { _decorator, Button, Component, EventHandler, Label, Node } from 'cc';
import { Leaderboard } from './Leaderboard';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node)
    public gameOverPanel:Node = null;
    @property(Button)
    public buttonRetry:Button = null;
    @property(Label)
    public labelRank:Label = null;
    @property(Label)
    public labelScore:Label = null;
    @property(Label)
    public labelLevel:Label = null;

    public onRetry:()=>void;

    start() {
        this.buttonRetry.node.on(Node.EventType.TOUCH_START, ()=>{this.onRetry();});
    }

    public showGameOver(show:boolean){
        this.gameOverPanel.active = show;
        let rank = Leaderboard.getEntries();
        let rankstr = "";
        for (let i = 0; i < rank.length; i++) {
            const item = rank[i];
            const date = new Date(item.time);
            const dateStr = `${date.getFullYear()}-${this._pad(date.getMonth()+1)}-${this._pad(date.getDate())}`;
            const min = Math.floor(item.duration / 60);
            const sec = item.duration % 60;
            const timeStr = `${this._pad(min)}:${this._pad(sec)}`;
            const scoreStr = this._padNum(item.score, 4);
            const num = this._padNum(i + 1, 2);
            rankstr += `#${num}  ${scoreStr}分  ${timeStr}  ${dateStr}\n`;
        }
        this.labelRank.string = rankstr;
    }

    /** 数字补零（至少 2 位） */
    private _pad(n: number): string {
        return n < 10 ? '0' + n : '' + n;
    }

    /** 数字左对齐固定宽度 */
    private _padNum(n: number, width: number): string {
        let s = '' + n;
        while (s.length < width) s = ' ' + s;
        return s;
    }

    public setScore(score:number){
        this.labelScore.string = "SCORE:" + score.toString();
    }

    public setLevel(level:number){
        this.labelLevel.string = "LEVEL:" + level.toString();
    }
}


