/**
 * Scrolls the target into view with minimal movement ("nearest"),
 * while keeping the anchor (step button) fully visible.
 * If keeping both fully visible isn’t possible, it scrolls only up to
 * the point where the anchor would start to disappear (your #13).
 *
 * @param {Element|string} target - Element or selector for the highlighted line.
 * @param {Element|string} anchor - Element or selector for the step button.
 * @param {Object} [opts]
 * @param {boolean} [opts.smooth=true] - Use smooth scrolling.
 * @returns {{scrolled: boolean, delta: number, scroller: Element}} info
 */
function scrollNearestKeepAnchorVisible(target, anchor, opts = {}) {
  const smooth = opts.smooth !== false;

  const resolve = (x) => (typeof x === 'string' ? document.querySelector(x) : x);
  const el = resolve(target);
  const btn = resolve(anchor);

  if (!el || !btn) return { scrolled: false, delta: 0, scroller: null };

  // Find the scrollable ancestor that will actually move.
  const getScroller = (node) => {
    let n = node.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/auto|scroll|overlay/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  const scroller = getScroller(el);
  const docScroller = document.scrollingElement || document.documentElement;
  const isWindowScroller = scroller === docScroller;

  const scrollerRect = isWindowScroller
    ? { top: 0, height: window.innerHeight }
    : scroller.getBoundingClientRect();

  const elRect = el.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();

  // Positions relative to the scroller’s viewport
  const elTop = elRect.top - scrollerRect.top;
  const elBottom = elTop + elRect.height;

  // Already fully visible? do nothing.
  if (elTop >= 0 && elBottom <= scrollerRect.height) {
    return { scrolled: false, delta: 0, scroller };
  }

  // Minimal movement ("nearest") to reveal the element.
  let desiredDelta = 0;
  if (elTop < 0 && elBottom > scrollerRect.height) {
    // Element spans beyond both edges (taller than viewport) — choose smaller move.
    const up = elTop; // negative
    const down = elBottom - scrollerRect.height; // positive
    desiredDelta = Math.abs(up) <= Math.abs(down) ? up : down;
  } else if (elTop < 0) {
    desiredDelta = elTop; // negative => scroll up
  } else if (elBottom > scrollerRect.height) {
    desiredDelta = elBottom - scrollerRect.height; // positive => scroll down
  }

  // If the button won’t move with this scroll (nested scroller case), it’s always safe.
  const sameScroller =
    isWindowScroller || scroller.contains(btn);

  let delta = desiredDelta;

  if (sameScroller) {
    // Clamp so the button remains fully visible after the scroll.
    const btnTop = btnRect.top - scrollerRect.top;
    const btnHeight = btnRect.height;

    // After scrolling by delta, buttonTop' = btnTop - delta must satisfy:
    //   0 <= buttonTop' <= viewportHeight - btnHeight
    const lowerAllowed = btnTop + btnHeight - scrollerRect.height; // min delta
    const upperAllowed = btnTop;                                    // max delta

    delta = Math.max(lowerAllowed, Math.min(upperAllowed, desiredDelta));
  }

  if (delta === 0) return { scrolled: false, delta: 0, scroller };

  const behavior = smooth ? 'smooth' : 'auto';
  if (isWindowScroller) {
    window.scrollBy({ top: delta, behavior });
  } else {
    scroller.scrollBy({ top: delta, behavior });
  }
  return { scrolled: true, delta, scroller };
}

// Make function globally available
window.scrollNearestKeepAnchorVisible = scrollNearestKeepAnchorVisible;
