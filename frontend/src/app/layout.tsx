import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Poppins } from "next/font/google";
import DesktopRootChrome from "./components/DesktopRootChrome";
import "./globals.css";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Teamtime | Team Communication Platform",
  description: "A cross-team communication workspace for channels, direct messages, meetings, files, people, and apps.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${poppins.className}`}>
      <body className={`h-full overflow-hidden ${poppins.className}`} suppressHydrationWarning>
        <DesktopRootChrome>{children}</DesktopRootChrome>
        <Script src="https://meet.teamtime.live/external_api.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
