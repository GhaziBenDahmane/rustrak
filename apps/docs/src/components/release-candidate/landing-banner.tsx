'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { RC_CALL, RC_HREF, RC_LABEL, RC_STORAGE_KEY, RC_TEXT } from './copy';

/*
  Whether the reader dismissed the announcement, read from the same key
  Nextra's banner writes, so the two surfaces agree.

  `useSyncExternalStore` rather than an effect: the value has to come from the
  browser, which the static export does not have. The server snapshot says
  `shown`, so the strip is in the HTML and on the first paint for the many who
  have not dismissed it; for the few who have, the inline script below hides
  it before that paint, the same trick Nextra's banner uses, and React then
  reconciles to nothing. `subscribe` listens for the change the docs banner
  makes in another tab; in this tab the dismiss button writes and notifies
  itself.
*/
type Snapshot = 'shown' | 'dismissed';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function snapshot(): Snapshot {
  try {
    return localStorage.getItem(RC_STORAGE_KEY) ? 'dismissed' : 'shown';
  } catch {
    return 'shown';
  }
}

function dismiss() {
  try {
    localStorage.setItem(RC_STORAGE_KEY, '1');
  } catch {
    // A browser that refuses storage still gets the banner hidden for this
    // page: the listeners re-read and `snapshot` keeps answering `shown`,
    // so hide it here without depending on storage.
  }
  for (const listener of listeners) listener();
}

/**
 * The announcement strip at the top of the landing.
 *
 * Lives inside the nav's fixed box so it stays at the top with the bar and
 * pushes the bar down by its own height rather than sliding under it.
 */
export function ReleaseCandidateBanner() {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'shown');

  if (state !== 'shown') return null;

  return (
    <div
      id="rustrak-rc-banner"
      className="relative bg-primary text-primary-foreground"
      suppressHydrationWarning
    >
      <script
        // Runs before hydration, so a reader who dismissed the announcement
        // never sees it paint. `suppressHydrationWarning` above is for the
        // class this may have added by the time React compares.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string with no reader input in it
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem('${RC_STORAGE_KEY}'))document.getElementById('rustrak-rc-banner').classList.add('hidden')}catch(e){}`,
        }}
      />
      <div className="mx-auto flex max-w-360 items-center justify-center gap-x-3 gap-y-1 px-12 py-2 text-center text-[13px] font-medium sm:text-sm">
        <span className="rounded-md border border-current/25 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
          {RC_LABEL}
        </span>
        <span className="hidden sm:inline">{RC_TEXT}</span>
        <Link href={RC_HREF} className="underline underline-offset-2">
          {RC_CALL} →
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute inset-y-0 right-3 my-auto flex size-7 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
