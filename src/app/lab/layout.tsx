import type { Metadata } from "next";

// internal art-direction surface — keep it out of search indexes
export const metadata: Metadata = {
  title: "signal / lab",
  robots: { index: false, follow: false },
};

export default function LabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
