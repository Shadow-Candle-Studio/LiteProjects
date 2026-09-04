"""
CoinDuel2D 关卡数据模型
负责关卡数据的加载、保存和管理
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

    def to_dict(self) -> dict:
        return {"class": self.cls, "x": int(self.x), "y": int(self.y)}

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

    def to_dict(self) -> dict:
        result = {"x": int(self.x), "y": int(self.y), "shape": self.shape, "radius": int(self.radius)}
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

    def to_dict(self) -> dict:
        return {
            "x": int(self.x), "y": int(self.y),
            "shape": self.shape, "radius": int(self.radius),
            "friction": self.friction
        }

    @staticmethod
    def from_dict(data: dict) -> 'MudData':
        return MudData(
            x=data["x"], y=data["y"],
            shape=data.get("shape", "circle"),
            radius=data.get("radius", 30.0),
            friction=data.get("friction", 0.5)
        )


class LevelData:
    """关卡数据管理类"""

    def __init__(self, id: int = 1, width: int = 800, height: int = 600):
        self.id = id
        self.width = width
        self.height = height
        self.wall: WallData = WallData()
        self.coins: List[CoinData] = []
        self.blocks: List[BlockData] = []
        self.muds: List[MudData] = []
        self._file_path: Optional[str] = None

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

        for coin_data in data.get("coins", []):
            level.coins.append(CoinData.from_dict(coin_data))

        for block_data in data.get("blocks", []):
            level.blocks.append(BlockData.from_dict(block_data))

        for mud_data in data.get("muds", []):
            level.muds.append(MudData.from_dict(mud_data))

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
            "coins": [coin.to_dict() for coin in self.coins],
            "blocks": [block.to_dict() for block in self.blocks],
            "muds": [mud.to_dict() for mud in self.muds]
        }

        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

        self._file_path = save_path

    def add_coin(self, coin: CoinData) -> None:
        """添加硬币"""
        self.coins.append(coin)

    def add_block(self, block: BlockData) -> None:
        """添加障碍物"""
        self.blocks.append(block)

    def add_mud(self, mud: MudData) -> None:
        """添加陷阱"""
        self.muds.append(mud)

    def remove_object(self, obj: object) -> bool:
        """删除对象，返回是否成功"""
        if isinstance(obj, CoinData) and obj in self.coins:
            self.coins.remove(obj)
            return True
        elif isinstance(obj, BlockData) and obj in self.blocks:
            self.blocks.remove(obj)
            return True
        elif isinstance(obj, MudData) and obj in self.muds:
            self.muds.remove(obj)
            return True
        return False

    def get_all_objects(self) -> List[object]:
        """获取所有对象"""
        return self.coins + self.blocks + self.muds
