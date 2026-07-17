"use client";

// Catches errors thrown by the root layout itself (e.g. AppShell's sim-loop
// setup), which a route-level error.tsx cannot reach. Must render its own
// <html>/<body> since it replaces the root layout when active (M-6).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body style={{ background: "#23262b", color: "#e8eaed", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>ProAI-SLO console failed to load</h1>
          <p style={{ maxWidth: 420, fontSize: 14, color: "#9aa1ab" }}>
            A fault occurred outside any single screen. This is a UI-layer failure in the demo console — no plant
            control is affected.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              borderRadius: 6,
              background: "#1b5faa",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              padding: "8px 16px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <pre
            style={{
              marginTop: 8,
              maxWidth: 480,
              overflowX: "auto",
              borderRadius: 6,
              border: "1px solid #3a3f47",
              background: "#1a1c20",
              padding: 12,
              textAlign: "left",
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            {error.message}
          </pre>
        </div>
      </body>
    </html>
  );
}
