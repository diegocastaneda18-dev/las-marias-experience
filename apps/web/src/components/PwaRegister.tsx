"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || isStandaloneDisplay()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible || !installEvent) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] px-4 md:bottom-4 md:left-auto md:right-4 md:max-w-sm md:px-0 lg:bottom-4">
      <div className="rounded-2xl border border-amber-400/25 bg-slate-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
        <p className="text-sm font-semibold text-slate-50">Instalar Las Marías Experience</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Add to your home screen for quick catch logging and live standings on the water.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              void installEvent.prompt().then(() => {
                setVisible(false);
                setInstallEvent(null);
              });
            }}
            className="min-h-11 flex-1 rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Install
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="min-h-11 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
