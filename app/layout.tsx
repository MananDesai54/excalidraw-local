export const metadata = {
  title: "Drawpad",
  description: "Excalidraw drawings as local files — a diagram library for documentation",
};

import "./globals.css";
import React from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
