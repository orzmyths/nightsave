import { Analytics } from '@vercel/analytics/next';
import AppProviders from "../components/AppProviders";

export const metadata = {
  title: "NightSave",
  description: "把想花的錢 留給更想要的",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0E1322", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
