"""
关卡列表面板
显示 levels.json 中的关卡条目，支持选择/新增/重命名/删除
"""
from typing import List, Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QListWidget,
    QPushButton, QAbstractItemView
)


class LevelListPanel(QWidget):
    """左侧关卡选择列表"""

    level_selected = Signal(str)      # 选中关卡（levels.json 中的条目名）
    add_requested = Signal()
    rename_requested = Signal(str)    # 当前条目
    delete_requested = Signal(str)    # 当前条目

    def __init__(self, parent=None):
        super().__init__(parent)
        self._entries: List[str] = []
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        title = QLabel("Levels")
        title.setStyleSheet("font-weight: bold;")
        layout.addWidget(title)

        self._list = QListWidget()
        self._list.setSelectionMode(QAbstractItemView.SingleSelection)
        self._list.currentRowChanged.connect(self._on_current_row_changed)
        layout.addWidget(self._list, 1)

        buttons = QHBoxLayout()
        buttons.setSpacing(4)

        self._add_btn = QPushButton("Add")
        self._add_btn.clicked.connect(self.add_requested.emit)
        buttons.addWidget(self._add_btn)

        self._rename_btn = QPushButton("Rename")
        self._rename_btn.setEnabled(False)
        self._rename_btn.clicked.connect(self._emit_rename)
        buttons.addWidget(self._rename_btn)

        self._delete_btn = QPushButton("Delete")
        self._delete_btn.setEnabled(False)
        self._delete_btn.clicked.connect(self._emit_delete)
        buttons.addWidget(self._delete_btn)

        layout.addLayout(buttons)

    def set_levels(self, entries: List[str], current: Optional[str] = None):
        """刷新列表；current 为需要选中的条目名"""
        self._entries = list(entries)
        self._list.blockSignals(True)
        self._list.clear()
        self._list.addItems(self._entries)
        if current and current in self._entries:
            self._list.setCurrentRow(self._entries.index(current))
        self._list.blockSignals(False)
        self._update_buttons()

    def select_entry(self, entry: Optional[str]):
        """外部选中指定条目（不触发信号）"""
        self._list.blockSignals(True)
        if entry and entry in self._entries:
            self._list.setCurrentRow(self._entries.index(entry))
        else:
            self._list.clearSelection()
            self._list.setCurrentRow(-1)
        self._list.blockSignals(False)
        self._update_buttons()

    def current_entry(self) -> Optional[str]:
        row = self._list.currentRow()
        if 0 <= row < len(self._entries):
            return self._entries[row]
        return None

    def _update_buttons(self):
        has_selection = self.current_entry() is not None
        self._rename_btn.setEnabled(has_selection)
        self._delete_btn.setEnabled(has_selection)

    def _on_current_row_changed(self, row: int):
        self._update_buttons()
        if 0 <= row < len(self._entries):
            self.level_selected.emit(self._entries[row])

    def _emit_rename(self):
        entry = self.current_entry()
        if entry:
            self.rename_requested.emit(entry)

    def _emit_delete(self):
        entry = self.current_entry()
        if entry:
            self.delete_requested.emit(entry)
