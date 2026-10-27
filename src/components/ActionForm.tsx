"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import styles from "./ui.module.css";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.button} ${styles[variant]}`} disabled={pending} aria-busy={pending}>
      {pending && <span className={styles.spinner} aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** A form bound to a server action that reports a status message back. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant,
  className,
  inline = false,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState(action, { ok: true, message: "" });
  return (
    <form action={formAction} className={className}>
      {children}
      <div className={inline ? styles.formFooterInline : styles.formFooter}>
        <SubmitButton pendingLabel={pendingLabel} variant={variant}>
          {submitLabel}
        </SubmitButton>
        {state.message && (
          <span role="status" className={state.ok ? styles.ok : styles.error}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
