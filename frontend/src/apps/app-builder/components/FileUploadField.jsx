import { useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Upload, FileText, X, Download, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';

/**
 * FILE field renderer for record forms and table cells.
 *
 * Props:
 *   appId, modelSlug, recordId  — used in API calls (null when creating a new record)
 *   fieldName                   — the field's name
 *   value                       — current field value ({ key, filename, size, content_type } | null)
 *   onChange                    — called with new metadata after upload, or null after delete
 *   readOnly                    — show download link only
 */
export default function FileUploadField({
  appId, modelSlug, recordId, fieldName,
  value, onChange, readOnly = false, accept,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post(
        `/schema/apps/${appId}/${modelSlug}/records/${recordId}/files/${fieldName}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data;
    },
    onSuccess: (meta) => {
      onChange?.(meta);
      toast.success(`File uploaded: ${meta.filename}`);
    },
    onError: (err) => {
      toast.error('Upload failed: ' + (err.response?.data?.detail || err.message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiClient.delete(`/schema/apps/${appId}/${modelSlug}/records/${recordId}/files/${fieldName}`),
    onSuccess: () => {
      onChange?.(null);
      toast.success('File removed');
    },
  });

  async function handleDownload() {
    try {
      const res = await apiClient.get(
        `/schema/apps/${appId}/${modelSlug}/records/${recordId}/files/${fieldName}/url`,
      );
      window.open(res.data.url, '_blank');
    } catch {
      toast.error('Could not generate download link');
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!recordId) {
      // New record — store file locally and call onChange with a pending marker
      // The parent must handle actual upload after record creation
      onChange?.({ _pending: true, _file: file, filename: file.name, size: file.size, content_type: file.type });
      return;
    }
    uploadMutation.mutate(file);
  }

  const isPending = uploadMutation.isPending || deleteMutation.isPending;

  if (readOnly) {
    if (!value) return <span className="text-muted-foreground text-xs">No file</span>;
    return (
      <button
        type="button"
        onClick={handleDownload}
        className="flex items-center gap-1 text-primary text-xs hover:underline"
      >
        <FileText className="h-3 w-3" />
        {value.filename || 'Download'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <>
          <div className="flex items-center gap-1 text-sm border rounded px-2 py-1 bg-muted/30 max-w-48">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate text-xs">{value.filename || 'file'}</span>
            {value.size && (
              <span className="text-xs text-muted-foreground ml-1">
                ({(value.size / 1024).toFixed(0)}KB)
              </span>
            )}
          </div>
          {recordId && (
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={handleDownload} title="Download">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => recordId ? deleteMutation.mutate() : onChange?.(null)}
            disabled={isPending}
            title="Remove file"
          >
            {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={isPending}
        >
          {uploadMutation.isPending
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading...</>
            : <><Upload className="h-3 w-3 mr-1" />Choose file</>
          }
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleFileSelect}
      />
    </div>
  );
}
