"""
对象树组件
显示关卡中所有对象的树形结构
"""
from PySide6.QtWidgets import QTreeWidget, QTreeWidgetItem
from PySide6.QtCore import Signal, Qt
from PySide6.QtGui import QIcon

from app.models.level_data import LevelData, CoinData, BlockData, MudData, WallData


class ObjectTree(QTreeWidget):
    """对象树"""

    # 信号
    object_selected = Signal(object)   # 选中对象时发射
    object_deleted = Signal(object)    # 删除对象时发射

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setHeaderLabels(["Object"])
        self.setColumnCount(1)
        self.setAlternatingRowColors(True)

        # 存储节点与数据的映射
        self._item_to_data = {}
        self._data_to_item = {}

        # 连接信号
        self.itemClicked.connect(self._on_item_clicked)

    def refresh(self, level_data: LevelData):
        """刷新树"""
        self.clear()
        self._item_to_data.clear()
        self._data_to_item.clear()

        if not level_data:
            return

        # 根节点：Table
        table_item = QTreeWidgetItem(self, [f"Table ({level_data.width} x {level_data.height})"])
        table_item.setData(0, Qt.UserRole, None)  # Table 不关联具体对象
        table_item.setExpanded(True)

        # Wall 子节点（不可删除）
        wall_item = QTreeWidgetItem(table_item, [f"Wall (thickness: {level_data.wall.thickness})"])
        wall_item.setData(0, Qt.UserRole, level_data.wall)
        wall_item.setExpanded(True)

        # 条目分组（items 已按类型合并存储，此处按类型分组显示）
        coins_group = QTreeWidgetItem(table_item, [f"Coins ({len(level_data.coins)})"])
        coins_group.setData(0, Qt.UserRole, None)
        coins_group.setExpanded(True)

        blocks_group = QTreeWidgetItem(table_item, [f"Blocks ({len(level_data.blocks)})"])
        blocks_group.setData(0, Qt.UserRole, None)
        blocks_group.setExpanded(True)

        muds_group = QTreeWidgetItem(table_item, [f"Muds ({len(level_data.muds)})"])
        muds_group.setData(0, Qt.UserRole, None)
        muds_group.setExpanded(True)

        coin_num = block_num = mud_num = 0
        for obj in level_data.items:
            if isinstance(obj, BlockData):
                block_num += 1
                info = f"({int(obj.x)}, {int(obj.y)}) r={int(obj.radius)}"
                item = QTreeWidgetItem(blocks_group, [f"Block #{block_num} {info}"])
            elif isinstance(obj, MudData):
                mud_num += 1
                info = f"({int(obj.x)}, {int(obj.y)}) r={int(obj.radius)} f={obj.friction}"
                item = QTreeWidgetItem(muds_group, [f"Mud #{mud_num} {info}"])
            else:
                coin_num += 1
                item = QTreeWidgetItem(coins_group, [f"Coin #{coin_num} ({int(obj.x)}, {int(obj.y)})"])
            item.setData(0, Qt.UserRole, obj)
            self._item_to_data[id(item)] = obj
            self._data_to_item[id(obj)] = item

        self.resizeColumnToContents(0)

    def select_object(self, obj: object):
        """外部调用：选中指定对象"""
        if obj is None:
            self.clearSelection()
            return

        item = self._data_to_item.get(id(obj))
        if item:
            self.setCurrentItem(item)
            self.scrollToItem(item)

    def _on_item_clicked(self, item: QTreeWidgetItem, column: int):
        """点击节点"""
        data = item.data(0, Qt.UserRole)
        self.object_selected.emit(data)

    def get_selected_object(self) -> object:
        """获取当前选中的对象"""
        item = self.currentItem()
        if item:
            return item.data(0, Qt.UserRole)
        return None
