import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { schemaApi } from "../api/schema.api";

/**
 * Global search bar — searches across all searchable models in the app.
 * Props: appId (required)
 */
export function GlobalSearch({ appId }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebounce(query, 300);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", appId, debouncedQuery],
    queryFn: () => schemaApi.globalSearch(appId, debouncedQuery, 20),
    enabled: !!appId && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const results = data?.results ?? [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (result) => {
    setQuery("");
    setOpen(false);
    navigate({ to: `/apps/${appId}/${result.model_slug}/records/${result.record_id}` });
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search records… (⌘K)"
          className="pl-9 h-8 text-sm bg-muted/50"
        />
        {isFetching && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && debouncedQuery.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-sm text-center text-muted-foreground">
              {isFetching ? "Searching…" : "No results found"}
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-border">
              {results.map((result, i) => (
                <li key={i}>
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelect(result)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{result.label}</p>
                      <p className="text-xs text-muted-foreground">{result.model_name}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
