import { native, sys } from 'cc';

/**
 * 本地存储管理器
 * - 原生平台：使用 native.fileUtils 读写可写路径下的文件
 * - Web/小游戏平台：没有 fileUtils，退化为 sys.localStorage 实现的虚拟文件系统
 */
export class StorageManager {
    /** 虚拟文件系统在 localStorage 中的 key 前缀 */
    private static readonly _PREFIX: string = 'StorageManager:';

    /** 获取 fileUtils（非原生平台为 null） */
    private static get _fs(): any {
        return (native as any)?.fileUtils ?? null;
    }

    /** 获取存储根路径（Web 端为空串，路径按虚拟路径处理） */
    public static getWritablePath(): string {
        const fs = StorageManager._fs;
        return fs ? fs.getWritablePath() : '';
    }

    public static isFileExist(path: string): boolean {
        const fs = StorageManager._fs;
        if (fs) return fs.isFileExist(path);
        return sys.localStorage.getItem(StorageManager._fileKey(path)) != null;
    }

    public static isDirExist(path: string): boolean {
        const fs = StorageManager._fs;
        if (fs) return fs.isDirectoryExist(path);
        const dir = StorageManager._normalize(path);
        if (sys.localStorage.getItem(StorageManager._dirKey(dir)) != null) return true;
        // 目录下存在文件时也算目录存在
        const prefix = StorageManager._fileKey(dir + '/');
        for (let i = 0; i < sys.localStorage.length; i++) {
            const key = sys.localStorage.key(i);
            if (key && key.indexOf(prefix) === 0) return true;
        }
        return false;
    }

    public static createDir(path: string): any {
        const fs = StorageManager._fs;
        if (fs) return fs.createDirectory(path);
        sys.localStorage.setItem(StorageManager._dirKey(StorageManager._normalize(path)), '1');
        return true;
    }

    public static deleteFile(path: string): boolean {
        const fs = StorageManager._fs;
        if (fs) return fs.removeFile(path);
        sys.localStorage.removeItem(StorageManager._fileKey(path));
        return true;
    }

    public static deleteDir(path: string): boolean {
        const fs = StorageManager._fs;
        if (fs) return fs.removeDirectory(path);
        const dir = StorageManager._normalize(path);
        const dirPrefix = StorageManager._PREFIX + 'dir:' + dir;
        const filePrefix = StorageManager._PREFIX + 'file:' + dir;
        // 收集后再删除，避免遍历时修改 localStorage
        const toRemove: string[] = [];
        for (let i = 0; i < sys.localStorage.length; i++) {
            const key = sys.localStorage.key(i);
            if (key && (key === dirPrefix || key === filePrefix
                || key.indexOf(dirPrefix + '/') === 0 || key.indexOf(filePrefix + '/') === 0)) {
                toRemove.push(key);
            }
        }
        for (const key of toRemove) {
            sys.localStorage.removeItem(key);
        }
        return true;
    }

    public static readJsonFile(path: string, cb: (err: string | null, data: object | null) => void): any {
        const fs = StorageManager._fs;
        if (fs) return fs.readJsonFile(path, cb);
        const text = sys.localStorage.getItem(StorageManager._fileKey(path));
        if (text == null) {
            cb('file not found: ' + path, null);
            return;
        }
        try {
            cb(null, JSON.parse(text));
        } catch (e) {
            cb('json parse error: ' + path, null);
        }
    }

    public static writeJsonFile(path: string, data: object): boolean {
        return StorageManager.writeTextFile(path, JSON.stringify(data));
    }

    /** 写入文本文件（目录不存在时返回 false） */
    public static writeTextFile(path: string, text: string): boolean {
        const fs = StorageManager._fs;
        // 注意 fileUtils.writeStringToFile 参数顺序：先数据后路径
        if (fs) return fs.writeStringToFile(text, path);
        sys.localStorage.setItem(StorageManager._fileKey(path), text);
        return true;
    }

    /** 规范化路径：统一为 / 分隔，去掉开头的 ./ 和 / */
    private static _normalize(path: string): string {
        return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
    }

    private static _fileKey(path: string): string {
        return StorageManager._PREFIX + 'file:' + StorageManager._normalize(path);
    }

    private static _dirKey(path: string): string {
        return StorageManager._PREFIX + 'dir:' + StorageManager._normalize(path);
    }
}
