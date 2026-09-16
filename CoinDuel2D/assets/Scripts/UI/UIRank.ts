import { _decorator, Button, Component, Node } from 'cc';
import { LeaderboardEntry } from '../Leaderboard';
import { UIRankItem } from './UIRankItem';
const { ccclass, property } = _decorator;

@ccclass('UIRank')
export class UIRank extends Component {
    @property(Node)
    public btnClose:Node = null;
    @property(Node)
    public content:Node = null;

    public onCloseClick:()=>void = null;

    private rankItems:UIRankItem[] = [];

    onLoad() {
        this.rankItems = this.content.getComponentsInChildren(UIRankItem);
        if (this.btnClose) {
            this.btnClose.on(Button.EventType.CLICK, () => {
                if (this.onCloseClick) this.onCloseClick();
                this.close();
            }, this);
        }
    }

    /** 显示排行榜，entries 已按分数降序排列 */
    public show(entries: LeaderboardEntry[]){
        this.node.active = true;
        for (let i = 0; i < this.rankItems.length; i++) {
            const item = this.rankItems[i];
            if (!item) continue;
            item.init();
            if (i < entries.length) {
                const e = entries[i];
                item.setData(e.score, e.duration);
            }
        }
    }

    public close(){
        this.node.active = false;
    }
}
