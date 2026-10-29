import type { Metadata, Viewport } from "next";

// Lets the phone keep Familia on the home screen as its own app: name, icon (app/icon.png, app/apple-icon.png)
// and full screen without the browser bars (app/manifest.ts for Android, appleWebApp for iPhone).
export const metadata: Metadata = {
  title: "Familia",
  description: "Our shared family finance tracker",
  appleWebApp: { capable: true, title: "Familia", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#faf8f4" }}>{children}</body>
    </html>
  );
}
