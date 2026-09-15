"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useState } from "react";

import { track } from "@/lib/analytics";

type LazyVideoProps = {
  title: string;
  src: string;
  poster: string;
  posterAlt: string;
};

export function LazyVideo({ title, src, poster, posterAlt }: LazyVideoProps) {
  const [active, setActive] = useState(false);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden bg-black">
      {active ? (
        <video
          className="h-full w-full object-cover"
          src={src}
          poster={poster}
          controls
          autoPlay
          preload="metadata"
          playsInline
          aria-label={title}
          onPlay={() => {
            if (!started) {
              track("marketing_video_started", { title, src });
              setStarted(true);
            }
          }}
          onEnded={() => {
            if (!completed) {
              track("marketing_video_completed", { title, src });
              setCompleted(true);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="group relative h-full w-full text-left"
          onClick={() => setActive(true)}
          aria-label={`Play ${title}`}
        >
          <Image src={poster} alt={posterAlt} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
          <span className="absolute inset-0 bg-[#0b1736]/20 transition group-hover:bg-[#0b1736]/10" aria-hidden="true" />
          <span className="absolute left-5 top-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0b4fd8] shadow-lg">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
}
