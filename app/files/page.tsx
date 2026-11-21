"use client";

import FileBrowserModal from "@/components/FileBrowserModal";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function FilesInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const startDir = (sp?.get("dir") as string) || "/";

  return (
    <FileBrowserModal
      open={true} // show modal as the whole page
      startDir={startDir}
      onClose={() => router.push("/")} // close → go home (or choose where you want)
      onPick={(p) => {
        // pick → open in editor
        router.push(`/drawpad?path=${encodeURIComponent(p)}`);
      }}
    />
  );
}

export default function FilesPage() {
  return (
    <Suspense fallback={null}>
      <FilesInner />
    </Suspense>
  );
}
