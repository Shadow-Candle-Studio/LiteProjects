import { resources, JsonAsset, sys } from 'cc';

/**
 * 多语言管理器（静态类）
 * - 自动检测浏览器/设备语言
 * - 从 Resources/i18n/{lang}.json 加载翻译
 * - 通过 I18n.t(key) 获取翻译文本
 */
export class I18n {
    private static _lang: string = 'zh-Hans';
    private static _data: Record<string, string> = {};
    private static _fallback: Record<string, string> = {};
    private static _ready: boolean = false;
    private static _onReady: (() => void) | null = null;

    /** 当前语言代码 */
    public static get lang(): string {
        return I18n._lang;
    }

    /** 翻译是否已加载完成 */
    public static get ready(): boolean {
        return I18n._ready;
    }

    /**
     * 初始化：检测语言 → 加载翻译（幂等，多次调用只加载一次）
     * @param onReady 翻译加载完成后的回调
     */
    public static init(onReady?: () => void): void {
        // 已加载完成，直接回调
        if (I18n._ready) {
            onReady?.();
            return;
        }

        I18n._onReady = onReady || null;
        I18n._lang = I18n._detectLanguage();

        // 先加载 fallback（简中），再加载目标语言
        I18n._loadJson('zh-Hans', (data) => {
            I18n._fallback = data;
            if (I18n._lang === 'zh-Hans') {
                I18n._data = data;
                I18n._ready = true;
                I18n._onReady?.();
            } else {
                I18n._loadJson(I18n._lang, (langData) => {
                    I18n._data = langData;
                    I18n._ready = true;
                    I18n._onReady?.();
                });
            }
        });
    }

    /**
     * 获取翻译文本
     * @param key 翻译 key
     * @returns 翻译后的文本，找不到时返回 key 本身
     */
    public static t(key: string): string {
        return I18n._data[key] ?? I18n._fallback[key] ?? key;
    }

    /** 检测浏览器/设备语言，映射到支持的语言代码 */
    private static _detectLanguage(): string {
        const raw = sys.language || navigator.language || 'zh-CN';

        // 精确匹配
        if (raw === 'zh-Hans' || raw === 'zh-CN') return 'zh-Hans';
        if (raw === 'zh-Hant' || raw === 'zh-TW' || raw === 'zh-HK') return 'zh-Hant';
        if (raw === 'ja' || raw === 'ja-JP') return 'ja';
        if (raw === 'ko' || raw === 'ko-KR') return 'ko';

        // 前缀匹配
        if (raw.startsWith('zh')) return 'zh-Hans';
        if (raw.startsWith('ja')) return 'ja';
        if (raw.startsWith('ko')) return 'ko';

        return 'en';
    }

    /** 从 Resources/i18n/ 加载 JSON 翻译文件 */
    private static _loadJson(lang: string, callback: (data: Record<string, string>) => void): void {
        resources.load(`i18n/${lang}`, JsonAsset, (err, asset) => {
            if (err) {
                console.warn(`[I18n] 加载 ${lang}.json 失败:`, err);
                callback({});
                return;
            }
            callback(asset.json as Record<string, string>);
        });
    }
}