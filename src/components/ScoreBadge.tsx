import styles from "./ui.module.css";

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tier = score >= 70 ? styles.high : score >= 45 ? styles.mid : styles.low;
  return (
    <div className={`${styles.score} ${tier} ${size === "lg" ? styles.scoreLg : ""}`} aria-label={`Match score ${score}`}>
      {score}
    </div>
  );
}
