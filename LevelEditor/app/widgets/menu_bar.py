"""
菜单栏组件
提供项目目录打开、保存与退出
"""
from PySide6.QtWidgets import QMenuBar, QFileDialog, QMessageBox
from PySide6.QtGui import QAction
from PySide6.QtCore import Signal


class MenuBar(QMenuBar):
    """主菜单栏"""

    # 信号
    open_project_requested = Signal(str)  # 参数为项目目录路径
    save_requested = Signal()             # 请求保存当前页面
    exit_requested = Signal()             # 请求退出

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_menus()

    def _setup_menus(self):
        """设置菜单"""
        file_menu = self.addMenu("File")

        open_action = QAction("打开项目目录...", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self._on_open_project)
        file_menu.addAction(open_action)

        file_menu.addSeparator()

        save_action = QAction("保存", self)
        save_action.setShortcut("Ctrl+S")
        save_action.triggered.connect(self.save_requested.emit)
        file_menu.addAction(save_action)

        file_menu.addSeparator()

        exit_action = QAction("退出", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.exit_requested.emit)
        file_menu.addAction(exit_action)

    def _on_open_project(self):
        """选择项目目录（如 CoinDuel2D/assets/Resources）"""
        directory = QFileDialog.getExistingDirectory(
            self, "打开项目目录（需包含 levels.json 与 memes.json）", ""
        )
        if directory:
            self.open_project_requested.emit(directory)

    def confirm_unsaved(self) -> bool:
        """确认是否放弃未保存的修改，返回 True 表示可以继续"""
        reply = QMessageBox.question(
            self, "未保存的修改",
            "存在未保存的修改，是否放弃这些修改？",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        return reply == QMessageBox.Yes
