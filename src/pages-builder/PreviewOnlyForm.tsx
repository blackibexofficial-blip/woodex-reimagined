import { useContext, type ReactNode } from "react";
import { BuilderModeContext } from "./shell";

/** The builder's legacy forms are visual demos, not submission integrations.
 * Keep them available in the editor and LAB, but never render them as working
 * forms if a future published renderer opts in to public mode. */
export function PreviewOnlyForm({ children, newsletter = false }: { children: ReactNode; newsletter?: boolean }) {
  const mode = useContext(BuilderModeContext);
  if (mode !== "public") return <><p className="mb-2 text-xs text-muted-foreground">Preview only — this form does not send submissions.</p>{children}</>;
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-sm" role="note">
      {newsletter ? (
        <p>Newsletter sign-up is currently unavailable.</p>
      ) : (
        <p>This form is currently unavailable. <a className="font-semibold text-accent underline" href="/contact">Contact us instead</a>.</p>
      )}
    </div>
  );
}
