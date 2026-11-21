import { LevelData } from '../LevelData';
import { githubCommitUrl, githubRawAtCommit, githubRawUrl, jsdelivrUrl } from '../Meme/CdnConfig';
import { NetworkManager } from '../NetworkManager';

/**
 * CDN-first campaign level source.
 *
 * The web Blockly editor writes `cdn/levels/{id}.json` to GitHub. This loader
 * lets the running game read those files back **without a Cocos rebuild**, so
 * "Save Level → Git" changes Stage Mode on the next refresh.
 *
 * It reads from **raw.githubusercontent.com** rather than jsDelivr: jsDelivr
 * caches branch URLs for hours and ignored purge requests in testing, while raw
 * GitHub reflects a new commit within seconds and still sends
 * `Access-Control-Allow-Origin: *`.
 *
 * Behaviour:
 *  - GET `raw/{branch}/cdn/levels/{id}.json` with a cache-busting query
 *  - validate it is a level (numeric id + coins array, no schemaVersion)
 *  - on any failure (offline, 404, bad JSON) return null so callers fall back
 *    to the bundled `resources/levels/{id}.json`
 *
 * Results (including misses) are memoised for the session so replaying a stage
 * does not refetch.
 */
export class CdnLevelSource {
    /** Set false to force bundled levels only. */
    public static enabled: boolean = true;

    private static _cache = new Map<number, LevelData | null>();

    /**
     * Load level `id` from the CDN.
     * @param id 1-based stage id
     * @param cb receives the level, or null when unavailable
     */
    public static load(id: number, cb: (level: LevelData | null) => void): void {
        if (!CdnLevelSource.enabled || !Number.isFinite(id) || id < 1) {
            cb(null);
            return;
        }
        if (CdnLevelSource._cache.has(id)) {
            cb(CdnLevelSource._cache.get(id) ?? null);
            return;
        }

        // Try each mirror in order, preferring whichever is FRESHEST.
        //
        // History: raw.githubusercontent was tried first because it reflects a
        // commit immediately — but for this repo it got pinned to an old commit
        // for a whole branch and ignored cache-busting query strings. jsDelivr
        // then took the lead, but it caches for 12h (s-maxage=43200), so a level
        // saved minutes ago still came back stale.
        //
        // Correct approach: ask GitHub's API which commit is current, then fetch
        // that exact commit from raw. A pinned commit ref cannot go stale, and it
        // has none of jsDelivr's lag.
        const rel = 'cdn/levels/' + id + '.json';
        const sources = [
            // 1. exact commit from the API (no cache, no lag)
            async (cb) => {
                NetworkManager.HttpGet(githubCommitUrl(rel), (code, body) => {
                    if (code !== 200 || !body) return cb(null);
                    let sha = '';
                    try {
                        const list = JSON.parse(body);
                        // the API accepts a path and returns an array of commits
                        sha = Array.isArray(list) && list[0] ? list[0].sha : '';
                    } catch (e) {
                        sha = '';
                    }
                    if (!sha) return cb(null);
                    NetworkManager.HttpGet(githubRawAtCommit(sha, rel), (c2, b2) => {
                        cb(c2 === 200 && b2 ? b2 : null);
                    });
                });
            },
            // 2. jsDelivr (fast, but may lag hours)
            (cb) => NetworkManager.HttpGet(
                jsdelivrUrl(rel) + '?t=' + Date.now().toString(36),
                (code, body) => cb(code === 200 && body ? body : null)),
            // 3. raw on the branch (last resort)
            (cb) => NetworkManager.HttpGet(
                githubRawUrl(rel) + '?t=' + Date.now().toString(36),
                (code, body) => cb(code === 200 && body ? body : null)),
        ];

        const tryNext = (index: number): void => {
            if (index >= sources.length) {
                CdnLevelSource._cache.set(id, null);
                console.log('[CdnLevel] level', id, 'missing on all mirrors — using bundled file');
                cb(null);
                return;
            }
            sources[index]((body: string | null) => {
                const level = body ? CdnLevelSource._parse(body, id) : null;
                if (!level) {
                    console.log('[CdnLevel] mirror', index, 'missed level', id);
                    tryNext(index + 1);
                    return;
                }
                CdnLevelSource._cache.set(id, level);
                console.log('[CdnLevel] level', id, 'from mirror', index, 'objects=' + level.coins.length);
                cb(level);
            });
        };

        tryNext(0);
    }

    /** Drop memoised results (e.g. after the player pulls to refresh). */
    public static clearCache(): void {
        CdnLevelSource._cache.clear();
    }

    /** True when a CDN copy was found for this stage this session. */
    public static isFromCdn(id: number): boolean {
        return (CdnLevelSource._cache.get(id) ?? null) !== null;
    }

    private static _parse(body: string, expectedId: number): LevelData | null {
        try {
            const data = JSON.parse(body) as LevelData & { schemaVersion?: number };
            if (!data || typeof data !== 'object') return null;
            // A ModConfig bundle is not a level.
            if (data.schemaVersion != null) return null;
            if (!Array.isArray(data.coins)) return null;
            if (typeof data.id !== 'number') data.id = expectedId;
            if (typeof data.width !== 'number' || typeof data.height !== 'number') return null;
            if (!data.wall || typeof data.wall.thickness !== 'number') {
                data.wall = { thickness: 64 };
            }
            return data;
        } catch {
            return null;
        }
    }
}
