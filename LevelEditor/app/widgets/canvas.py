"""
渲染画布组件
使用 QGraphicsView/QGraphicsScene 渲染桌面和对象

坐标系说明：
- JSON/Cocos 坐标系：原点在桌面中央，X向右，Y向上
- Qt 坐标系：原点在左上角，X向右，Y向下
- 转换公式：qt_x = width/2 + cocos_x, qt_y = height/2 - cocos_y
"""
from PySide6.QtWidgets import (
    QGraphicsView, QGraphicsScene, QGraphicsRectItem,
    QGraphicsEllipseItem, QGraphicsPathItem, QGraphicsItem,
    QMenu, QGraphicsItemGroup, QGraphicsPixmapItem
)
from PySide6.QtCore import Signal, Qt, QPointF, QRectF
from PySide6.QtGui import (
    QPen, QBrush, QColor, QPainter, QPainterPath,
    QAction, QCursor, QPixmap, QImage
)

from app.models.level_data import LevelData, CoinData, BlockData, MudData, WallData
import os


# 常量
COIN_RADIUS = 32  # 硬币显示半径
DEFAULT_BLOCK_RADIUS = 32  # 默认障碍物半径
DEFAULT_MUD_RADIUS = 32  # 默认陷阱半径

# 颜色
COLOR_TABLE_BG = QColor(34, 139, 34)  # 绿色桌面背景
COLOR_COIN = QColor(255, 215, 0)  # 金色硬币
COLOR_BLOCK = QColor(180, 180, 180)  # 浅灰色障碍物（深色背景上更清晰）
COLOR_MUD = QColor(180, 120, 60)  # 浅棕色陷阱（深色背景上更清晰）
COLOR_SELECTED = QColor(0, 150, 255)  # 亮蓝色选中边框
COLOR_BG = QColor(45, 45, 48)  # 深色背景


def cocos_to_qt(cocos_x, cocos_y, table_width, table_height):
    """Cocos坐标转Qt坐标"""
    qt_x = table_width / 2 + cocos_x
    qt_y = table_height / 2 - cocos_y
    return qt_x, qt_y


def qt_to_cocos(qt_x, qt_y, table_width, table_height):
    """Qt坐标转Cocos坐标"""
    cocos_x = qt_x - table_width / 2
    cocos_y = table_height / 2 - qt_y
    return cocos_x, cocos_y


class CanvasItem(QGraphicsEllipseItem):
    """可选择的画布对象"""

    def __init__(self, data_obj: object, x: float, y: float, radius: float, color: QColor, on_move_callback=None):
        super().__init__(-radius, -radius, radius * 2, radius * 2)
        self._data_obj = data_obj
        self._radius = radius
        self._on_move_callback = on_move_callback
        self.setPos(x, y)
        self.setBrush(QBrush(color))
        self.setPen(QPen(Qt.black, 1))
        self.setFlag(QGraphicsItem.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.ItemIsMovable, True)
        self.setCursor(Qt.OpenHandCursor)

    @property
    def data_obj(self) -> object:
        return self._data_obj

    def mousePressEvent(self, event):
        """鼠标按下"""
        if event.button() == Qt.LeftButton:
            self.setCursor(Qt.ClosedHandCursor)
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        """鼠标释放"""
        if event.button() == Qt.LeftButton:
            self.setCursor(Qt.OpenHandCursor)
            # 通知回调（坐标转换在回调中处理）
            if self._on_move_callback:
                self._on_move_callback(self)
        super().mouseReleaseEvent(event)


class Canvas(QGraphicsView):
    """渲染画布"""

    # 信号
    object_clicked = Signal(object)  # 点击对象时发射
    object_moved = Signal(object)  # 对象移动时发射

    def __init__(self, parent=None):
        super().__init__(parent)
        self._level_data: LevelData = None
        self._selected_obj: object = None
        self._items: dict = {}  # data_obj -> QGraphicsItem

        # 设置场景
        self._scene = QGraphicsScene()
        self.setScene(self._scene)

        # 设置渲染属性
        self.setRenderHint(QPainter.Antialiasing)
        self.setViewportUpdateMode(QGraphicsView.FullViewportUpdate)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)

        # 背景色（深色）
        self.setBackgroundBrush(QBrush(COLOR_BG))

    def refresh(self, level_data: LevelData):
        """刷新画布"""
        self._level_data = level_data
        self._scene.clear()
        self._items.clear()

        if not level_data:
            return

        # 桌面尺寸
        w = level_data.width
        h = level_data.height

        # 加载桌面背景图片
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))
        table_image_path = os.path.join(project_root, "res", "table_1.png")

        if os.path.exists(table_image_path):
            pixmap = QPixmap(table_image_path)
            # 缩放图片到关卡尺寸
            scaled_pixmap = pixmap.scaled(
                w, h,
                Qt.IgnoreAspectRatio, Qt.SmoothTransformation
            )
            pixmap_item = QGraphicsPixmapItem(scaled_pixmap)
            pixmap_item.setPos(0, 0)
            self._scene.addItem(pixmap_item)
        else:
            # 如果图片不存在，使用纯色背景
            table_rect = QGraphicsRectItem(0, 0, w, h)
            table_rect.setBrush(QBrush(COLOR_TABLE_BG))
            table_rect.setPen(QPen(Qt.black, 2))
            self._scene.addItem(table_rect)

        # 绘制墙（边框）
        self._draw_wall(level_data)

        # 绘制硬币
        for coin in level_data.coins:
            self._add_coin_item(coin, w, h)

        # 绘制障碍物
        for block in level_data.blocks:
            self._add_block_item(block, w, h)

        # 绘制陷阱
        for mud in level_data.muds:
            self._add_mud_item(mud, w, h)

        # 设置场景范围（不缩放，保持原始尺寸）
        self.setSceneRect(-20, -20, w + 40, h + 40)

    def _add_coin_item(self, coin: CoinData, table_width: int, table_height: int):
        """添加硬币到画布"""
        # 转换坐标：Cocos -> Qt
        qt_x, qt_y = cocos_to_qt(coin.x, coin.y, table_width, table_height)
        item = CanvasItem(coin, qt_x, qt_y, COIN_RADIUS, COLOR_COIN, self._on_item_moved)
        self._scene.addItem(item)
        self._items[id(coin)] = item

        # 添加文字标签（跟随硬币移动）
        text_item = self._scene.addText(str(coin.cls))
        text_item.setDefaultTextColor(Qt.black)
        text_item.setFont(self._get_small_font())
        text_item.setFlag(QGraphicsItem.ItemIgnoresTransformations, True)
        text_item.setParentItem(item)
        text_item.setPos(-5, -8)

    def _add_block_item(self, block: BlockData, table_width: int, table_height: int):
        """添加障碍物到画布"""
        radius = block.radius if block.radius > 0 else DEFAULT_BLOCK_RADIUS
        # 转换坐标：Cocos -> Qt
        qt_x, qt_y = cocos_to_qt(block.x, block.y, table_width, table_height)
        item = CanvasItem(block, qt_x, qt_y, radius, COLOR_BLOCK, self._on_item_moved)
        self._scene.addItem(item)
        self._items[id(block)] = item

        # 如果有路径，绘制路径
        if block.path and len(block.path) > 1:
            path = QPainterPath()
            # 转换路径坐标
            start_x, start_y = cocos_to_qt(block.path[0]['x'], block.path[0]['y'], table_width, table_height)
            path.moveTo(start_x, start_y)
            for point in block.path[1:]:
                px, py = cocos_to_qt(point['x'], point['y'], table_width, table_height)
                path.lineTo(px, py)
            path_item = QGraphicsPathItem(path)
            path_item.setPen(QPen(QColor(100, 100, 100), 2, Qt.DashLine))
            self._scene.addItem(path_item)

    def _add_mud_item(self, mud: MudData, table_width: int, table_height: int):
        """添加陷阱到画布"""
        radius = mud.radius if mud.radius > 0 else DEFAULT_MUD_RADIUS
        # 转换坐标：Cocos -> Qt
        qt_x, qt_y = cocos_to_qt(mud.x, mud.y, table_width, table_height)
        item = CanvasItem(mud, qt_x, qt_y, radius, COLOR_MUD, self._on_item_moved)
        self._scene.addItem(item)
        self._items[id(mud)] = item

    def _on_item_moved(self, item: CanvasItem):
        """对象移动完成"""
        if not self._level_data:
            return

        # 获取 Qt 坐标
        qt_pos = item.pos()
        # 转换为 Cocos 坐标
        cocos_x, cocos_y = qt_to_cocos(qt_pos.x(), qt_pos.y(), self._level_data.width, self._level_data.height)
        # 更新数据模型
        item.data_obj.x = cocos_x
        item.data_obj.y = cocos_y
        # 发送信号
        self.object_moved.emit(item.data_obj)

    def _draw_wall(self, level_data: LevelData):
        """绘制墙（边框）"""
        if not level_data.wall:
            return

        thickness = level_data.wall.thickness
        width = level_data.width
        height = level_data.height
        wall_color = QColor(139, 69, 19)  # 棕色墙

        # 上边
        top_wall = QGraphicsRectItem(0, 0, width, thickness)
        top_wall.setBrush(QBrush(wall_color))
        top_wall.setPen(QPen(Qt.black, 1))
        self._scene.addItem(top_wall)

        # 下边
        bottom_wall = QGraphicsRectItem(0, height - thickness, width, thickness)
        bottom_wall.setBrush(QBrush(wall_color))
        bottom_wall.setPen(QPen(Qt.black, 1))
        self._scene.addItem(bottom_wall)

        # 左边
        left_wall = QGraphicsRectItem(0, 0, thickness, height)
        left_wall.setBrush(QBrush(wall_color))
        left_wall.setPen(QPen(Qt.black, 1))
        self._scene.addItem(left_wall)

        # 右边
        right_wall = QGraphicsRectItem(width - thickness, 0, thickness, height)
        right_wall.setBrush(QBrush(wall_color))
        right_wall.setPen(QPen(Qt.black, 1))
        self._scene.addItem(right_wall)

    def _get_small_font(self):
        """获取小字体"""
        from PySide6.QtGui import QFont
        font = QFont()
        font.setPointSize(8)
        return font

    def mousePressEvent(self, event):
        """鼠标点击事件"""
        if event.button() == Qt.LeftButton:
            # 获取点击位置的 item
            item = self.itemAt(event.pos())

            if isinstance(item, CanvasItem):
                # 点击了对象
                self.object_clicked.emit(item.data_obj)
            else:
                # 点击了空白区域
                self.object_clicked.emit(None)

        super().mousePressEvent(event)

    def contextMenuEvent(self, event):
        """右键菜单"""
        # 没有加载关卡时不显示菜单
        if not self._level_data:
            return

        scene_pos = self.mapToScene(event.pos())
        item = self.itemAt(event.pos())

        menu = QMenu(self)

        # 添加选项
        add_coin = QAction("Add Coin", self)
        add_coin.triggered.connect(lambda: self._add_object(CoinData, scene_pos))
        menu.addAction(add_coin)

        add_block = QAction("Add Block", self)
        add_block.triggered.connect(lambda: self._add_object(BlockData, scene_pos))
        menu.addAction(add_block)

        add_mud = QAction("Add Mud", self)
        add_mud.triggered.connect(lambda: self._add_object(MudData, scene_pos))
        menu.addAction(add_mud)

        menu.addSeparator()

        # 删除选项（仅在选中对象时可用）
        if isinstance(item, CanvasItem):
            delete_action = QAction(f"Delete {type(item.data_obj).__name__}", self)
            delete_action.triggered.connect(lambda: self._delete_object(item.data_obj))
            menu.addAction(delete_action)
        else:
            delete_action = QAction("Delete", self)
            delete_action.setEnabled(False)
            menu.addAction(delete_action)

        menu.exec_(event.globalPos())

    def _add_object(self, obj_type, qt_pos: QPointF):
        """添加新对象"""
        if not self._level_data:
            return

        # 转换 Qt 坐标到 Cocos 坐标
        cocos_x, cocos_y = qt_to_cocos(qt_pos.x(), qt_pos.y(), self._level_data.width, self._level_data.height)

        if obj_type == CoinData:
            obj = CoinData(cls=1, x=cocos_x, y=cocos_y)
            self._level_data.add_coin(obj)
        elif obj_type == BlockData:
            obj = BlockData(x=cocos_x, y=cocos_y, shape="circle", radius=DEFAULT_BLOCK_RADIUS)
            self._level_data.add_block(obj)
        elif obj_type == MudData:
            obj = MudData(x=cocos_x, y=cocos_y, shape="circle", radius=DEFAULT_MUD_RADIUS, friction=0.5)
            self._level_data.add_mud(obj)
        else:
            return

        # 刷新画布
        self.refresh(self._level_data)

        # 通知父窗口（通过信号或回调）
        parent = self.parent()
        while parent:
            if hasattr(parent, '_on_object_added'):
                parent._on_object_added(obj)
                break
            parent = parent.parent()

    def _delete_object(self, obj: object):
        """删除对象"""
        if not self._level_data:
            return

        self._level_data.remove_object(obj)

        # 如果删除的是当前选中的对象，清除选中
        if self._selected_obj == obj:
            self._selected_obj = None

        # 刷新画布
        self.refresh(self._level_data)

        # 通知父窗口
        parent = self.parent()
        while parent:
            if hasattr(parent, '_on_object_deleted'):
                parent._on_object_deleted(obj)
                break
            parent = parent.parent()

    def resizeEvent(self, event):
        """窗口大小改变时"""
        super().resizeEvent(event)
