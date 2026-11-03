import {
    _decorator, Component, Node, Vec2, Vec3, Color, Camera, Canvas, input, Input,
    EventTouch, EventMouse, EventKeyboard, KeyCode, Sprite, SpriteFrame,
    Texture2D, UITransform,
} from 'cc';

const { ccclass, property } = _decorator;

interface Brush {
    label: string;
    /** 空字串代表普通硬幣，不寫進 JSON。 */
    behavior: string;
    /** 對應 levels/*.json 的 type。炸彈沿用現有的 bomb，其餘是 coin。 */
    kind: 'coin' | 'bomb';
    color: Color;
}

const BRUSHES: Brush[] = [
    { label: '1 普通', behavior: '', kind: 'coin', color: new Color(255, 255, 255, 255) },
    { label: '2 擊退', behavior: 'KnockbackBehavior', kind: 'coin', color: new Color(255, 150, 0, 255) },
    { label: '3 冰凍', behavior: 'FreezeBehavior', kind: 'coin', color: new Color(140, 210, 255, 255) },
    { label: '4 閃身步', behavior: 'FlashStepBehavior', kind: 'coin', color: new Color(170, 255, 140, 255) },
    { label: '5 炸彈', behavior: 'BombBehavior', kind: 'bomb', color: new Color(255, 80, 80, 255) },
];

interface CoinMark {
    behavior: string;
    kind: 'coin' | 'bomb';
}

/**
 * 預覽裡使用的關卡編輯器。一個腳本只放這一個組件。
 * 掛在 LevelEditorRoot 上，按 Play 後操作。場景檢視的點擊是用來選節點的，不會進到這個腳本。
 */
@ccclass('LevelEditorTool')
export class LevelEditorTool extends Component {
    @property(Camera)
    public camera: Camera | null = null;

    @property
    public levelId = 1;

    @property
    public tableWidth = 800;

    @property
    public tableHeight = 600;

    @property
    public wallThickness = 64;

    @property
    public coinClass = 1;

    @property
    public coinRadius = 32;

    private _brush = 0;
    private _selected: Node | null = null;
    private _dragging: Node | null = null;
    private _blockTouch = false;
    private _circle: SpriteFrame | null = null;
    private readonly _local = new Vec3();
    private readonly _marks = new Map<Node, CoinMark>();

    protected onLoad(): void {
        // Sprite 只會被 Canvas 畫出來。掛在場景根節點旁時硬幣會生成但畫面全黑。
        this._mountUnderCanvas();

        let ui = this.getComponent(UITransform);
        if (!ui) ui = this.addComponent(UITransform);
        ui.setAnchorPoint(0.5, 0.5);
        ui.setContentSize(this.tableWidth, this.tableHeight);
        this._circle = this._makeCircle();

        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    protected start(): void {
        console.log('[LevelEditor] 左鍵空白處生成，拖曳移動。1-5 切類型，Delete 或右鍵刪除，S 匯出 JSON。');
        console.log('[LevelEditor] 目前筆刷:', BRUSHES[this._brush].label);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    private _onTouchStart(event: EventTouch): void {
        if (this._blockTouch) return;
        this._toLocal(event.getLocation());
        const hit = this._pick(this._local);
        if (hit) {
            this._select(hit);
            this._dragging = hit;
            return;
        }
        const coin = this._spawn(this._local.x, this._local.y, this._brush);
        this._select(coin);
        this._dragging = coin;
    }

    private _onTouchMove(event: EventTouch): void {
        if (!this._dragging?.isValid) return;
        this._toLocal(event.getLocation());
        this._dragging.setPosition(this._local.x, this._local.y, 0);
    }

    private _onTouchEnd(): void {
        this._dragging = null;
    }

    private _onMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_RIGHT) return;
        this._blockTouch = true;
        this.scheduleOnce(() => { this._blockTouch = false; }, 0);
        this._toLocal(event.getLocation());
        this._deleteNode(this._pick(this._local));
    }

    private _onKeyDown(event: EventKeyboard): void {
        const code = event.keyCode;
        const digit = this._digitIndex(code);
        if (digit >= 0) {
            this._brush = digit;
            if (this._selected?.isValid) this._applyBrush(this._selected, digit);
            console.log('[LevelEditor] 筆刷:', BRUSHES[digit].label);
            return;
        }
        if (code === KeyCode.DELETE || code === KeyCode.BACKSPACE) {
            this._deleteNode(this._selected);
            return;
        }
        if (code === KeyCode.KEY_S) this._export();
    }

    private _digitIndex(code: number): number {
        if (code >= KeyCode.DIGIT_1 && code <= KeyCode.DIGIT_5) return code - KeyCode.DIGIT_1;
        if (code >= KeyCode.NUM_1 && code <= KeyCode.NUM_5) return code - KeyCode.NUM_1;
        return -1;
    }

    private _spawn(x: number, y: number, brushIndex: number): Node {
        const node = new Node('CoinPreview');
        node.layer = this.node.layer;
        node.setPosition(x, y, 0);
        this.node.addChild(node);

        const ui = node.addComponent(UITransform);
        ui.setContentSize(this.coinRadius * 2, this.coinRadius * 2);
        ui.setAnchorPoint(0.5, 0.5);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this._circle;
        this._marks.set(node, { behavior: '', kind: 'coin' });
        this._applyBrush(node, brushIndex);
        return node;
    }

    private _applyBrush(node: Node, brushIndex: number): void {
        const brush = BRUSHES[brushIndex];
        const mark = this._marks.get(node);
        if (mark) {
            mark.behavior = brush.behavior;
            mark.kind = brush.kind;
        }
        const sprite = node.getComponent(Sprite);
        if (sprite) sprite.color = brush.color;
        node.name = brush.kind === 'bomb' ? 'BombPreview' : `Coin_${brush.label.slice(2)}`;
    }

    private _select(node: Node | null): void {
        if (this._selected?.isValid) this._selected.setScale(1, 1, 1);
        this._selected = node;
        if (node?.isValid) node.setScale(1.12, 1.12, 1);
    }

    private _deleteNode(node: Node | null): void {
        if (!node?.isValid) return;
        if (this._selected === node) this._selected = null;
        if (this._dragging === node) this._dragging = null;
        this._marks.delete(node);
        node.destroy();
    }

    private _pick(local: Vec3): Node | null {
        const r = this.coinRadius;
        const r2 = r * r;
        const children = this.node.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (!this._marks.has(child)) continue;
            const dx = child.position.x - local.x;
            const dy = child.position.y - local.y;
            if (dx * dx + dy * dy <= r2) return child;
        }
        return null;
    }

    /**
     * 移到場景 Canvas 底下，原點對齊畫面中心，圖層跟 Canvas 一樣。
     * 關卡 JSON 的座標就是以畫面中心為 0。
     */
    private _mountUnderCanvas(): void {
        const canvas = this.node.scene?.getComponentInChildren(Canvas);
        if (!canvas || canvas.node === this.node) return;
        if (this.node.parent !== canvas.node) {
            this.node.setParent(canvas.node);
            this.node.setPosition(0, 0, 0);
        }
        this.node.layer = canvas.node.layer;
    }

    /** 螢幕座標 → LevelEditorRoot 的本地座標。 */
    private _toLocal(screen: Vec2): Vec3 {
        const cam = this._resolveCamera();
        const world = new Vec3(screen.x, screen.y, 0);
        if (cam) cam.screenToWorld(world, world);
        world.z = 0;
        const ui = this.getComponent(UITransform);
        if (ui) ui.convertToNodeSpaceAR(world, this._local);
        else this._local.set(world);
        return this._local;
    }

    private _resolveCamera(): Camera | null {
        if (this.camera?.isValid) return this.camera;
        const cams = this.node.scene?.getComponentsInChildren(Camera) ?? [];
        return cams.find((cam) => cam.enabledInHierarchy) ?? null;
    }

    private _export(): void {
        const coins: object[] = [];
        for (const child of this.node.children) {
            const mark = this._marks.get(child);
            if (!mark) continue;
            const item: {
                type: 'coin' | 'bomb';
                class: number;
                x: number;
                y: number;
                behavior?: string;
                radius?: number;
            } = {
                type: mark.kind,
                class: this.coinClass,
                x: Math.round(child.position.x),
                y: Math.round(child.position.y),
            };
            if (mark.behavior) item.behavior = mark.behavior;
            if (mark.kind === 'bomb') item.radius = this.coinRadius;
            coins.push(item);
        }

        const data = {
            id: this.levelId,
            width: this.tableWidth,
            height: this.tableHeight,
            wall: { thickness: this.wallThickness },
            coins,
        };
        console.log('[LevelEditor] 複製下面這段到 levels/' + this.levelId + '.json');
        console.log(JSON.stringify(data, null, 4));
    }

    private _makeCircle(): SpriteFrame {
        const size = 48;
        const tex = new Texture2D();
        tex.reset({ width: size, height: size, format: Texture2D.PixelFormat.RGBA8888 });
        const pixels = new Uint8Array(size * size * 4);
        const cx = (size - 1) / 2;
        const radius = size / 2 - 1;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - cx;
                const dy = y - cx;
                const inside = dx * dx + dy * dy <= radius * radius;
                const i = (y * size + x) * 4;
                pixels[i] = 255;
                pixels[i + 1] = 255;
                pixels[i + 2] = 255;
                pixels[i + 3] = inside ? 255 : 0;
            }
        }
        tex.uploadData(pixels);
        const frame = new SpriteFrame();
        frame.texture = tex;
        frame.packable = false;
        return frame;
    }
}
