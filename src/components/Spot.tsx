"use client";

import { ReactNode } from "react";

export default function Spot({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative rounded-md transition-shadow duration-300 ${
        on ? "ring-4 ring-indigo-400/70 ring-offset-2" : ""
      }`}
    >
      {on && (
        <span className="absolute -top-3 right-3 z-10 rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
          👀 look here
        </span>
      )}
      {children}
    </div>
  );
}