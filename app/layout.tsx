import { IdbProvider } from "@/app/lib/provider/idb-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <IdbProvider />
        {children}
      </body>
    </html>
  );
}