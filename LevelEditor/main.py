"""
CoinDuel2D Level Editor
关卡编辑器入口
"""
import sys
from PySide6.QtWidgets import QApplication
from app.main_window import MainWindow


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("CoinDuel2D Editor")

    window = MainWindow()
    window.show()

    # 支持 `python main.py <项目目录>` 直接打开
    if len(sys.argv) > 1:
        window.open_project(sys.argv[1])

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
