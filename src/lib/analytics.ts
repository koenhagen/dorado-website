/**
 * Analytics: thin wrappers around Umami (cloud.umami.is), loaded by a <script>
 * in each page's <head>. Umami sets no cookies and stores nothing on the
 * device, so there is no consent banner to show.
 *
 * Every call is fire-and-forget. If the script is blocked or still loading,
 * nothing happens, and the page never waits on it.
 */

type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => void };
  }
}

export function track(event: string, data?: EventData) {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics must never break the page.
  }
}

/** Coarse range, so the dashboard groups visits instead of listing seconds. */
function range(seconds: number) {
  if (seconds < 10) return '0-10s';
  if (seconds < 30) return '10-30s';
  if (seconds < 60) return '30-60s';
  if (seconds < 180) return '1-3m';
  if (seconds < 600) return '3-10m';
  return '10m+';
}

/* Time on page, counting only while the tab is visible: a tab left open in
   the background isn't someone reading. Umami can't see the length of a
   one-page visit by itself (it times the gap between events), so the time is
   sent as an event when the visitor first leaves the page: tab hidden,
   switched away, or closed. Sent once per page view. */
export function trackTimeOnPage() {
  let visibleMs = 0;
  let since = document.visibilityState === 'visible' ? performance.now() : 0;
  let sent = false;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      since = performance.now();
      return;
    }
    if (since) visibleMs += performance.now() - since;
    since = 0;

    if (sent) return;
    sent = true;
    const seconds = Math.round(visibleMs / 1000);
    track('time-on-page', { seconds, range: range(seconds) });
  });
}
