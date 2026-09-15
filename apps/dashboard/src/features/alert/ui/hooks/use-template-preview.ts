import { useCallback, useEffect, useRef, useState } from 'react';
import { previewTemplate } from '@/features/alert/api/mutations';

/**
 * What the body renders to, as the server sees it.
 *
 * `rendering` keeps the last answer on screen while the next one is on its
 * way, so the panel does not flash empty between keystrokes. `error` carries
 * the server's reason, which the editor also underlines; `unavailable` is a
 * request that failed rather than a template that would.
 */
export type TemplatePreview =
  | { status: 'idle' }
  | { status: 'rendering'; rendered?: string }
  | { status: 'ok'; rendered: string }
  | { status: 'error'; error: string; rendered?: string }
  | { status: 'unavailable'; rendered?: string };

/** Long enough to skip the keystrokes inside a word, short enough to feel live. */
const DEBOUNCE_MS = 350;

/**
 * How long the text has to have been still before a refusal is shown. A body
 * is broken for most of the time it is being typed (`{{ iss` is not a
 * template yet), and a red panel that flashes on every pause inside a word
 * reads as the editor arguing. A success is shown as soon as it arrives.
 */
const ERROR_SETTLE_MS = 800;

/**
 * Asks the server what a template renders to, a little after the reader
 * stops typing. The dashboard cannot run the template engine, and a preview
 * from anywhere else would eventually disagree with what a delivery sends.
 *
 * Answers that arrive out of order are dropped: only the request for the
 * latest text is allowed to set state.
 *
 * `request` keeps one identity for the life of the hook, so a caller can name
 * it in an effect's dependencies without that effect re-running on every
 * render.
 */
export function useTemplatePreview() {
  const [preview, setPreview] = useState<TemplatePreview>({ status: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const request = useCallback((template: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (settle.current) clearTimeout(settle.current);
    const ticket = ++sequence.current;
    const typedAt = Date.now();

    if (!template.trim()) {
      setPreview({ status: 'idle' });
      return;
    }

    setPreview((current) => ({
      status: 'rendering',
      rendered: 'rendered' in current ? current.rendered : undefined,
    }));

    timer.current = setTimeout(async () => {
      const result = await previewTemplate(template);
      if (ticket !== sequence.current) return;

      if (result.success && result.data.ok && result.data.rendered != null) {
        const rendered = result.data.rendered;
        setPreview({ status: 'ok', rendered });
        return;
      }

      // A refusal waits for the text to settle. Typing again in the meantime
      // starts a fresh request, and this answer is never shown.
      const refusal = (current: TemplatePreview): TemplatePreview => {
        const kept = 'rendered' in current ? current.rendered : undefined;
        if (!result.success) return { status: 'unavailable', rendered: kept };
        return {
          status: 'error',
          error: result.data.error ?? '',
          rendered: kept,
        };
      };
      settle.current = setTimeout(
        () => {
          if (ticket !== sequence.current) return;
          setPreview(refusal);
        },
        Math.max(0, ERROR_SETTLE_MS - (Date.now() - typedAt)),
      );
    }, DEBOUNCE_MS);
  }, []);

  return { preview, request };
}
