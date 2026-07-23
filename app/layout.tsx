import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const description =
    "从中国古代星空进入地球，在真实天气与公共事实之上理解世界如何变化。";

  return {
    metadataBase: baseUrl,
    title: "墨观｜今日天地",
    description,
    openGraph: {
      title: "墨观｜今日天地",
      description,
      type: "website",
      images: [
        {
          url: new URL("/og.png", baseUrl).toString(),
          width: 1536,
          height: 1024,
          alt: "墨观今日天地：仰观天象，俯察人事",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "墨观｜今日天地",
      description,
      images: [new URL("/og.png", baseUrl).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
