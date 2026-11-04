"""
项目数据模型
一个项目目录（通常是 CoinDuel2D/assets/Resources）必须包含：
    levels.json  —— 关卡文件列表
    memes.json   —— 硬币外观/音效配置

配置文件中的路径均相对项目根目录解析。
"""
import json
import os
from typing import List, Optional

from app.models.level_data import LevelData
from app.models.meme_data import MemeCollection

LEVELS_INDEX_FILE = "levels.json"
MEMES_FILE = "memes.json"
REQUIRED_FILES = (LEVELS_INDEX_FILE, MEMES_FILE)


class ProjectError(Exception):
    """项目打开/读写错误"""


class Project:
    """已打开的项目目录"""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        self.levels_index_path = os.path.join(self.root, LEVELS_INDEX_FILE)
        self.memes_path = os.path.join(self.root, MEMES_FILE)
        self.level_entries: List[str] = []
        self.memes: Optional[MemeCollection] = None

    # ── 打开/校验 ──────────────────────────────

    @staticmethod
    def open(root: str) -> 'Project':
        """打开项目目录，校验必需文件并加载配置"""
        root = os.path.abspath(root)
        if not os.path.isdir(root):
            raise ProjectError(f"目录不存在：{root}")

        missing = [name for name in REQUIRED_FILES
                   if not os.path.isfile(os.path.join(root, name))]
        if missing:
            raise ProjectError("目录中缺少必需文件：" + "、".join(missing))

        project = Project(root)
        project._load_levels_index()
        try:
            project.memes = MemeCollection.from_json(project.memes_path)
        except Exception as e:
            raise ProjectError(f"读取 memes.json 失败：{e}") from e
        return project

    def _load_levels_index(self) -> None:
        try:
            with open(self.levels_index_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            raise ProjectError(f"读取 levels.json 失败：{e}") from e

        levels = data.get("levels") if isinstance(data, dict) else None
        if not isinstance(levels, list):
            raise ProjectError("levels.json 格式错误：缺少 levels 数组")
        self.level_entries = [str(item) for item in levels if isinstance(item, str) and item]

    def save_levels_index(self) -> None:
        with open(self.levels_index_path, 'w', encoding='utf-8') as f:
            json.dump({"levels": self.level_entries}, f, indent=4, ensure_ascii=False)

    # ── 关卡文件 ──────────────────────────────

    def resolve_level_path(self, entry: str) -> str:
        """把 levels.json 中的条目解析为实际文件路径。

        与游戏内加载路径一致：优先 levels/ 子目录，其次项目根目录。
        """
        normalized = entry.replace('\\', '/').lstrip('/')
        for candidate in (os.path.join(self.root, "levels", normalized),
                          os.path.join(self.root, normalized)):
            if os.path.isfile(candidate):
                return candidate
        # 新关卡默认放在 levels/ 子目录
        return os.path.join(self.root, "levels", normalized)

    def level_exists(self, entry: str) -> bool:
        return os.path.isfile(self.resolve_level_path(entry))

    def load_level(self, entry: str) -> LevelData:
        path = self.resolve_level_path(entry)
        if not os.path.isfile(path):
            raise ProjectError(f"关卡文件不存在：{entry}")
        return LevelData.from_json(path)

    def save_level(self, entry: str, level: LevelData) -> None:
        path = self.resolve_level_path(entry)
        os.makedirs(os.path.dirname(path) or self.root, exist_ok=True)
        level.to_json(path)

    @staticmethod
    def validate_level_entry(entry: str) -> Optional[str]:
        """校验关卡条目名，合法返回 None，否则返回错误信息"""
        name = entry.strip()
        if not name:
            return "文件名不能为空"
        if "/" in name or "\\" in name:
            return "文件名不能包含路径分隔符"
        if not name.lower().endswith(".json"):
            return "文件名必须以 .json 结尾"
        return None

    def relative_path(self, absolute_path: str) -> str:
        """把绝对路径转换为相对项目根目录的路径（/ 分隔）"""
        try:
            rel = os.path.relpath(absolute_path, self.root)
        except ValueError:
            return absolute_path
        return rel.replace('\\', '/')

    def absolute_path(self, relative_path: str) -> str:
        """把相对项目根目录的路径转换为绝对路径"""
        return os.path.join(self.root, relative_path.replace('/', os.sep))

    # ── 保存 ──────────────────────────────────

    def save_memes(self) -> None:
        if not self.memes:
            return
        self.memes.to_json(self.memes_path)
