"""
主窗口
以 Tab 分为两个页面：
    1. Level Editor：左侧关卡列表（levels.json）+ 画布 + 属性面板
    2. Meme Editor：左侧 meme 列表（memes.json）+ 属性面板
所有配置文件路径均相对打开的项目目录。
"""
import os
from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout, QSplitter,
    QTabWidget, QLabel, QMessageBox, QInputDialog, QStatusBar, QDialog
)

from app.models.level_data import LevelData
from app.models.meme_data import MemeCoin
from app.models.project import Project, ProjectError
from app.widgets.menu_bar import MenuBar
from app.widgets.object_tree import ObjectTree
from app.widgets.property_panel import PropertyPanel
from app.widgets.canvas import Canvas
from app.widgets.level_list_panel import LevelListPanel
from app.widgets.meme_list_panel import MemeListPanel
from app.widgets.meme_property_panel import MemePropertyPanel
from app.dialogs.new_level_dialog import NewLevelDialog

DEFAULT_WALL_THICKNESS = 64


class MainWindow(QMainWindow):
    """主窗口"""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CoinDuel2D Editor")
        self.setMinimumSize(1200, 800)

        # 项目状态
        self._project: Optional[Project] = None
        self._level_entry: Optional[str] = None
        self._level_data: Optional[LevelData] = None
        self._level_dirty: bool = False
        self._memes_dirty: bool = False
        self._levels_index_dirty: bool = False

        self._setup_ui()
        self._setup_menu()
        self._setup_status_bar()
        self._connect_signals()
        self._update_title()

    # ── UI ────────────────────────────────────

    def _setup_ui(self):
        self._tabs = QTabWidget()
        self._tabs.setDocumentMode(True)
        self.setCentralWidget(self._tabs)

        self._tabs.addTab(self._build_level_page(), "Level Editor")
        self._tabs.addTab(self._build_meme_page(), "Meme Editor")

    def _build_level_page(self) -> QWidget:
        self._level_list = LevelListPanel()
        self._object_tree = ObjectTree()
        self._canvas = Canvas()
        self._property_panel = PropertyPanel()

        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        splitter = QSplitter(Qt.Horizontal)

        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)
        left_layout.addWidget(self._level_list, 3)

        objects_label = QLabel("Objects")
        objects_label.setStyleSheet("font-weight: bold; padding-left: 4px;")
        left_layout.addWidget(objects_label)
        left_layout.addWidget(self._object_tree, 2)

        left.setMinimumWidth(180)
        self._property_panel.setMinimumWidth(220)

        splitter.addWidget(left)
        splitter.addWidget(self._canvas)
        splitter.addWidget(self._property_panel)
        splitter.setSizes([260, 600, 280])

        layout.addWidget(splitter)
        return page

    def _build_meme_page(self) -> QWidget:
        self._meme_list = MemeListPanel()
        self._meme_property = MemePropertyPanel()

        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)

        splitter = QSplitter(Qt.Horizontal)
        self._meme_list.setMinimumWidth(180)
        self._meme_property.setMinimumWidth(300)

        splitter.addWidget(self._meme_list)
        splitter.addWidget(self._meme_property)
        splitter.setSizes([260, 700])

        layout.addWidget(splitter)
        return page

    def _setup_menu(self):
        self._menu_bar = MenuBar(self)
        self.setMenuBar(self._menu_bar)

        self._menu_bar.open_project_requested.connect(self.open_project)
        self._menu_bar.save_requested.connect(self.save_current)
        self._menu_bar.exit_requested.connect(self.close)

    def _setup_status_bar(self):
        self._status_bar = QStatusBar()
        self.setStatusBar(self._status_bar)
        self._status_bar.showMessage("请通过 File → 打开项目目录（需包含 levels.json 与 memes.json）")

    def _connect_signals(self):
        # 关卡列表
        self._level_list.level_selected.connect(self._on_level_selected)
        self._level_list.add_requested.connect(self._add_level)
        self._level_list.rename_requested.connect(self._rename_level)
        self._level_list.delete_requested.connect(self._delete_level)

        # 画布
        self._canvas.object_clicked.connect(self._on_canvas_clicked)
        self._canvas.object_moved.connect(self._on_object_moved)

        # 对象树 / 属性面板
        self._object_tree.object_selected.connect(self._on_object_selected)
        self._property_panel.property_changed.connect(self._on_property_changed)

        # Meme 列表 / 属性
        self._meme_list.meme_selected.connect(self._on_meme_selected)
        self._meme_list.add_requested.connect(self._add_meme)
        self._meme_list.rename_requested.connect(self._rename_meme)
        self._meme_list.delete_requested.connect(self._delete_meme)
        self._meme_property.meme_changed.connect(self._on_meme_changed)

    # ── 项目打开 ──────────────────────────────

    def open_project(self, root: str):
        """打开项目目录并加载 levels.json / memes.json"""
        if not self._confirm_before_discard():
            return

        try:
            project = Project.open(root)
        except ProjectError as e:
            QMessageBox.critical(self, "打开项目失败", str(e))
            return
        except Exception as e:
            QMessageBox.critical(self, "打开项目失败", f"读取项目失败：{e}")
            return

        self._project = project
        self._level_entry = None
        self._level_data = None
        self._level_dirty = False
        self._memes_dirty = False
        self._levels_index_dirty = False

        # 载入 meme 默认贴图，供画布绘制硬币
        self._sync_coin_textures()

        entries = project.level_entries
        self._level_list.set_levels(entries, current=entries[0] if entries else None)
        self._clear_level_view()
        if entries:
            self._load_level(entries[0])

        meme_keys = list(project.memes.memes.keys())
        self._property_panel.set_meme_keys(meme_keys, self._meme_names())
        self._meme_list.set_memes(meme_keys,
                                  current=(meme_keys[0] if meme_keys else None),
                                  names=self._meme_names())
        self._meme_property.clear()
        if project.memes.memes:
            self._on_meme_selected(next(iter(project.memes.memes)))

        self._update_title()
        self._status_bar.showMessage(f"已打开项目：{project.root}")

    # ── 关卡 ──────────────────────────────────

    def _on_level_selected(self, entry: str):
        if entry == self._level_entry and self._level_data is not None:
            return
        if self._level_dirty:
            if not self._confirm_level_dirty():
                self._level_list.select_entry(self._level_entry)
                return
        if not self._load_level(entry):
            self._level_list.select_entry(self._level_entry)

    def _load_level(self, entry: str) -> bool:
        if not self._project:
            return False
        try:
            data = self._project.load_level(entry)
        except Exception as e:
            QMessageBox.critical(self, "加载关卡失败", f"{entry}\n\n{e}")
            return False

        self._level_entry = entry
        self._level_data = data
        self._level_dirty = False
        self._canvas.refresh(data)
        self._object_tree.refresh(data)
        self._property_panel.clear()
        self._update_title()
        self._status_bar.showMessage(f"已加载关卡：{entry}")
        return True

    def _clear_level_view(self):
        self._level_entry = None
        self._level_data = None
        self._canvas.refresh(None)
        self._object_tree.refresh(None)
        self._property_panel.clear()

    def _refresh_level_list(self, current: Optional[str] = None):
        if not self._project:
            return
        self._level_list.set_levels(self._project.level_entries,
                                    current=current or self._level_entry)

    def _add_level(self):
        if not self._project:
            self._status_bar.showMessage("请先打开项目目录")
            return
        if self._level_dirty and not self._confirm_level_dirty():
            return

        default_name = f"{len(self._project.level_entries) + 1}.json"
        default_id = len(self._project.level_entries) + 1
        dialog = NewLevelDialog(default_name, default_id, self)
        if dialog.exec() != QDialog.Accepted:
            return

        name, level_id, width, height = dialog.values()
        error = Project.validate_level_entry(name)
        if error:
            QMessageBox.warning(self, "新建关卡", error)
            return
        if name in self._project.level_entries:
            QMessageBox.warning(self, "新建关卡", f"levels.json 中已存在：{name}")
            return
        if self._project.level_exists(name):
            QMessageBox.warning(self, "新建关卡", f"文件已存在：{name}")
            return

        level = LevelData(id=level_id, width=width, height=height)
        level.wall.thickness = DEFAULT_WALL_THICKNESS
        try:
            self._project.save_level(name, level)
            self._project.level_entries.append(name)
            self._project.save_levels_index()
        except Exception as e:
            QMessageBox.critical(self, "新建关卡失败", str(e))
            return

        self._levels_index_dirty = False
        self._level_dirty = False
        self._refresh_level_list(current=name)
        self._load_level(name)

    def _rename_level(self, entry: str):
        if not self._project:
            return
        if entry == self._level_entry and self._level_dirty:
            if not self._confirm_level_dirty():
                return

        new_name, ok = QInputDialog.getText(self, "重命名关卡", "新文件名:", text=entry)
        if not ok:
            return
        new_name = new_name.strip()
        if new_name == entry:
            return

        error = Project.validate_level_entry(new_name)
        if error:
            QMessageBox.warning(self, "重命名关卡", error)
            return
        if new_name in self._project.level_entries:
            QMessageBox.warning(self, "重命名关卡", f"levels.json 中已存在：{new_name}")
            return

        old_path = self._project.resolve_level_path(entry)
        new_path = self._project.resolve_level_path(new_name)
        try:
            os.makedirs(os.path.dirname(new_path) or self._project.root, exist_ok=True)
            if os.path.isfile(old_path) and os.path.abspath(old_path) != os.path.abspath(new_path):
                os.replace(old_path, new_path)
        except Exception as e:
            QMessageBox.critical(self, "重命名失败", str(e))
            return

        index = self._project.level_entries.index(entry)
        self._project.level_entries[index] = new_name
        try:
            self._project.save_levels_index()
        except Exception as e:
            QMessageBox.critical(self, "保存 levels.json 失败", str(e))
            return

        if self._level_entry == entry:
            self._level_entry = new_name
        self._refresh_level_list(current=new_name)
        self._load_level(new_name)

    def _delete_level(self, entry: str):
        if not self._project:
            return
        if entry == self._level_entry and self._level_dirty:
            if not self._confirm_level_dirty():
                return

        reply = QMessageBox.question(
            self, "删除关卡",
            f"从 levels.json 中删除 \"{entry}\"？\n\n"
            "Yes：同时删除关卡文件\nNo：仅从列表移除\nCancel：取消",
            QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel,
            QMessageBox.No
        )
        if reply == QMessageBox.Cancel:
            return

        path = self._project.resolve_level_path(entry)
        self._project.level_entries.remove(entry)
        try:
            self._project.save_levels_index()
        except Exception as e:
            QMessageBox.critical(self, "保存 levels.json 失败", str(e))
            return

        if reply == QMessageBox.Yes and os.path.isfile(path):
            try:
                os.remove(path)
            except Exception as e:
                QMessageBox.warning(self, "删除文件失败", str(e))

        if self._level_entry == entry:
            self._clear_level_view()
            self._level_dirty = False

        entries = self._project.level_entries
        current = entries[0] if entries else None
        self._refresh_level_list(current=current)
        if current:
            self._load_level(current)
        self._update_title()

    # ── 画布 / 属性 ───────────────────────────

    def _on_canvas_clicked(self, obj: object):
        self._object_tree.select_object(obj)
        self._property_panel.show_properties(obj, self._level_data)

    def _on_object_selected(self, obj: object):
        self._property_panel.show_properties(obj, self._level_data)

    def _on_object_moved(self, obj: object):
        if not self._level_data:
            return
        self._mark_level_dirty()
        self._object_tree.refresh(self._level_data)
        self._object_tree.select_object(obj)
        self._property_panel.show_properties(obj, self._level_data)
        self._status_bar.showMessage(f"对象移动到 ({int(obj.x)}, {int(obj.y)})")

    def _on_property_changed(self, obj: object, prop_name: str, value: object):
        if not self._level_data:
            return
        self._mark_level_dirty()
        self._object_tree.refresh(self._level_data)
        self._object_tree.select_object(obj)
        self._canvas.refresh(self._level_data)
        self._status_bar.showMessage(f"属性已修改：{prop_name} = {value}")

    def _on_object_added(self, obj: object):
        """画布右键新增对象后回调"""
        if not self._level_data:
            return
        self._mark_level_dirty()
        self._object_tree.refresh(self._level_data)
        self._object_tree.select_object(obj)
        self._property_panel.show_properties(obj, self._level_data)
        self._status_bar.showMessage("已添加对象")

    def _on_object_deleted(self, obj: object):
        """画布右键删除对象后回调"""
        if not self._level_data:
            return
        self._mark_level_dirty()
        self._object_tree.refresh(self._level_data)
        self._property_panel.clear()
        self._status_bar.showMessage("已删除对象")

    # ── Meme ──────────────────────────────────

    def _on_meme_selected(self, key: str):
        if not self._project or not self._project.memes:
            return
        meme = self._project.memes.memes.get(key)
        if meme is not None:
            self._meme_property.show_meme(key, meme, self._project)

    def _refresh_meme_list(self, current: Optional[str] = None):
        if not self._project or not self._project.memes:
            return
        keys = list(self._project.memes.memes.keys())
        self._property_panel.set_meme_keys(keys, self._meme_names())
        self._sync_coin_textures()
        self._meme_list.set_memes(keys, current=current, names=self._meme_names())
        if current and current in self._project.memes.memes:
            self._on_meme_selected(current)
        else:
            self._meme_property.clear()

    def _add_meme(self):
        if not self._project or not self._project.memes:
            return

        key, ok = QInputDialog.getText(
            self, "新建 Meme", "Key:", text=self._project.memes.next_key()
        )
        if not ok:
            return
        key = key.strip()
        if not key:
            QMessageBox.warning(self, "新建 Meme", "Key 不能为空")
            return
        if key in self._project.memes.memes:
            QMessageBox.warning(self, "新建 Meme", f"Key 已存在：{key}")
            return

        self._project.memes.add(key, MemeCoin())
        if not self._save_memes_data():
            return
        self._refresh_meme_list(current=key)

    def _rename_meme(self, key: str):
        if not self._project or not self._project.memes:
            return

        new_key, ok = QInputDialog.getText(self, "重命名 Meme", "新 Key:", text=key)
        if not ok:
            return
        new_key = new_key.strip()
        if new_key == key:
            return
        if not new_key:
            QMessageBox.warning(self, "重命名 Meme", "Key 不能为空")
            return
        if new_key in self._project.memes.memes:
            QMessageBox.warning(self, "重命名 Meme", f"Key 已存在：{new_key}")
            return

        if not self._project.memes.rename(key, new_key):
            QMessageBox.warning(self, "重命名 Meme", "重命名失败")
            return
        if not self._save_memes_data():
            return
        self._refresh_meme_list(current=new_key)

    def _delete_meme(self, key: str):
        if not self._project or not self._project.memes:
            return

        reply = QMessageBox.question(
            self, "删除 Meme", f"确定删除 meme \"{key}\"？",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        )
        if reply != QMessageBox.Yes:
            return

        self._project.memes.remove(key)
        if not self._save_memes_data():
            return

        keys = list(self._project.memes.memes.keys())
        current = keys[0] if keys else None
        self._refresh_meme_list(current=current)

    def _on_meme_changed(self, meme: MemeCoin):
        self._mark_memes_dirty()
        # 贴图路径可能改变，同步刷新画布上的硬币外观
        self._sync_coin_textures()
        # name 可能刚被修改，实时刷新列表显示 “id - name”
        key = self._meme_list.current_key()
        if key and self._project and self._project.memes:
            self._meme_list.set_memes(
                list(self._project.memes.memes.keys()),
                current=key,
                names=self._meme_names(),
            )
        self._status_bar.showMessage("Meme 属性已修改")

    def _sync_coin_textures(self):
        """把 meme 的默认贴图同步给画布；映射变化时重绘当前关卡"""
        if not self._project or not self._project.memes:
            return
        if self._canvas.set_memes(self._project.memes, self._project):
            if self._level_data:
                self._canvas.refresh(self._level_data)

    def _meme_names(self) -> dict:
        """当前所有 meme 的 key -> name 映射"""
        if not self._project or not self._project.memes:
            return {}
        return {key: meme.name for key, meme in self._project.memes.memes.items()}

    # ── 保存 ──────────────────────────────────

    def save_current(self):
        """Ctrl+S：保存当前 Tab 的数据"""
        if self._tabs.currentIndex() == 0:
            self._save_level()
        else:
            self._save_memes()

    def _save_level(self) -> bool:
        if not self._project or not self._level_entry or not self._level_data:
            self._status_bar.showMessage("没有打开的关卡可保存")
            return False
        try:
            if self._levels_index_dirty:
                self._project.save_levels_index()
                self._levels_index_dirty = False
            self._project.save_level(self._level_entry, self._level_data)
        except Exception as e:
            QMessageBox.critical(self, "保存关卡失败", str(e))
            return False

        self._level_dirty = False
        self._update_title()
        self._status_bar.showMessage(f"已保存关卡：{self._level_entry}")
        return True

    def _save_memes_data(self) -> bool:
        """写入 memes.json（CRUD 操作后立即调用）"""
        if not self._project or not self._project.memes:
            return False
        try:
            self._project.save_memes()
        except Exception as e:
            QMessageBox.critical(self, "保存 memes.json 失败", str(e))
            return False
        self._memes_dirty = False
        self._update_title()
        self._status_bar.showMessage("已保存 memes.json")
        return True

    def _save_memes(self):
        self._save_memes_data()

    def _save_all(self) -> bool:
        ok = True
        if self._levels_index_dirty or self._level_dirty:
            ok = self._save_level() and ok
        if self._memes_dirty:
            ok = self._save_memes_data() and ok
        return ok

    # ── 脏状态 / 确认 ─────────────────────────

    def _mark_level_dirty(self):
        self._level_dirty = True
        self._update_title()

    def _mark_memes_dirty(self):
        self._memes_dirty = True
        self._update_title()

    def _has_unsaved(self) -> bool:
        return self._level_dirty or self._memes_dirty or self._levels_index_dirty

    def _confirm_level_dirty(self) -> bool:
        """切换关卡前处理未保存修改，返回 True 表示可以继续"""
        reply = QMessageBox.question(
            self, "未保存的修改",
            "当前关卡有未保存的修改，是否保存？",
            QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
            QMessageBox.Save
        )
        if reply == QMessageBox.Save:
            return self._save_level()
        if reply == QMessageBox.Discard:
            self._level_dirty = False
            self._update_title()
            return True
        return False

    def _confirm_before_discard(self) -> bool:
        """打开新项目前处理所有未保存修改"""
        if not self._has_unsaved():
            return True
        reply = QMessageBox.question(
            self, "未保存的修改",
            "存在未保存的修改，是否保存？",
            QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
            QMessageBox.Save
        )
        if reply == QMessageBox.Save:
            return self._save_all()
        if reply == QMessageBox.Discard:
            return True
        return False

    def _update_title(self):
        if self._project:
            title = f"CoinDuel2D Editor - {self._project.root}"
        else:
            title = "CoinDuel2D Editor"
        if self._has_unsaved():
            title += " *"
        self.setWindowTitle(title)

    def closeEvent(self, event):
        if not self._has_unsaved():
            event.accept()
            return
        reply = QMessageBox.question(
            self, "未保存的修改",
            "是否保存修改后退出？",
            QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
            QMessageBox.Save
        )
        if reply == QMessageBox.Save:
            if self._save_all():
                event.accept()
            else:
                event.ignore()
        elif reply == QMessageBox.Discard:
            event.accept()
        else:
            event.ignore()
