"""
从游戏代码收集 Behavior 元数据（priority / mode / exclusive），生成 behavior_meta.json。

用法（在 LevelEditor 目录下）：
    python tools/collect_behaviors.py
    python tools/collect_behaviors.py --src ../CoinDuel2D/assets/Scripts/Behaviors
"""
import argparse
import json
import os
import re

LEVEL_EDITOR_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(LEVEL_EDITOR_DIR)

DEFAULT_SRC = os.path.join(REPO_ROOT, "CoinDuel2D", "assets", "Scripts", "Behaviors")
DEFAULT_OUT = os.path.join(LEVEL_EDITOR_DIR, "behavior_meta.json")

REGISTER_RE = re.compile(
    r"BehaviorRegistry\.register\(\s*['\"]([^'\"]+)['\"]\s*,\s*([A-Za-z_]\w*)\s*\)"
)
PRIORITY_RE = re.compile(r"public\s+priority\s*=\s*(-?\d+)")
MODE_RE = re.compile(r"public\s+mode\s*:\s*BehaviorMode\s*=\s*['\"]([^'\"]+)['\"]")
EXCLUSIVE_RE = re.compile(r"public\s+exclusive\s*=\s*(true|false)")


def collect(src_dir: str) -> dict:
    behaviors = {}
    for name in sorted(os.listdir(src_dir)):
        if not name.endswith(".ts"):
            continue
        path = os.path.join(src_dir, name)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()

        register = REGISTER_RE.search(text)
        if not register:
            continue

        behavior_id, class_name = register.group(1), register.group(2)
        priority_match = PRIORITY_RE.search(text)
        mode_match = MODE_RE.search(text)
        exclusive_match = EXCLUSIVE_RE.search(text)

        behaviors[behavior_id] = {
            "class": class_name,
            "priority": int(priority_match.group(1)) if priority_match else 0,
            "mode": mode_match.group(1) if mode_match else "passive",
            "exclusive": bool(exclusive_match and exclusive_match.group(1) == "true"),
        }

    # 按优先级从高到低输出，便于阅读与稳定 diff
    return dict(sorted(behaviors.items(), key=lambda kv: (-kv[1]["priority"], kv[0])))


def main():
    parser = argparse.ArgumentParser(description="收集游戏代码中的 Behavior 元数据")
    parser.add_argument("--src", default=DEFAULT_SRC, help="Behaviors 目录")
    parser.add_argument("--out", default=DEFAULT_OUT, help="输出 JSON 路径")
    args = parser.parse_args()

    behaviors = collect(args.src)
    if not behaviors:
        raise SystemExit(f"未在 {args.src} 中找到任何 BehaviorRegistry.register 调用")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"behaviors": behaviors}, f, indent=4, ensure_ascii=False)
        f.write("\n")

    print(f"已生成 {args.out}")
    for behavior_id, meta in behaviors.items():
        print(f"  {behavior_id}: priority={meta['priority']}, "
              f"mode={meta['mode']}, exclusive={meta['exclusive']}")


if __name__ == "__main__":
    main()
