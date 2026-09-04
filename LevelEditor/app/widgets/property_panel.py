"""
属性面板组件
显示和编辑选中对象的属性
"""
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLabel,
    QSpinBox, QDoubleSpinBox, QComboBox, QScrollArea, QGroupBox
)
from PySide6.QtCore import Signal, Qt

from app.models.level_data import CoinData, BlockData, MudData, LevelData, WallData


class PropertyPanel(QWidget):
    """属性面板"""

    # 信号：属性已修改 (对象, 属性名, 新值)
    property_changed = Signal(object, str, object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._current_obj = None
        self._level_data = None
        self._setup_ui()

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
        self._content_layout.addWidget(self._form_widget)
        return self._form_layout

    def _show_table_properties(self, level: LevelData):
        """显示 Table 属性"""
        form = self._create_form("Table")

    def _show_wall_properties(self, wall: WallData):
        """显示 Wall 属性"""
        form = self._create_form("Wall")

        # Thickness
        thickness_spin = QSpinBox()
        thickness_spin.setRange(1, 100)
        thickness_spin.setValue(wall.thickness)
        thickness_spin.valueChanged.connect(lambda v: self._on_property_changed("thickness", v))
        form.addRow("Thickness:", thickness_spin)

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

    def _show_coin_properties(self, coin: CoinData):
        """显示 Coin 属性"""
        form = self._create_form("Coin")

        # Class
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
            self._form_widget.deleteLater()
            self._form_widget = None
        self._placeholder.show()
