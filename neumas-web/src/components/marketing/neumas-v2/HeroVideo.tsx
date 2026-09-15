"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type HeroVideoProps = {
  src: string;
  poster: string;
  posterAlt: string;
};

export function HeroVideo({ src, poster, posterAlt }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldPlay, setShouldPlay] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileViewport = window.matchMedia("(max-width: 767px)");

    const updatePlayback = () => {
      const canAutoplay = !reducedMotion.matches && !mobileViewport.matches;
      setShouldPlay(canAutoplay);
      if (!canAutoplay) {
        videoRef.current?.pause();
      }
    };

    updatePlayback();
    reducedMotion.addEventListener("change", updatePlayback);
    mobileViewport.addEventListener("change", updatePlayback);

    return () => {
      reducedMotion.removeEventListener("change", updatePlayback);
      mobileViewport.removeEventListener("change", updatePlayback);
    };
  }, []);

  return (
    <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-white/20 bg-[#0b1736]">
      <Image
        src={poster}
        alt={posterAlt}
        fill
        sizes="(min-width: 1024px) 420px, 100vw"
        className={`object-cover transition-opacity duration-500 ${shouldPlay ? "opacity-0" : "opacity-100"}`}
      />
      {shouldPlay ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster={poster}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Neumas intro story preview"
        />
      ) : null}
    </div>
  );
}
