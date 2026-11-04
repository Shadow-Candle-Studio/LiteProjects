"""
Meme 列表面板
显示 memes.json 中 coins 的 key 列表，支持选择/新增/重命名/删除
"""
from typing import Dict, List, Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QListWidget,
    QPushButton, QAbstractItemView
)


class MemeListPanel(QWidget):
    """Meme 编辑器左侧列表"""

    meme_selected = Signal(str)       # 选中 meme 的 key
    add_requested = Signal()
    rename_requested = Signal(str)    # 当前 key
    delete_requested = Signal(str)    # 当前 key

    def __init__(self, parent=None):
        super().__init__(parent)
        self._keys: List[str] = []
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        title = QLabel("Memes")
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

    def set_memes(self, keys: List[str], current: Optional[str] = None,
                  names: Optional[Dict[str, str]] = None):
        """刷新列表，显示为 “id - name”（name 为空时只显示 id）"""
        self._keys = list(keys)
        names = names or {}

        self._list.blockSignals(True)
        self._list.clear()
        for key in self._keys:
            name = (names.get(key) or "").strip()
            self._list.addItem(f"{key} - {name}" if name else key)
        if current and current in self._keys:
            self._list.setCurrentRow(self._keys.index(current))
        self._list.blockSignals(False)
        self._update_buttons()

    def select_key(self, key: Optional[str]):
        """外部选中指定 key（不触发信号）"""
        self._list.blockSignals(True)
        if key and key in self._keys:
            self._list.setCurrentRow(self._keys.index(key))
        else:
            self._list.clearSelection()
            self._list.setCurrentRow(-1)
        self._list.blockSignals(False)
        self._update_buttons()

    def current_key(self) -> Optional[str]:
        row = self._list.currentRow()
        if 0 <= row < len(self._keys):
            return self._keys[row]
        return None

    def _update_buttons(self):
        has_selection = self.current_key() is not None
        self._rename_btn.setEnabled(has_selection)
        self._delete_btn.setEnabled(has_selection)

    def _on_current_row_changed(self, row: int):
        self._update_buttons()
        if 0 <= row < len(self._keys):
            self.meme_selected.emit(self._keys[row])

    def _emit_rename(self):
        key = self.current_key()
        if key is not None:
            self.rename_requested.emit(key)

    def _emit_delete(self):
        key = self.current_key()
        if key is not None:
            self.delete_requested.emit(key)
