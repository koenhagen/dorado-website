/**
 * The demo overlay: opening, the focus trap, Esc, the scrim, scroll lock, and
 * restoring focus. The panel's markup and styling live with the page.
 *
 * Accessibility: `role="dialog"` + `aria-modal="true"`, focus moves in on open
 * and back to the trigger on close, Tab cycles within, Esc closes, and the page
 * behind is inert to assistive tech and cannot scroll underneath.
 */

export interface DemoOverlayOptions {
  /** The dialog element. Must already be in the DOM. */
  root: HTMLElement;
  /** Controls that open it. Focus returns to whichever one was used. */
  triggers: HTMLElement[];
  /** Elements that close it (the scrim, an X, a "done" button). */
  closers: HTMLElement[];
  /** Everything outside the dialog that should be hidden from AT while open. */
  siblings: HTMLElement[];
  /** Called after the dialog is visible and focus has moved in. */
  onOpen?: () => void;
  onClose?: () => void;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export class DemoOverlay {
  private readonly root: HTMLElement;
  private readonly options: DemoOverlayOptions;
  private lastTrigger: HTMLElement | null = null;
  private scrollY = 0;

  open = false;

  constructor(options: DemoOverlayOptions) {
    this.options = options;
    this.root = options.root;

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;

    options.triggers.forEach((trigger) => {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        this.show(trigger);
      });
    });

    options.closers.forEach((closer) => {
      closer.addEventListener('click', (event) => {
        event.preventDefault();
        this.hide();
      });
    });

    // On the document so they work wherever focus sits inside the panel.
    document.addEventListener('keydown', this.onKeydown);
  }

  show(trigger?: HTMLElement) {
    if (this.open) return;
    this.open = true;
    this.lastTrigger = trigger ?? (document.activeElement as HTMLElement | null);

    // Lock the page where it stands, without the layout jump `overflow: hidden`
    // alone causes on a scrolled page.
    this.scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    this.options.siblings.forEach((el) => el.setAttribute('aria-hidden', 'true'));

    this.root.hidden = false;
    void this.root.offsetWidth; // force a frame so the entrance transition runs

    this.root.dataset.open = 'true';
    document.body.dataset.overlay = 'open';

    this.focusFirst();
    this.options.onOpen?.();
  }

  hide() {
    if (!this.open) return;
    this.open = false;

    this.root.dataset.open = 'false';
    document.body.dataset.overlay = 'closed';
    this.options.siblings.forEach((el) => el.removeAttribute('aria-hidden'));

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, this.scrollY);

    this.options.onClose?.();

    const finish = () => {
      if (this.open) return; // reopened during the transition
      this.root.hidden = true;
    };
    const duration = this.exitDuration();
    if (duration > 0) window.setTimeout(finish, duration);
    else finish();

    this.lastTrigger?.focus();
  }

  private exitDuration(): number {
    const declared = getComputedStyle(this.root).transitionDuration;
    const seconds = parseFloat(declared || '0');
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }

  private focusFirst() {
    // Prefer the nominated control, usually the transport.
    const preferred = this.root.querySelector<HTMLElement>('[data-overlay-focus]');
    const target = preferred ?? this.focusables()[0] ?? this.root;
    if (target === this.root) this.root.setAttribute('tabindex', '-1');
    target.focus();
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (!this.open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
      return;
    }

    if (event.key !== 'Tab') return;

    const items = this.focusables();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (active === first || !this.root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
