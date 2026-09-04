"""
菜单栏组件
提供文件操作菜单：新建、打开、保存、另存为、关闭
"""
from PySide6.QtWidgets import QMenuBar, QFileDialog, QMessageBox
from PySide6.QtGui import QAction
from PySide6.QtCore import Signal


class MenuBar(QMenuBar):
    """主菜单栏"""

    # 信号
    new_requested = Signal()        # 请求新建关卡
    open_requested = Signal(str)    # 请求打开文件，参数为文件路径
    save_requested = Signal()       # 请求保存
    save_as_requested = Signal()    # 请求另存为
    close_requested = Signal()      # 请求关闭

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_menus()

    def _setup_menus(self):
        """设置菜单"""
        # File 菜单
        file_menu = self.addMenu("File")

        # New
        new_action = QAction("New", self)
        new_action.setShortcut("Ctrl+N")
        new_action.triggered.connect(self.new_requested.emit)
        file_menu.addAction(new_action)

        # Open
        open_action = QAction("Open", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self._on_open)
        file_menu.addAction(open_action)

        file_menu.addSeparator()

        # Save
        save_action = QAction("Save", self)
        save_action.setShortcut("Ctrl+S")
        save_action.triggered.connect(self.save_requested.emit)
        file_menu.addAction(save_action)

        # Save As
        save_as_action = QAction("Save As", self)
        save_as_action.setShortcut("Ctrl+Shift+S")
        save_as_action.triggered.connect(self.save_as_requested.emit)
        file_menu.addAction(save_as_action)

        file_menu.addSeparator()

        # Close
        close_action = QAction("Close", self)
        close_action.triggered.connect(self.close_requested.emit)
        file_menu.addAction(close_action)

    def _on_open(self):
        """打开文件对话框"""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open Level File", "", "JSON Files (*.json);;All Files (*)"
        )
        if file_path:
            self.open_requested.emit(file_path)

    def ask_save_path(self) -> str:
        """弹出保存文件对话框，返回路径"""
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save Level File", "", "JSON Files (*.json);;All Files (*)"
        )
        return file_path

    def ask_new_level_info(self) -> tuple:
        """弹出新建关卡对话框，返回 (id, width, height) 或 None"""
        from PySide6.QtWidgets import QInputDialog

        id_val, ok1 = QInputDialog.getInt(self, "New Level", "Level ID:", 1, 1, 9999)
        if not ok1:
            return None

        width_val, ok2 = QInputDialog.getInt(self, "New Level", "Width:", 800, 100, 4000)
        if not ok2:
            return None

        height_val, ok3 = QInputDialog.getInt(self, "New Level", "Height:", 600, 100, 4000)
        if not ok3:
            return None

        return (id_val, width_val, height_val)

    def confirm_unsaved(self) -> bool:
        """确认是否有未保存的修改，返回 True 表示可以继续"""
        reply = QMessageBox.question(
            self, "Unsaved Changes",
            "There are unsaved changes. Do you want to continue?",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        return reply == QMessageBox.Yes
