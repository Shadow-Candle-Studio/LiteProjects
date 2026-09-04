"""
主窗口
组装各面板，协调各组件之间的通信
"""
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QSplitter,
    QLabel, QStatusBar
)
from PySide6.QtCore import Qt

from app.models.level_data import LevelData, CoinData, BlockData, MudData, WallData
from app.widgets.menu_bar import MenuBar
from app.widgets.object_tree import ObjectTree
from app.widgets.property_panel import PropertyPanel
from app.widgets.canvas import Canvas


class MainWindow(QMainWindow):
    """主窗口"""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CoinDuel2D Editor")
        self.setMinimumSize(1200, 800)

        # 当前关卡数据
        self._level_data: LevelData = None
        self._is_dirty: bool = False  # 是否有未保存的修改

        # 初始化UI
        self._setup_ui()
        self._setup_menu()
        self._setup_status_bar()
        self._connect_signals()

    def _setup_ui(self):
        """设置主界面布局"""
        # 中央容器
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 主布局 - 水平分割
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)

        # 使用 QSplitter 实现可拖拽分割
        self._splitter = QSplitter(Qt.Horizontal)
        main_layout.addWidget(self._splitter)

        # 左侧：对象树
        self._object_tree = ObjectTree()
        self._object_tree.setMinimumWidth(200)
        self._splitter.addWidget(self._object_tree)

        # 中间：渲染画布
        self._canvas = Canvas()
        self._canvas.setMinimumSize(400, 300)
        self._splitter.addWidget(self._canvas)

        # 右侧：属性面板
        self._property_panel = PropertyPanel()
        self._property_panel.setMinimumWidth(200)
        self._splitter.addWidget(self._property_panel)

        # 设置分割比例
        self._splitter.setSizes([250, 500, 250])

    def _setup_menu(self):
        """设置菜单栏"""
        self._menu_bar = MenuBar(self)
        self.setMenuBar(self._menu_bar)

        # 连接信号
        self._menu_bar.new_requested.connect(self.new_level)
        self._menu_bar.open_requested.connect(self.open_level)
        self._menu_bar.save_requested.connect(self.save_level)
        self._menu_bar.save_as_requested.connect(self.save_level_as)
        self._menu_bar.close_requested.connect(self.close_level)

    def _setup_status_bar(self):
        """设置状态栏"""
        self._status_bar = QStatusBar()
        self.setStatusBar(self._status_bar)
        self._status_bar.showMessage("Ready")

    def _connect_signals(self):
        """连接各组件信号"""
        # 对象树选中 -> 属性面板更新 + 画布高亮
        self._object_tree.object_selected.connect(self._on_object_selected_from_tree)

        # 画布点击 -> 对象树选中 + 属性面板更新
        self._canvas.object_clicked.connect(self._on_object_clicked_from_canvas)

        # 画布移动对象 -> 标记脏 + 刷新对象树 + 属性面板
        self._canvas.object_moved.connect(self._on_object_moved)

        # 属性面板修改 -> 标记脏 + 刷新对象树 + 画布高亮
        self._property_panel.property_changed.connect(self._on_property_changed)

    def _on_object_selected_from_tree(self, obj: object):
        """对象树选中对象"""
        self._property_panel.show_properties(obj, self._level_data)

    def _on_object_clicked_from_canvas(self, obj: object):
        """画布点击对象"""
        self._object_tree.select_object(obj)
        self._property_panel.show_properties(obj, self._level_data)

    def _on_object_moved(self, obj: object):
        """对象被移动"""
        self._mark_dirty()
        # 刷新对象树以更新位置信息
        self._object_tree.refresh(self._level_data)
        self._object_tree.select_object(obj)
        # 更新属性面板
        self._property_panel.show_properties(obj, self._level_data)
        self._status_bar.showMessage(f"Object moved to ({int(obj.x)}, {int(obj.y)})")

    def _on_property_changed(self, obj: object, prop_name: str, value: object):
        """属性被修改"""
        self._mark_dirty()
        # 刷新对象树以更新显示
        self._object_tree.refresh(self._level_data)
        # 重新选中当前对象
        self._object_tree.select_object(obj)
        # 刷新画布以更新位置
        self._canvas.refresh(self._level_data)
        self._status_bar.showMessage(f"Property changed: {prop_name} = {value}")

    def _on_object_added(self, obj: object):
        """对象被添加（从画布右键菜单）"""
        self._mark_dirty()
        self._object_tree.refresh(self._level_data)
        self._object_tree.select_object(obj)
        self._property_panel.show_properties(obj, self._level_data)

        # 获取对象类型名称
        type_name = type(obj).__name__.replace("Data", "")
        self._status_bar.showMessage(f"Added {type_name} at ({obj.x}, {obj.y})")

    def _on_object_deleted(self, obj: object):
        """对象被删除（从画布右键菜单）"""
        self._mark_dirty()
        self._object_tree.refresh(self._level_data)
        self._property_panel.clear()
        self._status_bar.showMessage("Object deleted")

    def new_level(self):
        """新建关卡"""
        if self._is_dirty and not self._menu_bar.confirm_unsaved():
            return

        info = self._menu_bar.ask_new_level_info()
        if info:
            id_val, width_val, height_val = info
            self._level_data = LevelData(id=id_val, width=width_val, height=height_val)
            self._is_dirty = False
            self._refresh_all()
            self._status_bar.showMessage(f"New level created (ID: {id_val})")

    def open_level(self, file_path: str):
        """打开关卡文件"""
        if self._is_dirty and not self._menu_bar.confirm_unsaved():
            return

        try:
            self._level_data = LevelData.from_json(file_path)
            self._is_dirty = False
            self._refresh_all()
            self._status_bar.showMessage(f"Opened: {file_path}")
        except Exception as e:
            self._status_bar.showMessage(f"Error opening file: {e}")

    def save_level(self):
        """保存关卡"""
        if not self._level_data:
            self._status_bar.showMessage("No level to save")
            return

        if not self._level_data.file_path:
            self.save_level_as()
            return

        try:
            self._level_data.to_json()
            self._is_dirty = False
            self._status_bar.showMessage(f"Saved: {self._level_data.file_path}")
        except Exception as e:
            self._status_bar.showMessage(f"Error saving file: {e}")

    def save_level_as(self):
        """另存为"""
        if not self._level_data:
            self._status_bar.showMessage("No level to save")
            return

        file_path = self._menu_bar.ask_save_path()
        if file_path:
            try:
                self._level_data.to_json(file_path)
                self._is_dirty = False
                self._status_bar.showMessage(f"Saved as: {file_path}")
            except Exception as e:
                self._status_bar.showMessage(f"Error saving file: {e}")

    def close_level(self):
        """关闭当前关卡"""
        if self._is_dirty and not self._menu_bar.confirm_unsaved():
            return

        self._level_data = None
        self._is_dirty = False
        self._refresh_all()
        self._status_bar.showMessage("Level closed")

    def _refresh_all(self):
        """刷新所有面板"""
        # 刷新对象树
        self._object_tree.refresh(self._level_data)

        # 刷新画布
        self._canvas.refresh(self._level_data)

        # 清空属性面板
        self._property_panel.clear()

    def _mark_dirty(self):
        """标记有未保存的修改"""
        self._is_dirty = True

    def closeEvent(self, event):
        """关闭窗口事件"""
        if self._is_dirty:
            if not self._menu_bar.confirm_unsaved():
                event.ignore()
                return
        event.accept()
