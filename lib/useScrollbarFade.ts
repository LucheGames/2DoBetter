import { useEffect, RefObject } from "react";

/**
 * Adds the `is-scrolling` class to the element while it is actively scrolling,
 * then removes it after `fadeDelay` ms of inactivity.
 *
 * CSS in globals.css uses this class to show/hide the webkit scrollbar thumb.
 * The listener is always `passive: true` — scroll position is never touched.
 */
export function useScrollbarFade(
  ref: RefObject<HTMLElement | null>,
  fadeDelay = 900,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;

    function onScroll() {
      el!.classList.add("is-scrolling");
      clearTimeout(timer);
      timer = setTimeout(() => el!.classList.remove("is-scrolling"), fadeDelay);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [ref, fadeDelay]);
}
