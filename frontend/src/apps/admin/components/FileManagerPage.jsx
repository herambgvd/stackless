import { useState } from "react";
import { useConfirm } from "@/shared/components/ui/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Download,
  Trash2,
  Search,
  FolderOpen,
  File,
  Image,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { fmtSmart } from "@/shared/lib/date";

function FileTypeIcon({ contentType }) {
  if (contentType?.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (contentType?.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileManagerPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const PAGE_SIZE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-files", page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
      if (search) params.set("search", search);
      const res = await apiClient.get(`/admin/files?${params}`);
      return res.data;
    },
    keepPreviousData: true,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const downloadMut = useMutation({
    mutationFn: async (fileId) => {
      const res = await apiClient.get(`/admin/files/${fileId}/download-url`);
      return res.data;
    },
    onSuccess: ({ url, filename }) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.click();
    },
    onError: () => toast.error("Could not get download URL"),
  });

  const deleteMut = useMutation({
    mutationFn: async (fileId) => {
      await apiClient.delete(`/admin/files/${fileId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-files"] });
      toast.success("File deleted");
    },
    onError: () => toast.error("Failed to delete file"),
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">File Manager</h1>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">{total} files</Badge>
          )}
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by filename…"
            className="h-8 w-64 text-sm"
          />
          <Button size="sm" variant="outline" type="submit">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Filename</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>App / Model</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? "No files match your search" : "No files uploaded yet"}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <FileTypeIcon contentType={file.content_type} />
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate" title={file.filename}>
                    {file.filename}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{file.content_type?.split("/")[1] ?? file.content_type ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatBytes(file.size)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground font-mono">
                      {file.app_id?.slice(-6)} / {file.model_slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtSmart(file.uploaded_at).label}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => downloadMut.mutate(file.id)}
                        disabled={downloadMut.isPending}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (await confirm({ title: "Delete File", message: "Delete this file? This cannot be undone.", confirmLabel: "Delete", variant: "destructive" })) {
                            deleteMut.mutate(file.id);
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
