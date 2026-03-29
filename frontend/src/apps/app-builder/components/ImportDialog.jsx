import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { schemaApi } from '../api/schema.api';
import { useMutation } from '@tanstack/react-query';

export default function ImportDialog({ open, onClose, appId, modelSlug, fields, onSuccess }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [step, setStep] = useState('upload'); // upload | map | done

  const importMutation = useMutation({
    mutationFn: () => schemaApi.importRecords(appId, modelSlug, file, columnMap),
    onSuccess: (data) => {
      setStep('done');
      onSuccess?.(data);
    },
  });

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    // Read first line to get headers
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const firstLine = text.split('\n')[0];
      // RFC-4180 aware header parsing: handle quoted fields containing commas
      const headers = [];
      let cur = '', inQ = false;
      for (let i = 0; i < firstLine.length; i++) {
        const ch = firstLine[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { headers.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      headers.push(cur.trim());
      const cleaned = headers.map(h => h.replace(/^"|"$/g, '').trim());
      setCsvHeaders(cleaned.filter(h => h && h !== '_id'));
      // Auto-initialize mapping by matching field names / labels
      const auto = {};
      headers.forEach(h => {
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
    onClose();
  }

  const exportableFields = fields.filter(f => !['formula'].includes(f.type));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 transition-colors w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
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
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 max-h-96 overflow-y-auto py-2">
            <p className="text-sm text-muted-foreground">
              Map your CSV columns to model fields. Unmapped columns will be skipped.
            </p>
            <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs font-medium text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span>{file?.name} — {csvHeaders.length} columns detected</span>
            </div>
            <div className="space-y-3">
              {csvHeaders.map(header => (
                <div key={header} className="grid grid-cols-2 gap-3 items-center">
                  <span className="text-sm font-mono truncate">{header}</span>
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
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {importMutation.isError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {importMutation.error?.response?.data?.detail || 'Import failed'}
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold">Import Complete</p>
                <p className="text-sm text-muted-foreground">
                  {importMutation.data?.created ?? 0} record{importMutation.data?.created !== 1 ? 's' : ''} created
                  {importMutation.data?.failed > 0 && (
                    <span className="text-destructive ml-2">· {importMutation.data.failed} failed</span>
                  )}
                </p>
              </div>
            </div>
            {importMutation.data?.errors?.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {importMutation.data.errors.length} row{importMutation.data.errors.length !== 1 ? 's' : ''} had errors
                </div>
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium w-16">Row</th>
                        <th className="text-left px-3 py-2 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importMutation.data.errors.map((err, i) => {
                        const rowMatch = String(err).match(/row\s+(\d+)/i);
                        const rowNum = rowMatch ? rowMatch[1] : String(i + 1);
                        const msg = String(err).replace(/^row\s+\d+[:\s]*/i, '');
                        return (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{rowNum}</td>
                            <td className="px-3 py-1.5 text-destructive">{msg}</td>
                          </tr>
                        );
                      })}
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
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || Object.keys(columnMap).length === 0}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import {Object.keys(columnMap).length} columns
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
