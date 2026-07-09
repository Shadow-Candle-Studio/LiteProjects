import { _decorator, Component, Node, Vec3, Graphics, Color } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('TableController')
export class TableController extends Component {

    @property({ tooltip: "桌面宽度" })
    public tableWidth: number = 1280;

    @property({ tooltip: "桌面高度" })
    public tableHeight: number = 720;

    @property({ tooltip: "矩形缺口宽度" })
    public gapWidth: number = 120;

    @property({ tooltip: "矩形缺口高度" })
    public gapHeight: number = 120;

    /** 当前缺口的中心位置 */
    public gapPosition: Vec3 = new Vec3(0, 0, 0);

    private _tableGraphics: Graphics = null!;  // 绿色桌面
    private _gapGraphics: Graphics = null!;    // 黑色缺口

    protected start(): void {
        const canvas = this.node.parent;
        if (!canvas) return;

        // 绿色桌面
        const tableNode = new Node('TableGreen');
        canvas.addChild(tableNode);
        tableNode.setPosition(0, 0, 0);
        this._tableGraphics = tableNode.addComponent(Graphics);

        // 黑色缺口（叠加在绿色桌面之上）
        const gapNode = new Node('TableGap');
        canvas.addChild(gapNode);
        gapNode.setPosition(0, 0, 0);
        this._gapGraphics = gapNode.addComponent(Graphics);

        // 渲染顺序：TableGreen → TableGap → CoinGroup
        const coinGroup = canvas.getChildByName('CoinGroup');
        if (coinGroup) {
            const idx = coinGroup.getSiblingIndex();
            tableNode.setSiblingIndex(idx);
            gapNode.setSiblingIndex(idx + 1);
        }
    }

    /** 生成随机缺口位置（确保缺口整体在桌面内） */
    public generateRandomGapPosition(): Vec3 {
        const halfW = (this.tableWidth - this.gapWidth) / 2;
        const halfH = (this.tableHeight - this.gapHeight) / 2;
        const x = (Math.random() * 2 - 1) * halfW;
        const y = (Math.random() * 2 - 1) * halfH;
        this.gapPosition = new Vec3(x, y, 0);
        return this.gapPosition;
    }

    /** 绘制桌面：绿色桌面 + 黑色缺口 */
    public drawTableWithGap(): void {
        const htw = this.tableWidth / 2;
        const hth = this.tableHeight / 2;
        const hgw = this.gapWidth / 2;
        const hgh = this.gapHeight / 2;

        // 1. 绿色桌面（整个区域）
        const t = this._tableGraphics;
        if (!t) return;
        t.clear();
        t.fillColor = new Color(46, 139, 87, 255);
        t.rect(-htw, -hth, this.tableWidth, this.tableHeight);
        t.fill();

        // 2. 黑色缺口（叠加在绿色桌面之上）
        const g = this._gapGraphics;
        if (!g) return;
        g.clear();
        g.fillColor = new Color(0, 0, 0, 255);
        g.rect(
            this.gapPosition.x - hgw,
            this.gapPosition.y - hgh,
            this.gapWidth,
            this.gapHeight
        );
        g.fill();
    }
}
