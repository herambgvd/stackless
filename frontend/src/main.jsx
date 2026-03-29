import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/shared/components/ui/toaster";
import { router } from "./router";
import { queryClient } from "./shared/lib/query-client";
import "./index.css";

class RootErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F8FAFC",
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          padding: "2rem",
        }}>
          <div style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            padding: "3rem",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "12px",
              background: "#FEF2F2", display: "flex",
              alignItems: "center", justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}>
              <svg width="24" height="24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: "600", color: "#1E293B" }}>
              Something went wrong
            </h2>
            <p style={{ margin: "0 0 2rem", fontSize: "0.875rem", color: "#64748B", lineHeight: "1.6" }}>
              An unexpected error occurred. This has been noted. Try refreshing the page.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.5rem 1.25rem", borderRadius: "8px",
                  background: "#2563EB", color: "#fff", border: "none",
                  fontSize: "0.875rem", fontWeight: "500", cursor: "pointer",
                }}
              >
                Reload page
              </button>
              <button
                onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
                style={{
                  padding: "0.5rem 1.25rem", borderRadius: "8px",
                  background: "#fff", color: "#374151",
                  border: "1px solid #E2E8F0",
                  fontSize: "0.875rem", fontWeight: "500", cursor: "pointer",
                }}
              >
                Go home
              </button>
            </div>
            {import.meta.env.DEV && (
              <details style={{ marginTop: "1.5rem", textAlign: "left" }}>
                <summary style={{ fontSize: "0.75rem", color: "#94A3B8", cursor: "pointer" }}>
                  Error details (dev only)
                </summary>
                <pre style={{
                  marginTop: "0.5rem", padding: "0.75rem",
                  background: "#FEF2F2", borderRadius: "6px",
                  fontSize: "0.7rem", color: "#DC2626",
                  whiteSpace: "pre-wrap", overflowX: "auto",
                }}>
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
        {/* {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />} */}
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
