"""
CoinDuel2D 关卡数据模型
负责关卡数据的加载、保存和管理

JSON 格式：coins/blocks/muds/bombs 合并为单个 coins 数组，通过 type 字段区分：
    {"type": "coin", "class": 1, "x": 0, "y": 0}
    {"type": "block", "x": 0, "y": 0, "shape": "circle", "radius": 30, "path": [...]}
    {"type": "mud", "x": 0, "y": 0, "shape": "circle", "radius": 30, "friction": 0.5}
    {"type": "bomb", "class": 1, "x": 0, "y": 0, "radius": 32}
"""
import json
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class WallData:
    """墙数据"""
    thickness: int = 64

    def to_dict(self) -> dict:
        return {"thickness": self.thickness}

    @staticmethod
    def from_dict(data: dict) -> 'WallData':
        return WallData(thickness=data.get("thickness", 10))


@dataclass
class CoinData:
    """硬币数据"""
    cls: int  # 对应 JSON 中的 "class"
    x: float
    y: float
    type: str = field(default="coin", init=False)

    def to_dict(self) -> dict:
        return {"type": "coin", "class": self.cls, "x": int(self.x), "y": int(self.y)}

    @staticmethod
    def from_dict(data: dict) -> 'CoinData':
        return CoinData(cls=data["class"], x=data["x"], y=data["y"])


@dataclass
class BlockData:
    """障碍物数据"""
    x: float
    y: float
    shape: str = "circle"
    radius: float = 30.0
    path: Optional[List[dict]] = None
    type: str = field(default="block", init=False)

    def to_dict(self) -> dict:
        result = {"type": "block", "x": int(self.x), "y": int(self.y), "shape": self.shape, "radius": int(self.radius)}
        if self.path:
            result["path"] = self.path
        return result

    @staticmethod
    def from_dict(data: dict) -> 'BlockData':
        return BlockData(
            x=data["x"],
            y=data["y"],
            shape=data.get("shape", "circle"),
            radius=data.get("radius", 30.0),
            path=data.get("path")
        )


@dataclass
class MudData:
    """陷阱数据"""
    x: float
    y: float
    shape: str = "circle"
    radius: float = 30.0
    friction: float = 0.5
    type: str = field(default="mud", init=False)

    def to_dict(self) -> dict:
        return {
            "type": "mud", "x": int(self.x), "y": int(self.y),
            "shape": self.shape, "radius": int(self.radius),
            "friction": self.friction
        }

    @staticmethod
    def from_dict(data: dict) -> 'MudData':
        return MudData(
            x=data["x"],
            y=data["y"],
            shape=data.get("shape", "circle"),
            radius=data.get("radius", 30.0),
            friction=data.get("friction", 0.5)
        )


@dataclass
class BombData:
    """炸弹硬币数据（被撞击静止后触发爆炸）"""
    cls: int  # 对应 JSON 中的 "class"（外观类型）
    x: float
    y: float
    radius: float = 32.0
    type: str = field(default="bomb", init=False)

    def to_dict(self) -> dict:
        return {"type": "bomb", "class": self.cls, "x": int(self.x), "y": int(self.y), "radius": int(self.radius)}

    @staticmethod
    def from_dict(data: dict) -> 'BombData':
        return BombData(cls=data["class"], x=data["x"], y=data["y"], radius=data.get("radius", 32.0))


def item_from_dict(data: dict) -> object:
    """根据 type 字段分发构造对应的条目对象"""
    t = data.get("type", "coin")
    if t == "block":
        return BlockData.from_dict(data)
    if t == "mud":
        return MudData.from_dict(data)
    if t == "bomb":
        return BombData.from_dict(data)
    return CoinData.from_dict(data)


class LevelData:
    """关卡数据管理类"""

    def __init__(self, id: int = 1, width: int = 800, height: int = 600):
        self.id = id
        self.width = width
        self.height = height
        self.wall: WallData = WallData()
        # 所有条目（硬币/障碍物/陷阱），按顺序存放
        self.items: List[object] = []
        self._file_path: Optional[str] = None

    @property
    def coins(self) -> List[CoinData]:
        return [o for o in self.items if isinstance(o, CoinData)]

    @property
    def blocks(self) -> List[BlockData]:
        return [o for o in self.items if isinstance(o, BlockData)]

    @property
    def muds(self) -> List[MudData]:
        return [o for o in self.items if isinstance(o, MudData)]

    @property
    def bombs(self) -> List[BombData]:
        return [o for o in self.items if isinstance(o, BombData)]

    @property
    def file_path(self) -> Optional[str]:
        return self._file_path

    @file_path.setter
    def file_path(self, path: str):
        self._file_path = path

    @staticmethod
    def from_json(path: str) -> 'LevelData':
        """从 JSON 文件加载关卡数据"""
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        level = LevelData(
            id=data.get("id", 1),
            width=data.get("width", 800),
            height=data.get("height", 600)
        )
        level._file_path = path

        # 加载墙
        wall_data = data.get("wall", {})
        level.wall = WallData.from_dict(wall_data)

        # 条目（coins/blocks/muds 合并数组，按 type 字段区分）
        for item_data in data.get("coins", []):
            level.items.append(item_from_dict(item_data))

        return level

    def to_json(self, path: Optional[str] = None) -> None:
        """保存关卡数据到 JSON 文件"""
        save_path = path or self._file_path
        if not save_path:
            raise ValueError("未指定保存路径")

        data = {
            "id": self.id,
            "width": self.width,
            "height": self.height,
            "wall": self.wall.to_dict(),
            # 所有条目合并到 coins 数组，每项带 type 字段
            "coins": [item.to_dict() for item in self.items]
        }

        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

        self._file_path = save_path

    def add_coin(self, coin: CoinData) -> None:
        """添加硬币"""
        self.items.append(coin)

    def add_block(self, block: BlockData) -> None:
        """添加障碍物"""
        self.items.append(block)

    def add_mud(self, mud: MudData) -> None:
        """添加陷阱"""
        self.items.append(mud)

    def add_bomb(self, bomb: BombData) -> None:
        """添加炸弹硬币"""
        self.items.append(bomb)

    def remove_object(self, obj: object) -> bool:
        """删除对象，返回是否成功"""
        if obj in self.items:
            self.items.remove(obj)
            return True
        return False

    def get_all_objects(self) -> List[object]:
        """获取所有对象"""
        return list(self.items)
