# CoinDuel2D Level Editor 开发计划

## 一、项目概述

基于 Python + PySide6 开发 CoinDuel2D 关卡编辑器，用于可视化编辑游戏关卡的 JSON 配置文件。编辑器支持对桌面（Table）、硬币（Coin）、障碍物（Block）、陷阱（Mud）的增删改查操作。

## 二、level1.json 数据格式分析

```json
{
    "id": 1,
    "width": 800,
    "height": 600,
    "coins": [
        { "class": 1, "x": 100, "y": 200 }
    ],
    "blocks": [
        { "x": 100, "y": 100, "shape": "circle", "radius": 50 },
        { "x": 400, "y": 300, "shape": "circle", "radius": 30,
          "path": [{"x":400,"y":300}, {"x":500,"y":300}] }
    ],
    "muds": [
        { "x": 100, "y": 100, "shape": "circle", "radius": 50, "friction": 0.5 }
    ]
}
```

顶层字段：`id`（关卡ID）、`width`/`height`（桌面尺寸）、`coins`（硬币数组）、`blocks`（障碍物数组）、`muds`（陷阱数组）。

## 三、文件结构设计

```
LevelEditor/
├── level1.json                  # 现有关卡配置文件
├── main.py                      # 程序入口
├── app/
│   ├── __init__.py
│   ├── main_window.py           # 主窗口，组装各面板
│   ├── models/
│   │   ├── __init__.py
│   │   └── level_data.py        # 关卡数据模型（数据层）
│   ├── widgets/
│   │   ├── __init__.py
│   │   ├── menu_bar.py          # 顶部主菜单栏
│   │   ├── object_tree.py       # 左侧对象树列表
│   │   ├── canvas.py            # 中间渲染桌面（QGraphicsView）
│   │   └── property_panel.py    # 右侧属性面板
│   └── dialogs/
│       ├── __init__.py
│       └── new_level_dialog.py  # 新建关卡对话框（设置id/width/height）
└── development_plan.md          # 本文档
```

## 四、分阶段开发计划

### 阶段一：数据模型 + 主窗口骨架

**目标**：建立数据模型，搭建四区域主窗口布局，验证数据的加载和保存。

**任务清单**：

1. **数据模型** (`app/models/level_data.py`)
   - 定义 `LevelData` 类，包含字段：`id`, `width`, `height`, `coins`, `blocks`, `muds`
   - 定义 `CoinData` 类，字段：`class`, `x`, `y`
   - 定义 `BlockData` 类，字段：`x`, `y`, `shape`, `radius`, `path`（可选）
   - 定义 `MudData` 类，字段：`x`, `y`, `shape`, `radius`, `friction`
   - 实现 `from_json(path)` 加载方法和 `to_json(path)` 保存方法
   - 实现各对象的 `add` / `remove` / `get_all` 操作

2. **主窗口骨架** (`app/main_window.py`, `main.py`)
   - 创建 `QMainWindow`，标题为 `CoinDuel2D Editor`
   - 使用 `QSplitter` 水平分割为三个区域：左侧对象树、中间渲染区、右侧属性栏
   - 预留各面板的占位 Widget

3. **菜单栏** (`app/widgets/menu_bar.py`)
   - 实现 File 菜单：New / Open / Save / Save As / Close
   - New 弹出对话框，设置 `id`、`width`、`height`，生成空关卡
   - Open 弹出文件选择对话框，加载 JSON
   - Save 保存到当前路径（首次等同 Save As）
   - Save As 弹出文件选择对话框，另存为
   - Close 清空当前编辑状态

**验收标准**：
- 能启动程序，看到三栏布局的空白窗口
- 能通过 File 菜单加载 `level1.json`，在控制台打印出解析后的数据
- 能通过 File 菜单保存修改后的 JSON 文件

---

### 阶段二：左侧对象树 + 右侧属性面板

**目标**：实现对象的树形展示和属性编辑功能。

**任务清单**：

1. **对象树** (`app/widgets/object_tree.py`)
   - 使用 `QTreeWidget`
   - 根节点：`Table`（显示桌面的 width x height）
   - 子节点分组：`Coins`、`Blocks`、`Muds`
   - 每个对象为分组下的叶子节点，显示类型 + 位置信息（如 `Coin #1 (100, 200)`）
   - 选中节点时，发射 `object_selected` 信号，携带选中对象的引用
   - 实现 `refresh(level_data)` 方法，从数据模型重建整棵树
   - 实现 `select_object(obj)` 方法，供外部（如渲染区点击）调用以同步选中状态

2. **属性面板** (`app/widgets/property_panel.py`)
   - 使用 `QFormLayout` + `QScrollArea`
   - 根据选中对象类型动态生成属性编辑控件：
     - `Table`：`id`（QSpinBox）、`width`（QSpinBox）、`height`（QSpinBox）
     - `Coin`：`class`（QSpinBox）、`x`（QDoubleSpinBox）、`y`（QDoubleSpinBox）
     - `Block`：`x`、`y`、`shape`（QComboBox，当前仅 `circle`）、`radius`、`path`（可编辑的坐标对列表，高级功能可后做）
     - `Mud`：`x`、`y`、`shape`、`radius`、`friction`（QDoubleSpinBox）
   - 修改属性后立即更新数据模型，并触发渲染区重绘
   - 当未选中任何对象时，显示"未选中对象"提示文字

**验收标准**：
- 加载 `level1.json` 后，对象树正确显示 Table、Coins、Blocks、Muds 分组及各对象节点
- 选中对象树节点，属性面板显示对应属性并可编辑
- 修改属性后，数据模型同步更新

---

### 阶段三：中间渲染区（核心）

**目标**：在中间区域渲染桌面和所有对象，支持点击选中。

**任务清单**：

1. **渲染画布** (`app/widgets/canvas.py`)
   - 继承 `QGraphicsView`，内部使用 `QGraphicsScene`
   - 渲染桌面：绘制绿色背景矩形，尺寸由 `LevelData.width` / `height` 决定
   - 渲染硬币：在 `(x, y)` 处绘制圆形（金色填充），半径取合理默认值（如 15px），`class` 信息用文字标签区分
   - 渲染障碍物：在 `(x, y)` 处绘制圆形（灰色填充），半径由 `radius` 字段决定；若存在 `path`，用线段连接 path 各点
   - 渲染陷阱：在 `(x, y)` 处绘制圆形（棕色填充），半径由 `radius` 字段决定
   - 实现 `refresh(level_data)` 方法，清除场景后重新绘制所有对象

2. **点击选中**
   - 为每个渲染对象创建对应的 `QGraphicsItem`，设置为可选择（`ItemIsSelectable`）
   - 鼠标点击对象时，通过信号通知对象树和属性面板同步更新选中状态
   - 选中对象时绘制包围盒（蓝色虚线矩形，紧贴对象轮廓）

3. **右键菜单** (`canvas.py` 内部)
   - 重写 `contextMenuEvent`
   - 菜单项：
     - `Add Coin`：在鼠标位置创建新 CoinData，添加到数据模型，刷新全部
     - `Add Block`：在鼠标位置创建新 BlockData（默认 `shape=circle, radius=30`），刷新全部
     - `Add Mud`：在鼠标位置创建新 MudData（默认 `shape=circle, radius=30, friction=0.5`），刷新全部
     - `Delete`：仅当鼠标下有对象时激活，从数据模型中移除该对象，刷新全部

**验收标准**：
- 中间区域显示绿色桌面背景，上面绘制所有对象
- 点击对象，对象出现蓝色虚线包围盒，左侧树和右侧属性面板同步更新
- 右键桌面空白处可添加新对象，右键对象上可删除
- 添加/删除后画面和树同步刷新

---

### 阶段四：联动打磨 + 拖拽移动

**目标**：三个面板完全联动，支持拖拽移动对象，完善交互体验。

**任务清单**：

1. **三面板联动**
   - 对象树选中 -> 属性面板更新 + 渲染区高亮
   - 属性面板修改 -> 数据模型更新 + 渲染区实时重绘
   - 渲染区点击/右键删除 -> 对象树刷新 + 属性面板清空或更新

2. **拖拽移动**（可选但推荐）
   - 选中对象后可拖拽移动位置
   - 拖拽过程中实时更新属性面板中的 `x`、`y` 值
   - 释放鼠标后最终位置写入数据模型

3. **边界约束**
   - 对象的 `x`、`y` 限制在 `[0, width]` 和 `[0, height]` 范围内
   - 属性面板中限制数值输入范围

4. **文件状态管理**
   - 跟踪是否有未保存修改（dirty flag）
   - 关闭或新建时提示是否保存

**验收标准**：
- 从任意面板操作，另外两个面板同步更新
- 可以拖拽移动对象
- 未保存修改时关闭程序会弹出确认对话框

---

## 五、关键类和接口设计

### LevelData（数据模型核心）

```python
class CoinData:
    cls: int          # 对应 JSON 中的 "class"
    x: float
    y: float

class BlockData:
    x: float
    y: float
    shape: str        # "circle"
    radius: float
    path: list[dict] | None  # 可选的运动路径

class MudData:
    x: float
    y: float
    shape: str
    radius: float
    friction: float

class LevelData:
    id: int
    width: int
    height: int
    coins: list[CoinData]
    blocks: list[BlockData]
    muds: list[MudData]

    @staticmethod
    def from_json(path: str) -> 'LevelData'

    def to_json(self, path: str) -> None

    def add_object(self, obj: CoinData | BlockData | MudData) -> None

    def remove_object(self, obj: object) -> None

    def find_object_at(self, x: float, y: float) -> object | None
```

### MainWindow（主窗口）

```python
class MainWindow(QMainWindow):
    def __init__(self)
    def new_level(self)          # File > New
    def open_level(self)         # File > Open
    def save_level(self)         # File > Save
    def save_level_as(self)      # File > Save As
    def close_level(self)        # File > Close
    def _refresh_all(self)       # 刷新所有面板
```

### ObjectTree（对象树）

```python
class ObjectTree(QTreeWidget):
    object_selected = Signal(object)   # 选中对象时发射
    object_deleted = Signal(object)    # 删除对象时发射

    def refresh(self, level_data: LevelData) -> None
    def select_object(self, obj: object) -> None
```

### Canvas（渲染画布）

```python
class Canvas(QGraphicsView):
    object_clicked = Signal(object)    # 点击对象时发射

    def refresh(self, level_data: LevelData) -> None
    def highlight_object(self, obj: object) -> None  # 高亮选中对象
    def contextMenuEvent(self, event)                 # 右键菜单
```

### PropertyPanel（属性面板）

```python
class PropertyPanel(QWidget):
    property_changed = Signal(object, str, object)  # (对象, 属性名, 新值)

    def show_properties(self, obj: object) -> None
    def clear(self) -> None
```

## 六、开发优先级

| 优先级 | 阶段 | 预估工时 | 说明 |
|--------|------|----------|------|
| P0 | 阶段一：数据模型 + 主窗口骨架 | 2-3 小时 | 基础设施，后续所有功能依赖于此 |
| P0 | 阶段二：对象树 + 属性面板 | 3-4 小时 | 数据可视化和编辑的核心 |
| P0 | 阶段三：渲染区 + 右键菜单 | 4-5 小时 | 最核心的交互功能 |
| P1 | 阶段四：联动打磨 + 拖拽 | 2-3 小时 | 体验优化，可渐进实现 |

**总计预估**：11-15 小时

## 七、技术要点

1. **信号槽机制**：各面板通过 Qt Signal/Slot 解耦通信，MainWindow 作为中介协调各面板的联动。
2. **QGraphicsView/QGraphicsScene**：渲染区使用 Qt 的 Graphics View 框架，天然支持对象选择、拖拽和右键菜单。
3. **JSON 兼容性**：数据模型的序列化/反序列化必须与现有 `level1.json` 格式完全兼容，特别注意 JSON 中的 `"class"` 字段与 Python 关键字冲突，模型中用 `cls` 替代。
4. **即时生效**：属性面板的每个编辑控件绑定 `valueChanged` 信号，修改后立即写入数据模型并触发渲染区重绘。
5. **坐标系**：JSON 中的坐标系原点需要与渲染区的坐标系对齐。考虑到游戏使用 Cocos Creator（Y 轴向上），而 Qt 的 Y 轴向下，渲染时可能需要做 Y 轴翻转（`y_render = height - y_json`），具体需在阶段三实现时验证。
