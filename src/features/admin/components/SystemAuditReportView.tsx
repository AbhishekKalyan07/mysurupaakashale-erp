import { parseAuditLogDetails } from "@/shared/utils/auditParser";

interface SystemAuditReportViewProps {
  details: any;
}

export function SystemAuditReportView({ details }: SystemAuditReportViewProps) {
  const { isRawDump, report } = parseAuditLogDetails(details);

  if (!isRawDump || !report) {
    if (!details || Object.keys(details).length === 0) {
      return (
        <span className="text-[10px] text-text-muted font-medium italic">
          No additional details provided.
        </span>
      );
    }
    return (
      <pre className="text-[10px] text-text-muted w-full overflow-x-auto bg-background-alt p-3 rounded-lg border border-primary/10 whitespace-pre-wrap word-break shadow-inner font-medium">
        {JSON.stringify(details, null, 2)}
      </pre>
    );
  }

  const isPassed = report.status === "passed";
  const statusText = isPassed
    ? "✅ Passed"
    : report.status === "warning"
      ? "⚠️ Warning"
      : "❌ Failed";

  return (
    <div className="flex flex-col gap-4 font-sans w-full max-w-full bg-background-alt p-4 rounded-xl border border-primary/10">
      <h3 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">
        System Audit Report
      </h3>

      <div className="text-xs">
        <span className="font-bold text-text-muted">Status: </span>
        <span
          className={
            isPassed ? "text-green-600 font-bold" : "text-red-600 font-bold"
          }
        >
          {statusText}
        </span>
      </div>

      <div className="text-xs">
        <span className="font-bold text-text-muted">Summary: </span>
        <span className="text-primary">{report.summary}</span>
      </div>

      {report.checksPerformed.length > 0 ? (
        <div className="text-xs">
          <span className="font-bold text-text-muted block mb-1">
            Checks Performed
          </span>
          <ul className="list-disc pl-4 text-primary space-y-0.5">
            {report.checksPerformed.map((check, i) => (
              <li key={i}>{check}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-xs">
          <span className="font-bold text-text-muted block mb-1">
            Checks Performed
          </span>
          <span className="text-primary">Not available</span>
        </div>
      )}

      <div className="text-xs">
        <span className="font-bold text-text-muted block mb-1">Tests</span>
        {report.tests.length > 0 ? (
          <span className="text-primary">
            {report.tests.filter((t) => t.status === "passed").length}/
            {report.tests.length} tests passed
          </span>
        ) : (
          <span className="text-primary">Not available</span>
        )}
      </div>

      <div className="text-xs">
        <span className="font-bold text-text-muted block mb-1">
          Issues Found
        </span>
        {report.issuesFound.length > 0 ? (
          <ul className="list-disc pl-4 text-red-600 space-y-0.5">
            {report.issuesFound.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        ) : (
          <span className="text-primary">None</span>
        )}
      </div>

      <div className="text-xs">
        <span className="font-bold text-text-muted block mb-1">
          Recommendations
        </span>
        {report.recommendations.length > 0 ? (
          <ul className="list-disc pl-4 text-primary space-y-0.5">
            {report.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        ) : (
          <span className="text-primary">No immediate action required</span>
        )}
      </div>
    </div>
  );
}
