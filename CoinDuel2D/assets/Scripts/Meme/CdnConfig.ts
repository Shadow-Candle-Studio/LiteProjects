/**
 * Free remote CDN endpoints for AssetSyncManager.
 *
 * Points at the shared studio repo (Shadow-Candle-Studio/LiteProjects), branch
 * `main`. Note the underscore: the upstream branch is NOT the same
 * name as the personal fork's `main`, and getting it wrong yields a
 * silent 404 with the game falling back to bundled assets.
 *
 * Always use an absolute https URL — never relative paths or 127.0.0.1 (breaks on itch.io).
 */

/** Live free CDN (jsDelivr → GitHub /cdn). */
export const DEFAULT_CDN_MANIFEST_URL =
    'https://cdn.jsdelivr.net/gh/Shadow-Candle-Studio/LiteProjects@main/cdn/manifest.json';

/** jsDelivr template (USER/REPO). */
export const JSDELIVR_MANIFEST_TEMPLATE =
    'https://cdn.jsdelivr.net/gh/<USER>/<REPO>@main/cdn/manifest.json';

/** Repo + branch that holds `/cdn`. Level files are read from raw GitHub (instant updates). */
export const CDN_REPO_OWNER = 'Shadow-Candle-Studio';
export const CDN_REPO_NAME = 'LiteProjects';
export const CDN_REPO_BRANCH = 'main';

/**
 * raw.githubusercontent base for a file in the repo.
 * Unlike jsDelivr, this reflects a fresh commit immediately and sends
 * `Access-Control-Allow-Origin: *`, so it is used for campaign levels where the
 * editor writes and the game reads back within seconds.
 *
 * Caveat observed in practice: for a low-traffic branch GitHub's edge cache can
 * keep serving the previous body for many minutes even with a cache-busting
 * query string. Callers should try jsDelivr first and fall back to this.
 */
export function githubRawUrl(path: string): string {
    const clean = String(path || '').replace(/^\/+/, '');
    return 'https://raw.githubusercontent.com/' + CDN_REPO_OWNER + '/' + CDN_REPO_NAME
        + '/' + CDN_REPO_BRANCH + '/' + clean;
}

/**
 * jsDelivr URL for a file in the repo (same CDN the manifest is served from).
 *
 * Preferred over raw for immutable refs. Note it caches a branch for hours, so
 * never use it as the only source for a file that changes at authoring time.
 */
export function jsdelivrUrl(path: string): string {
    const clean = String(path || '').replace(/^\/+/, '');
    return 'https://cdn.jsdelivr.net/gh/' + CDN_REPO_OWNER + '/' + CDN_REPO_NAME
        + '@' + CDN_REPO_BRANCH + '/' + clean;
}

/**
 * GitHub API URL listing the newest commits touching `path` on the branch.
 *
 * NOTE: not used for level loading — the API's commits?path= route lags behind
 * recent pushes and is rate limited to 60/hour unauthenticated, which made it
 * report a stale commit right after a save. Kept for diagnostics only.
 */
export function githubCommitUrl(path: string): string {
    const clean = String(path || '').replace(/^\/+/, '');
    return 'https://api.github.com/repos/' + CDN_REPO_OWNER + '/' + CDN_REPO_NAME
        + '/commits?path=' + encodeURIComponent(clean)
        + '&sha=' + encodeURIComponent(CDN_REPO_BRANCH)
        + '&per_page=1';
}

/** raw.github content at one exact commit. Diagnostic use only (see above). */
export function githubRawAtCommit(sha: string, path: string): string {
    const clean = String(path || '').replace(/^\/+/, '');
    return 'https://raw.githubusercontent.com/' + CDN_REPO_OWNER + '/' + CDN_REPO_NAME
        + '/' + sha + '/' + clean
        + '?t=' + Date.now().toString(36);
}

/** True when url is a usable absolute http(s) remote (not localhost). */
export function isRemoteHttpsManifestUrl(url: string | null | undefined): boolean {
    const u = (url || '').trim();
    if (!/^https?:\/\//i.test(u)) return false;
    if (/^(https?:\/\/)?(127\.0\.0\.1|localhost)([:/]|$)/i.test(u)) return false;
    return true;
}

/** Prefer caller url; otherwise DEFAULT. Always returns absolute https CDN URL. */
export function resolveCdnManifestUrl(preferred?: string | null): string {
    const u = (preferred || '').trim().split(/[?#]/)[0];
    if (isRemoteHttpsManifestUrl(u)) return u;
    return DEFAULT_CDN_MANIFEST_URL;
}