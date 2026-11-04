"""
新建关卡对话框
"""
from PySide6.QtWidgets import (
    QDialog, QFormLayout, QLineEdit, QSpinBox, QDialogButtonBox, QVBoxLayout
)


class NewLevelDialog(QDialog):
    """收集新关卡的文件名、ID 与桌面尺寸"""

    def __init__(self, default_name: str, default_id: int, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新建关卡")

        layout = QVBoxLayout(self)
        form = QFormLayout()

        self._name_edit = QLineEdit(default_name)
        form.addRow("文件名:", self._name_edit)

        self._id_spin = QSpinBox()
        self._id_spin.setRange(1, 9999)
        self._id_spin.setValue(default_id)
        form.addRow("关卡 ID:", self._id_spin)

        self._width_spin = QSpinBox()
        self._width_spin.setRange(100, 4000)
        self._width_spin.setValue(800)
        form.addRow("Width:", self._width_spin)

        self._height_spin = QSpinBox()
        self._height_spin.setRange(100, 4000)
        self._height_spin.setValue(600)
        form.addRow("Height:", self._height_spin)

        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def values(self) -> tuple:
        """返回 (文件名, id, width, height)"""
        return (
            self._name_edit.text().strip(),
            self._id_spin.value(),
            self._width_spin.value(),
            self._height_spin.value(),
        )
