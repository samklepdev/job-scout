"use client";

import styles from "./ui.module.css";

export function PrintButton() {
  return (
    <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
