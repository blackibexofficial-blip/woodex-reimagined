import { site } from "@/config/site";

/** This warning does not persist across navigation or prevent duplicate requests. */
export function LeadSubmissionWarning({ detail, acknowledged, onAcknowledge }: {
  detail: string | null;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <div role="alert" className="space-y-2 rounded-sm border border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">We couldn't confirm whether your enquiry and its details were received.</p>
      {detail && <p>{detail}</p>}
      <p>It may already have reached us. Please contact us at <a href={site.phoneHref} className="underline">{site.phone}</a> before sending again to avoid a duplicate.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} />
        <span>I understand another submission may create a duplicate enquiry.</span>
      </label>
    </div>
  );
}
