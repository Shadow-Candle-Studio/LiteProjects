# CoinDuel2D 关卡编辑器

## 简介

CoinDuel2D 编辑器是一款可视化工具，用于编辑游戏关卡配置文件（levels.json / memes.json）。界面分为两个 Tab：**Level Editor** 与 **Meme Editor**。

## 运行方式

采用了python+pyside6,跨平台方案。可以编译出主流品台windows/linux/macos的可执行文件。也可直接在python环境下运行：

```bash
cd LevelEditor
source venv/bin/activate
python main.py
# 或直接打开项目目录
python main.py ../CoinDuel2D/assets/Resources
```

## 打开项目

通过 `File → 打开项目目录...`（Ctrl+O）选择项目目录。目录中**必须包含** `levels.json` 和 `memes.json`，否则会提示错误。

- 关卡文件按 `levels.json` 中的条目解析：优先 `<项目>/levels/<条目>`，其次 `<项目>/<条目>`。
- `memes.json` 中的贴图/音效路径均相对项目目录（例如 `textures/coin_1.png`）。

## 基本操作

### 文件操作

| 菜单 | 快捷键 | 说明 |
|------|--------|------|
| 打开项目目录... | Ctrl+O | 选择包含 levels.json / memes.json 的项目目录 |
| 保存 | Ctrl+S | 保存当前 Tab 的数据（关卡或 memes.json） |
| 退出 | Ctrl+Q | 退出（有未保存修改时提示） |

### Level Editor

- 左侧上方为关卡列表（来自 `levels.json`），支持 **Add / Rename / Delete**。
- 点击关卡后，中间画布加载该关卡的桌面与对象，右侧属性面板编辑选中对象。
- 硬币会优先显示其 `class` 对应 meme 的默认贴图（`texture`）；贴图为空或文件不存在时回退为单色圆。
- 左侧下方为对象树，可选中 Table / Wall / 硬币 / 障碍物 / 陷阱。

#### Behavior 属性

选中 Coin 后，`Behaviors` 表格会显示每个 behavior 的 **Priority / Mode / Exclusive**（数据来自 `behavior_meta.json`）。
其中 `exclusive = true` 的 behavior 每枚硬币最多只能勾选一个；勾选新的会自动取消其他 exclusive 选项，旧数据中若存在多个则自动保留优先级最高的一个。

`behavior_meta.json` 由脚本从游戏代码收集生成，代码中 behavior 的属性变更后可重新执行：

```bash
python tools/collect_behaviors.py
```

### Meme Editor

- 左侧为 `memes.json` 中 `coins` 的 key 列表，显示为 `id - name`（name 为空时只显示 id），支持 **Add / Rename / Delete**。
- 右侧编辑该 meme 的 `name`、默认/空闲/瞄准/发射/被打击贴图以及发射/被打击音效。
- 路径可直接输入，或点击 `...` 从项目目录中选择文件，自动转换为相对路径。

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
| Coin | 硬币 | Class、X、Y、Can Shot、Behaviors |
| Block | 障碍物 | X、Y、Shape、Radius |
| Mud | 陷阱 | X、Y、Shape、Radius、Friction |

## JSON 文件格式

关卡以 JSON 格式存储。所有条目（硬币/障碍物/陷阱）统一存放在 `coins` 数组中，通过 `type` 字段区分。示例：

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
            "type": "coin",
            "class": 1,
            "x": 100,
            "y": 200,
            "canshot": true,
            "behaviors": ["FreezeBehavior"]
        },
        {
            "type": "block",
            "x": 100,
            "y": 100,
            "shape": "circle",
            "radius": 50
        },
        {
            "type": "block",
            "x": 400,
            "y": 300,
            "shape": "circle",
            "radius": 30,
            "path": [
                {"x": 400, "y": 300},
                {"x": 500, "y": 300}
            ]
        },
        {
            "type": "mud",
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
| coins | array | 条目数组（硬币/障碍物/陷阱，按 type 区分） |

#### wall（墙）
| 字段 | 类型 | 说明 |
|------|------|------|
| thickness | int | 墙厚度（像素） |

#### coins 条目通用字段
| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 条目类型：`coin` / `block` / `mud` |
| x | int | X 坐标 |
| y | int | Y 坐标 |

#### type = coin（硬币）特有字段
| 字段 | 类型 | 说明 |
|------|------|------|
| class | int | 硬币类型 |
| canshot | bool | 是否玩家可操作。`false` 时为环境硬币，按静态障碍处理（类似 block/mud）；缺省为 `true` |
| behaviors | array | 要挂载的行为 id 列表（可选），可选值：`KnockbackBehavior` / `FlashStepBehavior` / `FreezeBehavior` |

#### type = block（障碍物）特有字段
| 字段 | 类型 | 说明 |
|------|------|------|
| shape | string | 形状（circle） |
| radius | int | 半径 |
| path | array | 运动路径（可选） |

#### type = mud（陷阱）特有字段
| 字段 | 类型 | 说明 |
|------|------|------|
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
