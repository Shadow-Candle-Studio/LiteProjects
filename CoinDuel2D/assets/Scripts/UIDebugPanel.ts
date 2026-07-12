import { _decorator, Component, Node, EditBox, log, RigidBody2D } from 'cc';
import { GameLogic } from './GameLogic';
const { ccclass, property } = _decorator;

@ccclass('UIDebugPanel')
export class UIDebugPanel extends Component {

    @property({ type: GameLogic, tooltip: "GameLogic 引用" })
    public gameLogic: GameLogic = null!;

    @property({ type: Node, tooltip: "CoinRadius 输入框节点" })
    public coinRadiusInput: Node = null!;

    @property({ type: Node, tooltip: "SpeedThreshold 输入框节点" })
    public speedThresholdInput: Node = null!;

    @property({ type: Node, tooltip: "CoinDamping 输入框节点" })
    public coinDampingInput: Node = null!;

    start() {
        // key → EditBox 映射
        const inputs = new Map<string, EditBox>();
        inputs.set('coinRadius',     this.coinRadiusInput.getComponent(EditBox)!);
        inputs.set('speedThreshold', this.speedThresholdInput.getComponent(EditBox)!);
        inputs.set('coinDamping',    this.coinDampingInput.getComponent(EditBox)!);

        // 参数表
        const params: { key: string; label: string; get: () => number; set: (v: number) => void }[] = [
            {
                key: 'coinRadius',
                label: '硬币半径',
                get: () => this.gameLogic.coinRadius,
                set: v => { this.gameLogic.coinRadius = v; this.gameLogic.syncCoinRadius(); },
            },
            {
                key: 'speedThreshold',
                label: '静止速度阈值',
                get: () => this.gameLogic.speedThreshold,
                set: v => { this.gameLogic.speedThreshold = v; },
            },
            {
                key: 'coinDamping',
                label: '滑动阻尼',
                get: () => this.gameLogic.coinDamping,
                set: v => {
                    this.gameLogic.coinDamping = v;
                    this._syncCoinDamping();
                },
            },
        ];

        for (const p of params) {
            const box = inputs.get(p.key);
            if (!box) continue;

            // 显示当前值
            box.string = p.get().toFixed(2);

            // 编辑结束 → 解析并应用
            box.node.on('editing-did-ended', (editor: EditBox | string) => {
                const text = typeof editor === 'string' ? editor : editor.string;
                const val = parseFloat(text);
                if (isNaN(val)) {
                    box.string = p.get().toFixed(2);
                    return;
                }
                p.set(val);
                log(`[Debug] ${p.label}: ${val}`);
            });
        }

        log('[DebugPanel] ready');
    }

    /** 将新阻尼值同步到所有已有硬币 */
    private _syncCoinDamping(): void {
        if (!this.gameLogic?.coinGroup) return;
        const d = this.gameLogic.coinDamping;
        for (const coin of this.gameLogic.coinGroup.children) {
            const rb = coin.getComponent(RigidBody2D);
            if (rb) rb.linearDamping = d;
        }
    }
}
