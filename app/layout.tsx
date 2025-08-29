export const metadata = {
  title: "Excalidraw Drawpad",
  description: "Self-hosted Excalidraw with server-backed saves",
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
