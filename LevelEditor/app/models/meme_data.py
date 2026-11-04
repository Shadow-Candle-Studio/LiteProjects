"""
memes.json 数据模型
负责硬币外观/音效配置的加载、保存和管理

JSON 格式：
    {
        "coins": {
            "1": {
                "name": "普通硬币",
                "texture": "textures/coin_1.png",
                "idleTexture": "...",
                "aimTexture": "...",
                "shotTexture": "...",
                "hittedTexture": "...",
                "shotSfx": "sounds/coin_1_shot.wav",
                "hittedSfx": "sounds/coin_1_hitted.wav"
            }
        }
    }

配置中的资源路径均为相对项目根目录的路径（使用 / 分隔）。
"""
import json
from dataclasses import dataclass, field
from typing import Dict, Optional

# JSON 字段名 -> MemeCoin 属性名
MEME_FIELDS = {
    "name": "name",
    "texture": "texture",
    "idleTexture": "idle_texture",
    "aimTexture": "aim_texture",
    "shotTexture": "shot_texture",
    "hittedTexture": "hitted_texture",
    "shotSfx": "shot_sfx",
    "hittedSfx": "hitted_sfx",
}


@dataclass
class MemeCoin:
    """单个硬币外观/音效配置"""
    name: str = ""
    texture: str = ""
    idle_texture: str = ""
    aim_texture: str = ""
    shot_texture: str = ""
    hitted_texture: str = ""
    shot_sfx: str = ""
    hitted_sfx: str = ""
    # 未识别的字段原样保留，避免编辑器丢弃未来新增配置
    extra: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict:
        result = {key: getattr(self, attr) for key, attr in MEME_FIELDS.items()}
        for key, value in self.extra.items():
            if key not in result:
                result[key] = value
        return result

    @staticmethod
    def from_dict(data: dict) -> 'MemeCoin':
        values = {}
        for key, attr in MEME_FIELDS.items():
            value = data.get(key, "")
            values[attr] = value if isinstance(value, str) else ""
        extra = {k: v for k, v in data.items() if k not in MEME_FIELDS}
        return MemeCoin(extra=extra, **values)


class MemeCollection:
    """memes.json 内容（coins 键值表）"""

    def __init__(self, path: Optional[str] = None):
        self.path = path
        self.memes: Dict[str, MemeCoin] = {}
        self.extra: Dict[str, object] = {}

    @staticmethod
    def from_json(path: str) -> 'MemeCollection':
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("memes.json 格式错误：顶层必须是对象")

        collection = MemeCollection(path)
        coins = data.get("coins")
        if not isinstance(coins, dict):
            raise ValueError("memes.json 格式错误：缺少 coins 对象")
        for key, value in coins.items():
            if isinstance(value, dict):
                collection.memes[str(key)] = MemeCoin.from_dict(value)
        collection.extra = {k: v for k, v in data.items() if k != "coins"}
        return collection

    def to_json(self, path: Optional[str] = None) -> None:
        save_path = path or self.path
        if not save_path:
            raise ValueError("未指定保存路径")

        data = dict(self.extra)
        data["coins"] = {key: meme.to_dict() for key, meme in self.memes.items()}

        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

        self.path = save_path

    def next_key(self) -> str:
        """生成下一个可用的数字 key"""
        index = 1
        while str(index) in self.memes:
            index += 1
        return str(index)

    def add(self, key: str, meme: MemeCoin) -> None:
        self.memes[key] = meme

    def remove(self, key: str) -> bool:
        if key in self.memes:
            del self.memes[key]
            return True
        return False

    def rename(self, old_key: str, new_key: str) -> bool:
        """重命名 key，保持原有顺序"""
        if old_key not in self.memes or not new_key or new_key in self.memes:
            return False
        rebuilt: Dict[str, MemeCoin] = {}
        for key, meme in self.memes.items():
            rebuilt[new_key if key == old_key else key] = meme
        self.memes = rebuilt
        return True
