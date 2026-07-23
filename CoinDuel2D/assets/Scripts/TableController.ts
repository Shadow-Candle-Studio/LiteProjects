import { _decorator, Component, Node, Graphics, Color } from 'cc';
const { ccclass, property } = _decorator;

/** 单个缺口的定义 */
export interface GapInfo {
    side: number;  // 0=上 1=右 2=下 3=左
    center: number; // 沿墙方向的位置
}

@ccclass('TableController')
export class TableController extends Component {

    public tableWidth: number = 1280;

    public tableHeight: number = 720;

    @property({ tooltip: "围墙厚度（像素）" })
    public wallThickness: number = 8;

    @property({ tooltip: "围墙颜色" })
    public wallColor: Color = new Color(139, 90, 43, 255);

    @property({ tooltip: "缺口宽度基数（不含增量）" })
    public gapWidth: number = 80;

    @property({ tooltip: "缺口宽度每关增量" })
    public gapWidthIncrement: number = 10;

    /** 本局所有缺口 */
    public gaps: GapInfo[] = [];

    private _tableGraphics: Graphics = null!;  // 绿色桌面
    private _wallGraphics: Graphics = null!;   // 四边围墙

    protected start(): void {
        const parent = this.node.parent;
        if (!parent) return;

        // 绿色桌面
        const tableNode = new Node('TableGreen');
        tableNode.layer = 1; // WORLD
        parent.addChild(tableNode);
        tableNode.setPosition(0, 0, 0);
        this._tableGraphics = tableNode.addComponent(Graphics);

        // 围墙（在桌面之上，硬币之下）
        const wallNode = new Node('Walls');
        wallNode.layer = 1; // WORLD
        parent.addChild(wallNode);
        wallNode.setPosition(0, 0, 0);
        this._wallGraphics = wallNode.addComponent(Graphics);

        // 渲染顺序：TableGreen → Walls → CoinGroup
        const coinGroup = parent.getChildByName('CoinGroup');
        if (coinGroup) {
            const idx = coinGroup.getSiblingIndex();
            tableNode.setSiblingIndex(idx);
            wallNode.setSiblingIndex(idx + 1);
        }
    }

    /** 生成 N 个缺口（每边最多一个，边不重复） */
    public generateRandomGaps(count: number): void {
        this.gaps = [];
        const sides = [0, 1, 2, 3];
        // Fisher-Yates 洗牌
        for (let i = sides.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sides[i], sides[j]] = [sides[j], sides[i]];
        }

        const n = Math.min(count, 4);
        for (let i = 0; i < n; i++) {
            const side = sides[i];
            const halfSpanW = this.tableWidth / 2 - this.wallThickness - this.gapWidth / 2;
            const halfSpanH = this.tableHeight / 2 - this.wallThickness - this.gapWidth / 2;
            let center = 0;
            if (side === 0 || side === 2) {
                center = (Math.random() * 2 - 1) * halfSpanW;
            } else {
                center = (Math.random() * 2 - 1) * halfSpanH;
            }
            this.gaps.push({ side, center });
        }
    }

    /** 绘制绿色桌面 + 棕色围墙（含所有缺口） */
    public drawTable(): void {
        const htw = this.tableWidth / 2;
        const hth = this.tableHeight / 2;

        // 1. 绿色桌面
        const t = this._tableGraphics;
        if (t) {
            t.clear();
            t.fillColor = new Color(46, 139, 87, 255);
            t.rect(-htw, -hth, this.tableWidth, this.tableHeight);
            t.fill();
        }

        // 2. 四边棕色围墙（含所有缺口）
        this._drawWalls();
    }

    // ──────────────────────────────────────────
    //  围墙分段绘制
    // ──────────────────────────────────────────

    /** 计算所有围墙段（含缺口切分） */
    private _calcWallSegments(): { x: number; y: number; w: number; h: number }[] {
        const wt = this.wallThickness;
        const hw = this.tableWidth / 2;
        const hh = this.tableHeight / 2;
        const ov = 2;
        const hg = this.gapWidth / 2;
        const results: { x: number; y: number; w: number; h: number }[] = [];

        // 四面墙的定义
        const walls = [
            { side: 0, x: -hw - ov, y: hh - wt, w: this.tableWidth + ov * 2, h: wt, horiz: true },
            { side: 2, x: -hw - ov, y: -hh,     w: this.tableWidth + ov * 2, h: wt, horiz: true },
            { side: 3, x: -hw,       y: -hh - ov, w: wt, h: this.tableHeight + ov * 2, horiz: false },
            { side: 1, x: hw - wt,   y: -hh - ov, w: wt, h: this.tableHeight + ov * 2, horiz: false },
        ];

        for (const wall of walls) {
            const wallGaps = this.gaps
                .filter(g => g.side === wall.side)
                .sort((a, b) => a.center - b.center);

            if (wallGaps.length === 0) {
                results.push({ x: wall.x, y: wall.y, w: wall.w, h: wall.h });
                continue;
            }

            // 沿墙方向切割
            let cursor = wall.horiz ? wall.x : wall.y;
            const endPos = cursor + (wall.horiz ? wall.w : wall.h);
            const fixedPos = wall.horiz ? wall.y : wall.x;
            const fixedSize = wall.horiz ? wall.h : wall.w;

            for (const gap of wallGaps) {
                const gapL = gap.center - hg;
                const gapR = gap.center + hg;
                const segLen = gapL - cursor;
                if (segLen > 0) {
                    if (wall.horiz) {
                        results.push({ x: cursor, y: fixedPos, w: segLen, h: fixedSize });
                    } else {
                        results.push({ x: fixedPos, y: cursor, w: fixedSize, h: segLen });
                    }
                }
                cursor = Math.max(cursor, gapR);
            }
            const remLen = endPos - cursor;
            if (remLen > 0) {
                if (wall.horiz) {
                    results.push({ x: cursor, y: fixedPos, w: remLen, h: fixedSize });
                } else {
                    results.push({ x: fixedPos, y: cursor, w: fixedSize, h: remLen });
                }
            }
        }

        return results;
    }

    /** 绘制四边围墙（棕色，贴在屏幕边缘内侧） */
    private _drawWalls(): void {
        const g = this._wallGraphics;
        if (!g) return;
        g.clear();
        g.fillColor = this.wallColor;
        for (const s of this._calcWallSegments()) {
            if (s.w > 0 && s.h > 0) g.rect(s.x, s.y, s.w, s.h);
        }
        g.fill();
    }
}
