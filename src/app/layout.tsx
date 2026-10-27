import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Job Scout",
  description: "Ranked software engineering jobs with per-job resume tailoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className={styles.header}>
          <nav className={styles.nav}>
            <Link href="/" className={styles.brand}>
              Job Scout
            </Link>
            <div className={styles.links}>
              <Link href="/">Feed</Link>
              <Link href="/preferences">Preferences</Link>
              <Link href="/resume">Resume</Link>
            </div>
          </nav>
        </header>
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
