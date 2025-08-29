"use client";

import React from "react";
import ExcalidrawPad from "@/components/ExcalidrawPad";

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const path = (searchParams?.path as string) || "/untitled.excalidraw";
  return <ExcalidrawPad path={path} />;
}
