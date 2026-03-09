import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Is It a Fair Estimate? | Know Before You Pay",
  description: "Snap a photo of any service quote and get an instant fairness verdict. Auto repair, HVAC, plumbing, electrical and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
