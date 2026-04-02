import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Sheet } from 'lucide-react';
import { schemaApi } from '../api/schema.api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ImportDialog({ open, onClose, appId, modelSlug, fields, onSuccess }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [step, setStep] = useState('upload'); // upload | sheets | map | done
  const [importSource, setImportSource] = useState('csv'); // csv | sheets
  const [sheetUrl, setSheetUrl] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Fetch field type hints for the mapping step
  const { data: fieldHints = [] } = useQuery({
    queryKey: ['import-hints', appId, modelSlug],
    queryFn: async () => {
      const res = await schemaApi._client().get(`/schema/apps/${appId}/${modelSlug}/records/import-hints`);
      return res.data;
    },
    enabled: open && !!modelSlug,
  });

  // CSV import mutation
  const importMutation = useMutation({
    mutationFn: () => schemaApi.importRecords(appId, modelSlug, file, columnMap),
    onSuccess: (data) => {
      setImportResult(data);
      setStep('done');
      onSuccess?.(data);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Import failed');
    },
  });

  // Google Sheets — Step 1: fetch headers
  const sheetHeadersMutation = useMutation({
    mutationFn: () =>
      schemaApi._client().post(`/schema/apps/${appId}/${modelSlug}/records/import-google-sheet`, {
        sheet_url: sheetUrl,
      }).then(r => r.data),
    onSuccess: (data) => {
      if (data.step === 'map' && data.headers) {
        setCsvHeaders(data.headers);
        // Auto-map headers
        const auto = {};
        data.headers.forEach(h => {
          const match = fields.find(f =>
            f.name.toLowerCase() === h.toLowerCase() ||
            f.label?.toLowerCase() === h.toLowerCase()
          );
          if (match) auto[h] = match.name;
        });
        setColumnMap(auto);
        setStep('map');
      }
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Failed to read Google Sheet');
    },
  });

  // Google Sheets — Step 2: import with column map
  const sheetImportMutation = useMutation({
    mutationFn: () =>
      schemaApi._client().post(`/schema/apps/${appId}/${modelSlug}/records/import-google-sheet`, {
        sheet_url: sheetUrl,
        column_map: columnMap,
      }).then(r => r.data),
    onSuccess: (data) => {
      setImportResult(data);
      setStep('done');
      onSuccess?.(data);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Import failed');
    },
  });

  const isImporting = importMutation.isPending || sheetImportMutation.isPending;
  const activeMutation = importSource === 'sheets' ? sheetImportMutation : importMutation;

  async function handleDownloadTemplate(format = 'csv') {
    try {
      const res = await schemaApi._client().get(
        `/schema/apps/${appId}/${modelSlug}/records/import-template`,
        { params: { format }, responseType: 'blob' },
      );
      const blob = new Blob([res.data]);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${modelSlug}_template.${format}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error('Failed to download template: ' + (err.response?.data?.detail || err.message));
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const firstLine = text.split('\n')[0];
      const headers = [];
      let cur = '', inQ = false;
      for (let i = 0; i < firstLine.length; i++) {
        const ch = firstLine[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { headers.push(cur.trim()); cur = ''; }
        else if (ch !== '\r') { cur += ch; }
      }
      headers.push(cur.trim());
      const cleaned = headers.map(h => h.replace(/^"|"$/g, '').trim());
      setCsvHeaders(cleaned.filter(h => h && h !== '_id'));
      const auto = {};
      cleaned.forEach(h => {
        const match = fields.find(f =>
          f.name.toLowerCase() === h.toLowerCase() ||
          f.label?.toLowerCase() === h.toLowerCase()
        );
        if (match) auto[h] = match.name;
      });
      setColumnMap(auto);
      setStep('map');
    };
    reader.readAsText(f);
  }

  function handleClose() {
    setFile(null);
    setCsvHeaders([]);
    setColumnMap({});
    setStep('upload');
    setImportSource('csv');
    setSheetUrl('');
    setImportResult(null);
    importMutation.reset();
    sheetHeadersMutation.reset();
    sheetImportMutation.reset();
    onClose();
  }

  function handleImport() {
    if (importSource === 'sheets') {
      sheetImportMutation.mutate();
    } else {
      importMutation.mutate();
    }
  }

  const exportableFields = fields.filter(f =>
    !['formula', 'rollup', 'child_table', 'section_break', 'column_break', 'page_break', 'signature', 'geolocation', 'json'].includes(f.type)
  );

  const hintMap = {};
  for (const h of fieldHints) {
    hintMap[h.name] = h;
  }

  const result = importResult || activeMutation.data;

  function downloadErrorReport() {
    if (!result?.errors?.length) return;
    const lines = ['Row,Field,Error'];
    for (const err of result.errors) {
      lines.push(`${err.row || ''},"${(err.field || '').replace(/"/g, '""')}","${(err.message || '').replace(/"/g, '""')}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${modelSlug}_import_errors.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Records</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col gap-4 py-4">
            {/* Source toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setImportSource('csv')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  importSource === 'csv' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                CSV File
              </button>
              <button
                onClick={() => setImportSource('sheets')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  importSource === 'sheets' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sheet className="h-3.5 w-3.5" />
                Google Sheets
              </button>
            </div>

            {importSource === 'csv' && (
              <>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDownloadTemplate('csv')}>
                    <Download className="h-4 w-4 mr-1.5" />
                    CSV Template
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDownloadTemplate('xlsx')}>
                    <Download className="h-4 w-4 mr-1.5" />
                    XLSX Template
                  </Button>
                </div>
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to select a CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">UTF-8 or Latin-1 encoded</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}

            {importSource === 'sheets' && (
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How to use:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open your Google Sheet</li>
                    <li>Click <strong>Share</strong> → <strong>Anyone with the link</strong> → <strong>Viewer</strong></li>
                    <li>Copy the URL and paste it below</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Google Sheets URL</Label>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                  />
                </div>
                {sheetHeadersMutation.isError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {sheetHeadersMutation.error?.response?.data?.detail || 'Failed to read sheet'}
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={() => sheetHeadersMutation.mutate()}
                  disabled={!sheetUrl.includes('docs.google.com/spreadsheets') || sheetHeadersMutation.isPending}
                >
                  {sheetHeadersMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Fetch Sheet Columns
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 max-h-96 overflow-y-auto py-2">
            <p className="text-sm text-muted-foreground">
              Map {importSource === 'sheets' ? 'sheet' : 'CSV'} columns to model fields. Unmapped columns will be skipped.
            </p>
            <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs font-medium text-muted-foreground">
              {importSource === 'sheets' ? (
                <Sheet className="h-4 w-4 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span>
                {importSource === 'sheets' ? 'Google Sheet' : file?.name} — {csvHeaders.length} columns detected
              </span>
            </div>
            <div className="space-y-3">
              {csvHeaders.map(header => {
                const mappedField = columnMap[header];
                const hint = mappedField ? hintMap[mappedField] : null;
                return (
                  <div key={header} className="space-y-1">
                    <div className="grid grid-cols-2 gap-3 items-center">
                      <span className="text-sm font-mono truncate" title={header}>{header}</span>
                      <Select
                        value={columnMap[header] || '__skip__'}
                        onValueChange={val =>
                          setColumnMap(prev => {
                            const next = { ...prev };
                            if (val === '__skip__') delete next[header];
                            else next[header] = val;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Skip" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— Skip —</SelectItem>
                          {exportableFields.map(f => (
                            <SelectItem key={f.name} value={f.name}>
                              {f.label || f.name}
                              {f.is_required && <span className="text-destructive ml-1">*</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {hint && (
                      <p className="text-[10px] text-muted-foreground/70 ml-auto text-right">
                        {hint.hint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {(importMutation.isError || sheetImportMutation.isError) && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {(activeMutation.error?.response?.data?.detail) || 'Import failed'}
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              {result?.failed > 0 ? (
                <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
              )}
              <div>
                <p className="font-semibold">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  {result?.created ?? 0} record{result?.created !== 1 ? 's' : ''} created
                  {result?.failed > 0 && (
                    <span className="text-destructive ml-2">· {result.failed} failed</span>
                  )}
                </p>
              </div>
            </div>
            {result?.errors?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={downloadErrorReport}>
                    <Download className="h-3 w-3 mr-1" />
                    Download Errors
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium w-14">Row</th>
                        <th className="text-left px-3 py-2 font-medium w-24">Field</th>
                        <th className="text-left px-3 py-2 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((err, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{err.row || '-'}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{err.field || '-'}</td>
                          <td className="px-3 py-1.5 text-destructive">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {step === 'map' && (
            <Button
              onClick={handleImport}
              disabled={isImporting || Object.keys(columnMap).length === 0}
            >
              {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {Object.keys(columnMap).length} columns
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
