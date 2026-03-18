"use client";

import { useRef, useState, useCallback } from "react";

type Props = {
  onConfirm: () => void;
  className?: string;
  label?: string;
};

const HOLD_MS = 600;

export default function HoldToDelete({ onConfirm, className = "", label = "Delete?" }: Props) {
  const [phase, setPhase] = useState<"idle" | "holding" | "confirm">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progress, setProgress] = useState(0);

  const startHold = useCallback(() => {
    if (phase === "confirm") return;
    setPhase("holding");
    setProgress(0);

    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / HOLD_MS) * 100, 100));
    }, 16);

    timerRef.current = setTimeout(() => {
      clearInterval(progressRef.current!);
      setPhase("confirm");
      setProgress(0);
    }, HOLD_MS);
  }, [phase]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    if (phase === "holding") {
      setPhase("idle");
      setProgress(0);
    }
  }, [phase]);

  if (phase === "confirm") {
    return (
      <>
        {/* Backdrop — tap outside to cancel */}
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setPhase("idle"); }}
        />
        {/* Centered confirm popup */}
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div
            className="pointer-events-auto flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm text-red-300 whitespace-nowrap">{label}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirm(); setPhase("idle"); }}
              className="min-w-[44px] min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium flex items-center justify-center"
              style={{ cursor: "pointer" }}
            >
              Yes
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setPhase("idle"); }}
              className="min-w-[44px] min-h-[44px] px-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium flex items-center justify-center"
              style={{ cursor: "pointer" }}
            >
              No
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      {/* 36px minimum tap target — padding expands the clickable area without enlarging the × glyph */}
      <button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={(e) => { e.preventDefault(); startHold(); }}
        onTouchEnd={cancelHold}
        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-500 hover:text-red-400 select-none transition-colors rounded"
        title="Hold to delete"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a9 9 0 0 0-9 9c0 3.18 1.65 5.97 4.13 7.57L7 20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l-.13-1.43A9 9 0 0 0 12 2zm-2.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
      </button>
      {phase === "holding" && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="rgb(239 68 68 / 0.5)"
            strokeWidth="2"
            strokeDasharray={`${(progress / 100) * 87.96} 87.96`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
      )}
    </span>
  );
}
