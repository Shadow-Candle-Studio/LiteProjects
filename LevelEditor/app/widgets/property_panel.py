"""
属性面板组件
显示和编辑选中对象的属性
"""
from typing import Dict, List, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLabel,
    QSpinBox, QDoubleSpinBox, QComboBox, QScrollArea, QGroupBox,
    QCheckBox, QTableWidget, QTableWidgetItem, QHeaderView, QAbstractItemView
)
from PySide6.QtCore import Signal, Qt

from app.models.behavior_meta import get_behavior_meta
from app.models.level_data import CoinData, BlockData, MudData, LevelData, WallData


class PropertyPanel(QWidget):
    """属性面板"""

    # 信号：属性已修改 (对象, 属性名, 新值)
    property_changed = Signal(object, str, object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._current_obj = None
        self._level_data = None
        self._meme_keys: List[str] = []
        self._meme_names: Dict[str, str] = {}
        self._setup_ui()

    def set_meme_keys(self, keys: List[str], names: Optional[Dict[str, str]] = None):
        """设置 Coin 的 class 下拉选项（memes.json 中的 key 与 name）"""
        self._meme_keys = list(keys)
        self._meme_names = dict(names or {})

    def _setup_ui(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # 滚动区域
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        layout.addWidget(scroll)

        # 内容容器
        self._content_widget = QWidget()
        self._content_layout = QVBoxLayout(self._content_widget)
        scroll.setWidget(self._content_widget)

        # 默认提示
        self._placeholder = QLabel("No object selected")
        self._placeholder.setAlignment(Qt.AlignCenter)
        self._content_layout.addWidget(self._placeholder)

        # 属性表单（动态创建）
        self._form_widget = None
        self._form_layout = None

    def show_properties(self, obj: object, level_data: LevelData = None):
        """显示对象属性"""
        self._current_obj = obj
        self._level_data = level_data

        # 清除旧的表单
        if self._form_widget:
            self._content_layout.removeWidget(self._form_widget)
            self._form_widget.deleteLater()
            self._form_widget = None

        if obj is None:
            self._placeholder.show()
            return

        self._placeholder.hide()

        # 根据对象类型创建表单
        if isinstance(obj, WallData):
            self._show_wall_properties(obj)
        elif isinstance(obj, CoinData):
            self._show_coin_properties(obj)
        elif isinstance(obj, BlockData):
            self._show_block_properties(obj)
        elif isinstance(obj, MudData):
            self._show_mud_properties(obj)
        elif isinstance(obj, LevelData):
            self._show_table_properties(obj)

    def _create_form(self, title: str):
        """创建表单容器"""
        self._form_widget = QGroupBox(title)
        self._form_layout = QFormLayout(self._form_widget)
        # 紧凑布局：缩小行距与边距
        self._form_layout.setVerticalSpacing(4)
        self._form_layout.setHorizontalSpacing(8)
        self._form_layout.setContentsMargins(6, 4, 6, 4)
        self._form_layout.setLabelAlignment(Qt.AlignRight | Qt.AlignVCenter)
        self._form_layout.setFieldGrowthPolicy(QFormLayout.AllNonFixedFieldsGrow)
        self._content_layout.addWidget(self._form_widget)
        return self._form_layout

    def _show_table_properties(self, level: LevelData):
        """显示 Table 属性"""
        form = self._create_form("Table")

        # ID
        id_spin = QSpinBox()
        id_spin.setRange(1, 9999)
        id_spin.setValue(level.id)
        id_spin.valueChanged.connect(lambda v: self._on_property_changed("id", v))
        form.addRow("ID:", id_spin)

        # Width
        width_spin = QSpinBox()
        width_spin.setRange(100, 4000)
        width_spin.setValue(level.width)
        width_spin.valueChanged.connect(lambda v: self._on_property_changed("width", v))
        form.addRow("Width:", width_spin)

        # Height
        height_spin = QSpinBox()
        height_spin.setRange(100, 4000)
        height_spin.setValue(level.height)
        height_spin.valueChanged.connect(lambda v: self._on_property_changed("height", v))
        form.addRow("Height:", height_spin)

    def _show_wall_properties(self, wall: WallData):
        """显示 Wall 属性"""
        form = self._create_form("Wall")

        # Thickness
        thickness_spin = QSpinBox()
        thickness_spin.setRange(1, 100)
        thickness_spin.setValue(wall.thickness)
        thickness_spin.valueChanged.connect(lambda v: self._on_property_changed("thickness", v))
        form.addRow("Thickness:", thickness_spin)

    def _show_coin_properties(self, coin: CoinData):
        """显示 Coin 属性"""
        form = self._create_form("Coin")

        # Class（从 memes.json 的 key 中选择；无 meme 数据时回退为数字输入）
        if self._meme_keys:
            cls_combo = QComboBox()
            current = str(coin.cls)
            options = list(self._meme_keys)
            if current not in options:
                options.insert(0, current)
            for key in options:
                name = (self._meme_names.get(key) or "").strip()
                cls_combo.addItem(f"{key} - {name}" if name else key, key)
            index = cls_combo.findData(current)
            if index >= 0:
                cls_combo.setCurrentIndex(index)
            cls_combo.currentIndexChanged.connect(
                lambda _index: self._on_class_changed(cls_combo.currentData())
            )
            form.addRow("Class:", cls_combo)
        else:
            cls_spin = QSpinBox()
            cls_spin.setRange(1, 100)
            cls_spin.setValue(coin.cls)
            cls_spin.valueChanged.connect(lambda v: self._on_property_changed("cls", v))
            form.addRow("Class:", cls_spin)

        # X
        x_spin = QSpinBox()
        x_spin.setRange(-9999, 9999)
        x_spin.setValue(int(coin.x))
        x_spin.valueChanged.connect(lambda v: self._on_property_changed("x", v))
        form.addRow("X:", x_spin)

        # Y
        y_spin = QSpinBox()
        y_spin.setRange(-9999, 9999)
        y_spin.setValue(int(coin.y))
        y_spin.valueChanged.connect(lambda v: self._on_property_changed("y", v))
        form.addRow("Y:", y_spin)

        # Can Shot（false = 环境硬币，静态障碍）
        canshot_check = QCheckBox("可操作（玩家可拖拽）")
        canshot_check.setChecked(coin.canshot)
        canshot_check.toggled.connect(lambda v: self._on_property_changed("canshot", v))
        form.addRow("Can Shot:", canshot_check)

        # Behaviors（可多选；exclusive=true 的行为每枚硬币最多一个）
        metas = get_behavior_meta()
        meta_map = {meta.id: meta for meta in metas}

        # 兼容旧数据：若已存在多个 exclusive 行为，只保留优先级最高的一个
        exclusive_checked = [b for b in coin.behaviors
                             if meta_map.get(b) and meta_map[b].exclusive]
        if len(exclusive_checked) > 1:
            keep = max(exclusive_checked, key=lambda b: meta_map[b].priority)
            coin.behaviors = [
                b for b in coin.behaviors
                if b == keep or not (meta_map.get(b) and meta_map[b].exclusive)
            ]

        behavior_table = QTableWidget(len(metas), 4)
        behavior_table.setHorizontalHeaderLabels(["Behavior", "Priority", "Mode", "Exclusive"])
        behavior_table.verticalHeader().setVisible(False)
        behavior_table.verticalHeader().setDefaultSectionSize(24)
        behavior_table.setSelectionMode(QAbstractItemView.NoSelection)
        behavior_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        behavior_table.setShowGrid(False)
        behavior_table.setWordWrap(False)

        header = behavior_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.Stretch)
        for column in (1, 2, 3):
            header.setSectionResizeMode(column, QHeaderView.ResizeToContents)

        for row, meta in enumerate(metas):
            name_item = QTableWidgetItem(meta.id)
            name_item.setFlags(name_item.flags() | Qt.ItemIsUserCheckable)
            name_item.setCheckState(Qt.Checked if meta.id in coin.behaviors else Qt.Unchecked)
            behavior_table.setItem(row, 0, name_item)

            priority_item = QTableWidgetItem(str(meta.priority))
            priority_item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            behavior_table.setItem(row, 1, priority_item)

            behavior_table.setItem(row, 2, QTableWidgetItem(meta.mode))
            behavior_table.setItem(row, 3, QTableWidgetItem("Yes" if meta.exclusive else ""))

        # 按行数撑开表格，避免新增 behavior 后只能靠内部滚动查看
        rows_height = 24 * behavior_table.rowCount()
        header_height = max(behavior_table.horizontalHeader().sizeHint().height(), 24)
        behavior_table.setFixedHeight(rows_height + header_height + 4)

        behavior_table.itemChanged.connect(
            lambda item: self._on_behavior_item_changed(behavior_table, item, meta_map)
        )
        form.addRow("Behaviors:", behavior_table)

    def _on_class_changed(self, key: object):
        """Class 下拉选择变化：把 meme key 尽量存为数字以匹配关卡 JSON"""
        text = "" if key is None else str(key)
        try:
            value: object = int(text)
        except ValueError:
            value = text
        self._on_property_changed("cls", value)

    def _on_behavior_item_changed(self, table: QTableWidget, item: QTableWidgetItem,
                                  meta_map: dict):
        """勾选行为变化：exclusive 行为互斥，每枚硬币最多一个"""
        if item.column() != 0:
            return

        changed_id = table.item(item.row(), 0).text()
        changed_meta = meta_map.get(changed_id)
        if item.checkState() == Qt.Checked and changed_meta and changed_meta.exclusive:
            table.blockSignals(True)
            for row in range(table.rowCount()):
                other = table.item(row, 0)
                if other.text() == changed_id:
                    continue
                other_meta = meta_map.get(other.text())
                if other_meta and other_meta.exclusive:
                    other.setCheckState(Qt.Unchecked)
            table.blockSignals(False)

        behaviors = [
            table.item(row, 0).text()
            for row in range(table.rowCount())
            if table.item(row, 0).checkState() == Qt.Checked
        ]
        self._on_property_changed("behaviors", behaviors)

    def _show_block_properties(self, block: BlockData):
        """显示 Block 属性"""
        form = self._create_form("Block")

        # X
        x_spin = QSpinBox()
        x_spin.setRange(-9999, 9999)
        x_spin.setValue(int(block.x))
        x_spin.valueChanged.connect(lambda v: self._on_property_changed("x", v))
        form.addRow("X:", x_spin)

        # Y
        y_spin = QSpinBox()
        y_spin.setRange(-9999, 9999)
        y_spin.setValue(int(block.y))
        y_spin.valueChanged.connect(lambda v: self._on_property_changed("y", v))
        form.addRow("Y:", y_spin)

        # Shape
        shape_combo = QComboBox()
        shape_combo.addItems(["circle", "rect"])
        shape_combo.setCurrentText(block.shape)
        shape_combo.currentTextChanged.connect(lambda v: self._on_property_changed("shape", v))
        form.addRow("Shape:", shape_combo)

        # Radius
        radius_spin = QDoubleSpinBox()
        radius_spin.setRange(1, 500)
        radius_spin.setDecimals(1)
        radius_spin.setValue(block.radius)
        radius_spin.valueChanged.connect(lambda v: self._on_property_changed("radius", v))
        form.addRow("Radius:", radius_spin)

        # Path (只读显示)
        if block.path:
            path_str = " → ".join([f"({p['x']},{p['y']})" for p in block.path])
            path_label = QLabel(path_str)
            path_label.setWordWrap(True)
            form.addRow("Path:", path_label)

    def _show_mud_properties(self, mud: MudData):
        """显示 Mud 属性"""
        form = self._create_form("Mud")

        # X
        x_spin = QSpinBox()
        x_spin.setRange(-9999, 9999)
        x_spin.setValue(int(mud.x))
        x_spin.valueChanged.connect(lambda v: self._on_property_changed("x", v))
        form.addRow("X:", x_spin)

        # Y
        y_spin = QSpinBox()
        y_spin.setRange(-9999, 9999)
        y_spin.setValue(int(mud.y))
        y_spin.valueChanged.connect(lambda v: self._on_property_changed("y", v))
        form.addRow("Y:", y_spin)

        # Shape
        shape_combo = QComboBox()
        shape_combo.addItems(["circle", "rect"])
        shape_combo.setCurrentText(mud.shape)
        shape_combo.currentTextChanged.connect(lambda v: self._on_property_changed("shape", v))
        form.addRow("Shape:", shape_combo)

        # Radius
        radius_spin = QDoubleSpinBox()
        radius_spin.setRange(1, 500)
        radius_spin.setDecimals(1)
        radius_spin.setValue(mud.radius)
        radius_spin.valueChanged.connect(lambda v: self._on_property_changed("radius", v))
        form.addRow("Radius:", radius_spin)

        # Friction
        friction_spin = QDoubleSpinBox()
        friction_spin.setRange(0.0, 10.0)
        friction_spin.setDecimals(2)
        friction_spin.setSingleStep(0.1)
        friction_spin.setValue(mud.friction)
        friction_spin.valueChanged.connect(lambda v: self._on_property_changed("friction", v))
        form.addRow("Friction:", friction_spin)

    def _on_property_changed(self, prop_name: str, value: object):
        """属性修改时触发"""
        if self._current_obj:
            setattr(self._current_obj, prop_name, value)
            self.property_changed.emit(self._current_obj, prop_name, value)

    def clear(self):
        """清空属性面板"""
        self._current_obj = None
        if self._form_widget:
            self._content_layout.removeWidget(self._form_widget)
            self._form_widget.deleteLater()
            self._form_widget = None
        self._placeholder.show()
