import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "CRN — Case & Recovery Network",
  description: "Public case archive and controlled evidence intake.",
  icons: {
    icon: "/images/logo.svg",
  },
  openGraph: {
    images: ["/images/share-card.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/images/share-card.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <Script
          id="crn-google-tag"
          src="https://www.googletagmanager.com/gtag/js?id=G-XPLL7QNHKD"
          strategy="afterInteractive"
        />
        <Script id="crn-google-tag-config" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-XPLL7QNHKD');`}
        </Script>
      </body>
    </html>
  );
}
