"use client";

import { useEffect, useRef, useState } from "react";
import { lasMariasAssets } from "../../lib/brand";

type ExperienceHeroProps = {
  /** When false, hero uses poster image only. */
  videoAvailable?: boolean;
};

export function ExperienceHero({ videoAvailable = true }: ExperienceHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    if (!videoAvailable) return;
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setShowVideo(true);
    const onError = () => setShowVideo(false);

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);
    void video.play().catch(() => setShowVideo(false));

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };
  }, [videoAvailable]);

  return (
    <section className="relative min-h-[100svh] overflow-hidden" aria-label="Hero">
      <div className="absolute inset-0">
        <img
          src={lasMariasAssets.heroSunset}
          alt="Atardecer en Las Marías"
          className={`h-full w-full object-cover transition-opacity duration-700 ${
            showVideo ? "opacity-0" : "opacity-100"
          }`}
          fetchPriority="high"
        />
        {videoAvailable ? (
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              showVideo ? "opacity-100" : "opacity-0"
            }`}
            poster={lasMariasAssets.heroSunset}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden={!showVideo}
          >
            <source src={lasMariasAssets.reel} type="video/mp4" />
          </video>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-maria-forest-dark/55 via-maria-forest-dark/35 to-maria-forest-dark/90" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-maria-ocean-light">
          Reserva de la Biósfera · Islas Marías · México
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-maria-pearl sm:text-5xl lg:text-6xl">
          Ecoturismo de lujo en el corazón del Pacífico
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-maria-sand/90 sm:text-lg">
          Yates privados, pesca deportiva, surf, buceo, bodas y experiencias a medida para
          viajeros de alto valor, agencias y familias que buscan lo extraordinario.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="#reservar"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-maria-sunset px-8 text-sm font-semibold text-maria-pearl shadow-xl shadow-maria-sunset/25 transition hover:bg-maria-sunset-light"
          >
            Diseñar mi experiencia
          </a>
          <a
            href="#experiencias"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-maria-pearl/25 bg-maria-pearl/10 px-8 text-sm font-semibold text-maria-pearl backdrop-blur-sm transition hover:bg-maria-pearl/15"
          >
            Explorar experiencias
          </a>
        </div>
      </div>
    </section>
  );
}
