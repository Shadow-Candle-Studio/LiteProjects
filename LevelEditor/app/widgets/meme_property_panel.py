"""
Meme 属性面板
编辑 memes.json 中单个 meme 的贴图/音效路径

资源路径统一以项目根目录为基准（使用 / 分隔），与游戏内 resources 路径一致。
"""
import os
from typing import Optional

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QHBoxLayout, QLabel,
    QLineEdit, QPushButton, QScrollArea, QGroupBox, QFileDialog
)

from app.models.meme_data import MemeCoin
from app.models.project import Project

# (JSON 字段名/属性名, 显示名称, 控件类型)
MEME_FIELD_DEFS = [
    ("name", "Name（名称）", "text"),
    ("texture", "Texture（默认外观）", "image"),
    ("idle_texture", "Idle Texture（空闲）", "image"),
    ("aim_texture", "Aim Texture（拖拽瞄准）", "image"),
    ("shot_texture", "Shot Texture（发射）", "image"),
    ("hitted_texture", "Hitted Texture（被打击）", "image"),
    ("shot_sfx", "Shot SFX（发射音效）", "audio"),
    ("hitted_sfx", "Hitted SFX（被打击音效）", "audio"),
]

IMAGE_FILTER = "Images (*.png *.jpg *.jpeg *.webp);;All Files (*)"
AUDIO_FILTER = "Audio (*.wav *.mp3 *.ogg);;All Files (*)"


class MemePropertyPanel(QWidget):
    """Meme 编辑器右侧属性面板"""

    meme_changed = Signal(object)  # 参数为被修改的 MemeCoin

    def __init__(self, parent=None):
        super().__init__(parent)
        self._meme: Optional[MemeCoin] = None
        self._project: Optional[Project] = None
        self._form_widget: Optional[QGroupBox] = None
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        layout.addWidget(scroll)

        self._content_widget = QWidget()
        self._content_layout = QVBoxLayout(self._content_widget)
        scroll.setWidget(self._content_widget)

        self._placeholder = QLabel("No meme selected")
        self._placeholder.setAlignment(Qt.AlignCenter)
        self._content_layout.addWidget(self._placeholder)
        self._content_layout.addStretch(1)

    def show_meme(self, key: str, meme: Optional[MemeCoin], project: Optional[Project]):
        """显示某个 meme 的属性"""
        self._meme = meme
        self._project = project

        if self._form_widget:
            self._content_layout.removeWidget(self._form_widget)
            self._form_widget.deleteLater()
            self._form_widget = None

        if meme is None:
            self._placeholder.show()
            return

        self._placeholder.hide()

        self._form_widget = QGroupBox(f"Meme \"{key}\"")
        form = QFormLayout(self._form_widget)
        form.setFieldGrowthPolicy(QFormLayout.AllNonFixedFieldsGrow)

        for attr, label, kind in MEME_FIELD_DEFS:
            form.addRow(f"{label}:", self._create_path_editor(attr, label, kind))

        if project:
            hint = QLabel(f"路径相对项目目录：{project.root}")
            hint.setWordWrap(True)
            hint.setStyleSheet("color: gray;")
            form.addRow("", hint)

        self._content_layout.insertWidget(0, self._form_widget)

    def _create_path_editor(self, attr: str, label: str, kind: str) -> QWidget:
        """创建属性编辑行：text 为纯文本输入，image/audio 带浏览按钮"""
        container = QWidget()
        row = QHBoxLayout(container)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(4)

        line_edit = QLineEdit(getattr(self._meme, attr, ""))
        if kind == "text":
            line_edit.setPlaceholderText("例如：普通硬币")
        elif kind == "image":
            line_edit.setPlaceholderText("textures/coin_1.png")
        else:
            line_edit.setPlaceholderText("sounds/coin_1_shot.wav")
        line_edit.textChanged.connect(lambda text, a=attr: self._on_field_changed(a, text))
        row.addWidget(line_edit, 1)

        if kind != "text":
            browse_btn = QPushButton("...")
            browse_btn.setMaximumWidth(32)
            browse_btn.clicked.connect(lambda _=False, le=line_edit: self._browse(le, label, kind))
            row.addWidget(browse_btn)

        return container

    def _on_field_changed(self, attr: str, text: str):
        if self._meme is None:
            return
        setattr(self._meme, attr, text)
        self.meme_changed.emit(self._meme)

    def _browse(self, line_edit: QLineEdit, label: str, kind: str):
        if not self._project:
            return

        current = line_edit.text().strip()
        start = self._project.absolute_path(current) if current else self._project.root
        if not os.path.isdir(os.path.dirname(start)):
            start = self._project.root

        file_filter = IMAGE_FILTER if kind == "image" else AUDIO_FILTER
        path, _ = QFileDialog.getOpenFileName(self, f"选择 {label}", start, file_filter)
        if path:
            line_edit.setText(self._project.relative_path(path))

    def clear(self):
        """清空面板"""
        self._meme = None
        self._project = None
        if self._form_widget:
            self._content_layout.removeWidget(self._form_widget)
            self._form_widget.deleteLater()
            self._form_widget = None
        self._placeholder.show()
