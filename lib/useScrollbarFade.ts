import { useEffect, RefObject } from "react";

/**
 * Adds the `sb-visible` class to the element while the user is hovering
 * or actively scrolling, then removes it after `fadeDelay` ms of inactivity
 * once the pointer has also left.
 *
 * CSS in globals.css uses this class to show/hide the webkit scrollbar thumb.
 * All listeners are `passive: true` — scroll position is never touched.
 */
export function useScrollbarFade(
  ref: RefObject<HTMLElement | null>,
  fadeDelay = 400,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let hovering = false;
    let timer: ReturnType<typeof setTimeout>;

    function show() {
      clearTimeout(timer);
      el!.classList.add("sb-visible");
    }

    function fadeOut() {
      clearTimeout(timer);
      timer = setTimeout(() => el!.classList.remove("sb-visible"), fadeDelay);
    }

    function onScroll() {
      show();
      // After scrolling stops, only fade if pointer is outside the box
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!hovering) el!.classList.remove("sb-visible");
      }, fadeDelay);
    }

    function onEnter() {
      hovering = true;
      show();
    }

    function onLeave() {
      hovering = false;
      fadeOut();
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("mouseenter", onEnter, { passive: true });
    el.addEventListener("mouseleave", onLeave, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      clearTimeout(timer);
    };
  }, [ref, fadeDelay]);
}
