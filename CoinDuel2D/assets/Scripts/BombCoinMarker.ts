import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

/**
 * 炸弹硬币标记组件
 * 添加到关卡中 type:'bomb' 的硬币节点上，用于标识和追踪状态。
 */
@ccclass('BombCoinMarker')
export class BombCoinMarker extends Component {
    /** 是否被撞击过（被任意硬币碰撞后设为 true） */
    public activated: boolean = false;
}