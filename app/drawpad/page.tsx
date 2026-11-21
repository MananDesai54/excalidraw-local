"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ExcalidrawPad from "@/components/ExcalidrawPad";

function DrawpadInner() {
  const sp = useSearchParams();
  const path = sp?.get("path") || "/untitled.excalidraw";
  return <ExcalidrawPad key={path} path={path} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DrawpadInner />
    </Suspense>
  );
}
