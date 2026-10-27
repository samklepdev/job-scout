import { setStatusAction } from "@/app/actions";
import type { JobStatus } from "@/lib/types";
import styles from "./ui.module.css";

function StatusButton({ id, status, label }: { id: number; status: JobStatus; label: string }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`${styles.button} ${styles.ghost}`}>
        {label}
      </button>
    </form>
  );
}

export function StatusButtons({ id, status }: { id: number; status: JobStatus }) {
  return (
    <div className={styles.statusButtons}>
      {status === "saved" ? (
        <StatusButton id={id} status="new" label="Unsave" />
      ) : status !== "applied" ? (
        <StatusButton id={id} status="saved" label="Save" />
      ) : null}
      {status !== "applied" && <StatusButton id={id} status="applied" label="Mark applied" />}
      {status === "hidden" || status === "applied" ? (
        <StatusButton id={id} status="new" label={status === "hidden" ? "Unhide" : "Undo applied"} />
      ) : (
        <StatusButton id={id} status="hidden" label="Hide" />
      )}
    </div>
  );
}
