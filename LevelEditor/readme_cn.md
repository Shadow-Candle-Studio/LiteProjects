# CoinDuel2D 关卡编辑器

## 简介

CoinDuel2D 关卡编辑器是一款可视化工具，用于编辑游戏关卡配置文件。支持对桌面、墙、硬币、障碍物、陷阱等对象的增删改查操作。

## 运行方式

采用了python+pyside6,跨平台方案。可以编译出主流品台windows/linux/macos的可执行文件。也可直接在python环境下运行：

```bash
cd LevelEditor
source venv/bin/activate
python main.py
```

## 基本操作

### 文件操作

| 菜单 | 快捷键 | 说明 |
|------|--------|------|
| New | Ctrl+N | 新建关卡（设置 ID、宽高） |
| Open | Ctrl+O | 打开 JSON 关卡文件 |
| Save | Ctrl+S | 保存到当前文件 |
| Save As | Ctrl+Shift+S | 另存为新文件 |
| Close | - | 关闭当前关卡 |

### 对象操作

#### 添加对象
1. 在渲染桌面空白处**右键**
2. 选择要添加的对象类型（Coin / Block / Mud）

#### 删除对象
1. 在渲染桌面**右键**点击对象
2. 选择 "Delete [对象类型]"

#### 选中对象
- **点击对象树**中的节点
- 或在**渲染桌面**中左键点击对象

#### 移动对象
- 在渲染桌面中**左键拖动** coin / block / mud 对象

### 属性编辑

1. 选中对象后，右侧属性面板显示该对象的属性
2. 修改属性值后**立即生效**
3. 对象树和渲染桌面同步更新

## 对象说明

| 对象 | 说明 | 可编辑属性 |
|------|------|------------|
| Table | 桌面 | ID、Width、Height |
| Wall | 墙（不可删除） | Thickness |
| Coin | 硬币 | Class、X、Y |
| Block | 障碍物 | X、Y、Shape、Radius |
| Mud | 陷阱 | X、Y、Shape、Radius、Friction |

## JSON 文件格式

关卡以 JSON 格式存储，示例：

```json
{
    "id": 1,
    "width": 800,
    "height": 600,
    "wall": {
        "thickness": 10
    },
    "coins": [
        {
            "class": 1,
            "x": 100,
            "y": 200
        }
    ],
    "blocks": [
        {
            "x": 100,
            "y": 100,
            "shape": "circle",
            "radius": 50
        },
        {
            "x": 400,
            "y": 300,
            "shape": "circle",
            "radius": 30,
            "path": [
                {"x": 400, "y": 300},
                {"x": 500, "y": 300}
            ]
        }
    ],
    "muds": [
        {
            "x": 100,
            "y": 100,
            "shape": "circle",
            "radius": 50,
            "friction": 0.5
        }
    ]
}
```

### 字段说明

#### 顶层字段
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 关卡 ID |
| width | int | 桌面宽度（像素） |
| height | int | 桌面高度（像素） |
| wall | object | 墙配置 |
| coins | array | 硬币数组 |
| blocks | array | 障碍物数组 |
| muds | array | 陷阱数组 |

#### wall（墙）
| 字段 | 类型 | 说明 |
|------|------|------|
| thickness | int | 墙厚度（像素） |

#### coin（硬币）
| 字段 | 类型 | 说明 |
|------|------|------|
| class | int | 硬币类型 |
| x | int | X 坐标 |
| y | int | Y 坐标 |

#### block（障碍物）
| 字段 | 类型 | 说明 |
|------|------|------|
| x | int | X 坐标 |
| y | int | Y 坐标 |
| shape | string | 形状（circle） |
| radius | int | 半径 |
| path | array | 运动路径（可选） |

#### mud（陷阱）
| 字段 | 类型 | 说明 |
|------|------|------|
| x | int | X 坐标 |
| y | int | Y 坐标 |
| shape | string | 形状（circle） |
| radius | int | 半径 |
| friction | float | 摩擦系数 |

## 坐标系

编辑器使用与 Cocos Creator 一致的坐标系：
- **原点**：桌面中央 (0, 0)
- **X 轴**：向右为正
- **Y 轴**：向上为正

例如，对于 800x600 的桌面：
- 左上角坐标为 (-400, 300)
- 右下角坐标为 (400, -300)

## 资源文件

桌面背景图片存放在 `res/table_1.png`，编辑器会自动加载作为桌面背景。

## 如何将关卡导入游戏

将制作好的关卡文件保存在CoinDuel2D/assets/resources/levels目录下，将关卡文件名添加进CoinDuel2D/assets/resources/levels.json中。

例如:
```json
{
    "levels":[
        "1.json",
        "2.json"
    ]
}
```

再次启动游戏，就能在游戏关卡选择列表里看到新加入的关卡。
