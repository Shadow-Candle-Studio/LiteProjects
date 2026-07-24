import { _decorator, Component, Node, Sprite, SpriteFrame, resources, UITransform } from 'cc';
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
    public wallColor: string = '#8B5A2B';

    @property({ tooltip: "缺口宽度基数（不含增量）" })
    public gapWidth: number = 80;

    @property({ tooltip: "缺口宽度每关增量" })
    public gapWidthIncrement: number = 10;

    /** 本局所有缺口 */
    public gaps: GapInfo[] = [];

    private _tableSprite: Sprite | null = null;
    private _wallNode: Node | null = null;
    private _wallSpriteFrame: SpriteFrame | null = null;

    protected start(): void {
        const parent = this.node.parent;
        if (!parent) return;

        // 绿色桌面（使用纹理）
        const tableNode = new Node('TableGreen');
        tableNode.layer = 1; // WORLD
        parent.addChild(tableNode);
        tableNode.setPosition(0, 0, 0);
        const tableTransform = tableNode.addComponent(UITransform);
        tableTransform.setContentSize(this.tableWidth, this.tableHeight);
        this._tableSprite = tableNode.addComponent(Sprite);
        this._tableSprite.type = Sprite.Type.SIMPLE;

        // 加载桌面纹理
        resources.load('texture_table_1/spriteFrame', SpriteFrame, (err, sf) => {
            if (!err && sf && this._tableSprite) {
                this._tableSprite.spriteFrame = sf;
            } else {
                console.warn('[TableController] 加载桌面纹理失败:', err);
            }
        });

        // 围墙容器节点（子节点为各段围墙 Sprite）
        const wallNode = new Node('Walls');
        wallNode.layer = 1; // WORLD
        parent.addChild(wallNode);
        wallNode.setPosition(0, 0, 0);
        this._wallNode = wallNode;

        // 加载围墙纹理
        resources.load('texture_wall_1/spriteFrame', SpriteFrame, (err, sf) => {
            if (!err && sf) {
                this._wallSpriteFrame = sf;
                // 如果纹理加载时围墙已创建，刷新纹理
                this._assignWallTexture();
            } else {
                console.warn('[TableController] 加载围墙纹理失败:', err);
            }
        });

        // 渲染顺序：TableGreen → Walls → CoinGroup
        const coinGroup = parent.getChildByName('CoinGroup');
        if (coinGroup) {
            const idx = coinGroup.getSiblingIndex();
            tableNode.setSiblingIndex(idx);
            wallNode.setSiblingIndex(idx + 1);
        }
    }

    /** 将围墙纹理赋予所有已创建的围墙段 Sprite */
    private _assignWallTexture(): void {
        if (!this._wallNode || !this._wallSpriteFrame) return;
        for (const child of this._wallNode.children) {
            const sprite = child.getComponent(Sprite);
            if (sprite && !sprite.spriteFrame) {
                sprite.spriteFrame = this._wallSpriteFrame;
            }
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

    /** 绘制桌面 + 围墙（含所有缺口） */
    public drawTable(): void {
        // 更新桌面尺寸（兼容后续尺寸变化）
        const ut = this._tableSprite?.node?.getComponent(UITransform);
        if (ut) {
            ut.setContentSize(this.tableWidth, this.tableHeight);
        }

        // 重建围墙段
        this._rebuildWalls();
    }

    /** 根据当前缺口配置重建所有围墙段的 Sprite 节点 */
    private _rebuildWalls(): void {
        if (!this._wallNode) return;
        this._wallNode.removeAllChildren();

        for (const seg of this._calcWallSegments()) {
            if (seg.w <= 0 || seg.h <= 0) continue;

            const segNode = new Node('WallSegment');
            segNode.layer = 1;
            this._wallNode.addChild(segNode);
            // 位置为段中心
            segNode.setPosition(seg.x + seg.w / 2, seg.y + seg.h / 2, 0);

            const sprite = segNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.TILED;
            if (this._wallSpriteFrame) {
                sprite.spriteFrame = this._wallSpriteFrame;
            }

            // 根据方向调整纹理朝向（纹理默认朝右）
            const ut = segNode.addComponent(UITransform);
            switch (seg.side) {
                case 1: // 右墙：纹理朝右（默认），不变
                    ut.setContentSize(seg.w, seg.h);
                    break;
                case 3: // 左墙：水平翻转，让纹理朝左（朝向桌面中心）
                    segNode.setScale(-1, 1, 1);
                    ut.setContentSize(seg.w, seg.h);
                    break;
                case 0: // 上墙：旋转 -90°，使朝右的纹理朝下（朝向桌面中心）
                    ut.setContentSize(seg.h, seg.w);  // 宽高互换
                    segNode.setRotationFromEuler(0, 0, -90);
                    break;
                case 2: // 下墙：旋转 90°，使朝右的纹理朝上（朝向桌面中心）
                    ut.setContentSize(seg.h, seg.w);  // 宽高互换
                    segNode.setRotationFromEuler(0, 0, 90);
                    break;
            }
        }
    }

    // ──────────────────────────────────────────
    //  围墙分段计算
    // ──────────────────────────────────────────

    /** 计算所有围墙段（含缺口切分），返回段坐标 + 所属墙面 side */
    private _calcWallSegments(): { x: number; y: number; w: number; h: number; side: number }[] {
        const wt = this.wallThickness;
        const hw = this.tableWidth / 2;
        const hh = this.tableHeight / 2;
        const ov = 2;
        const hg = this.gapWidth / 2;
        const results: { x: number; y: number; w: number; h: number; side: number }[] = [];

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
                results.push({ x: wall.x, y: wall.y, w: wall.w, h: wall.h, side: wall.side });
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
                        results.push({ x: cursor, y: fixedPos, w: segLen, h: fixedSize, side: wall.side });
                    } else {
                        results.push({ x: fixedPos, y: cursor, w: fixedSize, h: segLen, side: wall.side });
                    }
                }
                cursor = Math.max(cursor, gapR);
            }
            const remLen = endPos - cursor;
            if (remLen > 0) {
                if (wall.horiz) {
                    results.push({ x: cursor, y: fixedPos, w: remLen, h: fixedSize, side: wall.side });
                } else {
                    results.push({ x: fixedPos, y: cursor, w: fixedSize, h: remLen, side: wall.side });
                }
            }
        }

        return results;
    }

}
