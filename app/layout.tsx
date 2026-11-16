import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solar Roof Scanner",
  description: "Find homes with rooftop solar in aerial images.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
