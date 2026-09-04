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

        # Coins 分组
        coins_item = QTreeWidgetItem(table_item, [f"Coins ({len(level_data.coins)})"])
        coins_item.setData(0, Qt.UserRole, None)
        coins_item.setExpanded(True)

        for i, coin in enumerate(level_data.coins):
            item = QTreeWidgetItem(coins_item, [f"Coin #{i+1} ({int(coin.x)}, {int(coin.y)})"])
            item.setData(0, Qt.UserRole, coin)
            self._item_to_data[id(item)] = coin
            self._data_to_item[id(coin)] = item

        # Blocks 分组
        blocks_item = QTreeWidgetItem(table_item, [f"Blocks ({len(level_data.blocks)})"])
        blocks_item.setData(0, Qt.UserRole, None)
        blocks_item.setExpanded(True)

        for i, block in enumerate(level_data.blocks):
            info = f"({int(block.x)}, {int(block.y)}) r={int(block.radius)}"
            item = QTreeWidgetItem(blocks_item, [f"Block #{i+1} {info}"])
            item.setData(0, Qt.UserRole, block)
            self._item_to_data[id(item)] = block
            self._data_to_item[id(block)] = item

        # Muds 分组
        muds_item = QTreeWidgetItem(table_item, [f"Muds ({len(level_data.muds)})"])
        muds_item.setData(0, Qt.UserRole, None)
        muds_item.setExpanded(True)

        for i, mud in enumerate(level_data.muds):
            info = f"({int(mud.x)}, {int(mud.y)}) r={int(mud.radius)} f={mud.friction}"
            item = QTreeWidgetItem(muds_item, [f"Mud #{i+1} {info}"])
            item.setData(0, Qt.UserRole, mud)
            self._item_to_data[id(item)] = mud
            self._data_to_item[id(mud)] = item

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
