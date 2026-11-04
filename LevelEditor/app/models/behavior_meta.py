"""
Behavior 元数据（priority / mode / exclusive）
数据来自 LevelEditor/behavior_meta.json，该文件由
    python tools/collect_behaviors.py
从游戏代码 CoinDuel2D/assets/Scripts/Behaviors/*.ts 中收集生成。
"""
import json
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

META_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "behavior_meta.json",
)

# behavior_meta.json 缺失或损坏时的兜底数据（与当前游戏代码保持一致）
FALLBACK_META = {
    "FlashStepBehavior": {"priority": 80, "mode": "dominant", "exclusive": True},
    "KnockbackBehavior": {"priority": 70, "mode": "dominant", "exclusive": True},
    "FreezeBehavior": {"priority": 60, "mode": "dominant", "exclusive": True},
}


@dataclass(frozen=True)
class BehaviorMeta:
    """单个行为在游戏中的裁决属性"""
    id: str
    priority: int
    mode: str
    exclusive: bool


_cache: Optional[List[BehaviorMeta]] = None


def _parse(data: dict) -> List[BehaviorMeta]:
    behaviors = data.get("behaviors") if isinstance(data, dict) else None
    if not isinstance(behaviors, dict):
        raise ValueError("behavior_meta.json 格式错误：缺少 behaviors 对象")

    metas: List[BehaviorMeta] = []
    for behavior_id, item in behaviors.items():
        if not isinstance(item, dict):
            continue
        priority = item.get("priority", 0)
        mode = item.get("mode", "passive")
        exclusive = item.get("exclusive", False)
        metas.append(BehaviorMeta(
            id=str(behavior_id),
            priority=priority if isinstance(priority, int) else 0,
            mode=mode if isinstance(mode, str) else "passive",
            exclusive=bool(exclusive),
        ))

    metas.sort(key=lambda m: (-m.priority, m.id))
    return metas


def _load() -> List[BehaviorMeta]:
    try:
        with open(META_PATH, "r", encoding="utf-8") as f:
            return _parse(json.load(f))
    except Exception as e:
        print(f"[BehaviorMeta] 读取 {META_PATH} 失败，使用内置兜底数据：{e}")
        return _parse({"behaviors": FALLBACK_META})


def get_behavior_meta() -> List[BehaviorMeta]:
    """获取所有行为元数据，按 priority 从高到低排序"""
    global _cache
    if _cache is None:
        _cache = _load()
    return list(_cache)


def get_behavior_map() -> Dict[str, BehaviorMeta]:
    return {meta.id: meta for meta in get_behavior_meta()}


def reload_behavior_meta() -> List[BehaviorMeta]:
    """重新从磁盘读取（便于生成新元数据后刷新）"""
    global _cache
    _cache = None
    return get_behavior_meta()
