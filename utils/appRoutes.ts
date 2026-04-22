export function normalizeAppPath(path: string) {
  const noQuery = (path || '/').split('?')[0] ?? '/';
  return noQuery.replace(/\/$/, '') || '/';
}

/** True when `pathname` is already the screen targeted by `href` (Expo Router group paths + leaf-only pathnames). */
export function isSameAppRoute(pathname: string, href: string): boolean {
  const p = normalizeAppPath(pathname);
  const h = normalizeAppPath(href);
  if (p === h) return true;
  if (h === '/' && (p === '/' || p === '/index')) return true;

  const pParts = p.split('/').filter(Boolean);
  const hParts = h.split('/').filter(Boolean);
  if (hParts.length === 0) return false;

  if (pParts.length === 1 && hParts.length >= 2) {
    return pParts[0] === hParts[hParts.length - 1];
  }

  if (pParts.length < 2 || hParts.length < 2) return false;
  const hGroup = hParts[0];
  const hScreen = hParts[hParts.length - 1];
  const pGroup = pParts[0];
  const pScreen = pParts[pParts.length - 1];
  return pGroup === hGroup && pScreen === hScreen;
}
