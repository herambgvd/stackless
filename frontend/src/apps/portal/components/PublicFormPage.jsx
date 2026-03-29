import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { CheckCircle2, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { Input as UiInput } from '@/shared/components/ui/input';

function ReCaptchaWidget({ siteKey, onVerified }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!siteKey) return;

    function renderWidget() {
      if (containerRef.current && widgetIdRef.current === null && window.grecaptcha) {
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerified(token),
          'expired-callback': () => onVerified(null),
        });
      }
    }

    if (window.grecaptcha && window.grecaptcha.render) {
      renderWidget();
    } else {
      // Load script if not already present
      if (!document.querySelector('script[src*="recaptcha"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      window.onRecaptchaLoad = renderWidget;
      // Poll until grecaptcha is ready (script sets window.onRecaptchaLoad or we poll)
      const interval = setInterval(() => {
        if (window.grecaptcha && window.grecaptcha.render) {
          clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [siteKey, onVerified]);

  return <div ref={containerRef} className="mt-2" />;
}

// Public API (no auth header needed — apiClient sends it only if token exists)
const publicApi = {
  getForm: async (tenantId, slug) => {
    const res = await apiClient.get(`/schema/public/forms/${tenantId}/${slug}`);
    return res.data;
  },
  submitForm: async (tenantId, slug, data, captchaToken) => {
    const body = { data };
    if (captchaToken) body.captcha_token = captchaToken;
    const res = await apiClient.post(`/schema/public/forms/${tenantId}/${slug}/submit`, body);
    return res.data;
  },
  uploadFile: async (tenantId, formSlug, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post(
      `/schema/public/forms/${tenantId}/${formSlug}/upload-file`,
      fd,
    );
    return res.data;
  },
};

function FileInputField({ field, onChange, tenantId, formSlug }) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const meta = await publicApi.uploadFile(tenantId, formSlug, file);
      setFileName(meta.filename);
      onChange(field.name, meta);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <UiInput
        type="file"
        accept={field.config?.allowed_types}
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
        </p>
      )}
      {fileName && !uploading && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {fileName}
        </p>
      )}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}

function FieldInput({ field, value, onChange, tenantId, formSlug }) {
  const { name, label, type, config, is_required } = field;

  const commonProps = {
    id: name,
    required: is_required,
    value: value ?? '',
    onChange: (e) => onChange(name, e.target.value),
  };

  if (type === 'file') {
    return <FileInputField field={field} onChange={onChange} tenantId={tenantId} formSlug={formSlug} />;
  }
  if (type === 'attach_image') {
    return <FileInputField field={{ ...field, config: { ...config, allowed_types: 'image/*' } }} onChange={onChange} tenantId={tenantId} formSlug={formSlug} />;
  }
  if (type === 'select') {
    const options = config?.options || [];
    return (
      <Select value={value || ''} onValueChange={v => onChange(name, v)}>
        <SelectTrigger><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (type === 'multiselect') {
    const options = config?.options || [];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5 rounded-md border border-input p-3">
        {options.length === 0
          ? <p className="text-xs text-muted-foreground">No options configured.</p>
          : options.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.includes(opt)}
                onChange={e => onChange(name, e.target.checked ? [...selected, opt] : selected.filter(v => v !== opt))}
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))
        }
      </div>
    );
  }
  if (type === 'textarea' || type === 'rich_text') {
    return <Textarea {...commonProps} className="min-h-[100px]" />;
  }
  if (type === 'number' || type === 'currency') {
    return <Input {...commonProps} type="number" step="any" />;
  }
  if (type === 'date') {
    return <Input {...commonProps} type="date" />;
  }
  if (type === 'datetime') {
    return <Input {...commonProps} type="datetime-local" />;
  }
  if (type === 'time') {
    return <Input {...commonProps} type="time" />;
  }
  if (type === 'duration') {
    return <Input {...commonProps} placeholder="HH:MM:SS" />;
  }
  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!value} onChange={e => onChange(name, e.target.checked)} className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </label>
    );
  }
  if (type === 'email') {
    return <Input {...commonProps} type="email" />;
  }
  if (type === 'url') {
    return <Input {...commonProps} type="url" />;
  }
  if (type === 'phone') {
    return <Input {...commonProps} type="tel" />;
  }
  if (type === 'color') {
    const colorVal = value || '#000000';
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={colorVal} onChange={e => onChange(name, e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-input p-1" />
        <UiInput value={colorVal} onChange={e => onChange(name, e.target.value)} placeholder="#000000" className="flex-1 font-mono text-sm" />
      </div>
    );
  }
  if (type === 'rating') {
    const max = config?.max_stars ?? 5;
    const current = Number(value) || 0;
    return (
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <button key={i} type="button"
            onClick={() => onChange(name, i + 1 === current ? 0 : i + 1)}
            className={`text-xl ${i < current ? 'text-yellow-400' : 'text-muted-foreground/30'}`}
          >★</button>
        ))}
      </div>
    );
  }
  if (type === 'geolocation') {
    const geo = (() => {
      try { return (value && typeof value === 'object') ? value : (value ? JSON.parse(value) : { lat: '', lng: '' }); }
      catch { return { lat: '', lng: '' }; }
    })();
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-0.5">
          <p className="text-xs text-muted-foreground">Latitude</p>
          <UiInput type="number" step="any" min={-90} max={90} placeholder="37.7749"
            value={geo.lat ?? ''}
            onChange={e => onChange(name, { ...geo, lat: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </div>
        <div className="flex-1 space-y-0.5">
          <p className="text-xs text-muted-foreground">Longitude</p>
          <UiInput type="number" step="any" min={-180} max={180} placeholder="-122.4194"
            value={geo.lng ?? ''}
            onChange={e => onChange(name, { ...geo, lng: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </div>
      </div>
    );
  }
  if (type === 'signature') {
    return <PublicSignatureField name={name} value={value} onChange={onChange} />;
  }
  if (type === 'barcode') {
    return <Input {...commonProps} placeholder="Scan or enter barcode…" />;
  }
  if (type === 'html') {
    return config?.html_content
      ? <div className="prose prose-sm text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.html_content) }} />
      : null;
  }
  if (type === 'json') {
    return <Textarea {...commonProps} className="min-h-[80px] font-mono text-sm" placeholder='{"key": "value"}' />;
  }
  if (type === 'section_break') {
    return (
      <div className="border-t border-border pt-2">
        {label && <p className="text-sm font-semibold">{label}</p>}
      </div>
    );
  }
  if (type === 'column_break' || type === 'page_break') {
    return null;
  }
  return <Input {...commonProps} />;
}

function PublicSignatureField({ name, value, onChange }) {
  const canvasRef = useRef(null);
  const [signed, setSigned] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return { x: (touch ? touch.clientX : e.clientX) - rect.left, y: (touch ? touch.clientY : e.clientY) - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && pos) { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !pos) return;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setSigned(true);
  };

  const endDraw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    if (canvasRef.current) onChange(name, canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    onChange(name, '');
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded border border-input bg-white overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} width={400} height={120} className="w-full cursor-crosshair"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {!signed && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/50">Sign here</p>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{signed ? '✓ Signature captured' : 'Draw your signature above'}</span>
        {signed && <button type="button" onClick={clear} className="text-xs text-destructive hover:underline">Clear</button>}
      </div>
    </div>
  );
}

export default function PublicFormPage({ tenantId, formSlug }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['public-form', tenantId, formSlug],
    queryFn: () => publicApi.getForm(tenantId, formSlug),
  });

  const submitMutation = useMutation({
    mutationFn: () => publicApi.submitForm(tenantId, formSlug, formData, captchaToken),
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold">Form not found</p>
          <p className="text-sm text-muted-foreground mt-1">This form may not be published or the link may be incorrect.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <div className="text-center max-w-sm mx-auto px-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Submitted!</h2>
          <p className="text-muted-foreground">{form.success_message}</p>
          <a
            href={`/portal/${tenantId}/my-submissions`}
            className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            View my submissions →
          </a>
        </div>
      </div>
    );
  }

  const steps = form.steps || [];
  const totalSteps = steps.length;
  const step = steps[currentStep];
  const isLast = currentStep === totalSteps - 1;
  const isFirst = currentStep === 0;

  function handleChange(name, value) {
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function handleNext(e) {
    e.preventDefault();
    if (isLast) {
      submitMutation.mutate();
    } else {
      setCurrentStep(s => s + 1);
    }
  }

  const brandStyle = {
    ...(form.background_color ? { backgroundColor: form.background_color } : {}),
    ...(form.font_family ? { fontFamily: form.font_family } : {}),
    ...(form.primary_color ? { "--brand-primary": form.primary_color } : {}),
  };
  const primaryStyle = form.primary_color ? { backgroundColor: form.primary_color, borderColor: form.primary_color } : {};

  return (
    <div className="min-h-screen py-12 px-4" style={brandStyle}>
      {form.custom_css && (
        <style>{form.custom_css.replace(/<\/style/gi, '').replace(/javascript:/gi, '').replace(/@import/gi, '').replace(/expression\s*\(/gi, '')}</style>
      )}
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="h-12 object-contain mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold">{form.title}</h1>
          {form.description && <p className="text-muted-foreground mt-2">{form.description}</p>}
        </div>

        {/* Progress indicator */}
        {totalSteps > 1 && (
          <div className="flex items-center gap-2 mb-8">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-2 flex-1 rounded-full transition-colors ${i <= currentStep ? 'bg-primary' : 'bg-muted'}`}
                  style={i <= currentStep ? primaryStyle : {}}
                />
              </div>
            ))}
          </div>
        )}

        {/* Form card */}
        <div className="bg-background rounded-xl border shadow-sm p-6">
          {totalSteps > 1 && (
            <div className="mb-6">
              <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {totalSteps}</p>
              <h2 className="text-base font-semibold mt-0.5">{step?.title}</h2>
              {step?.description && <p className="text-sm text-muted-foreground mt-1">{step.description}</p>}
            </div>
          )}

          <form onSubmit={handleNext} className="space-y-5">
            {step?.fields?.map(field => (
              <div key={field.name}>
                {field.type !== 'boolean' && (
                  <Label htmlFor={field.name} className="mb-1.5 block">
                    {field.label}
                    {field.is_required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                )}
                <FieldInput
                  field={field}
                  value={formData[field.name]}
                  onChange={handleChange}
                  tenantId={tenantId}
                  formSlug={formSlug}
                />
              </div>
            ))}

            {isLast && form.require_captcha && form.site_key && (
              <ReCaptchaWidget siteKey={form.site_key} onVerified={setCaptchaToken} />
            )}

            {submitMutation.isError && (
              <p className="text-sm text-destructive">
                Submission failed. Please try again.
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              {!isFirst && (
                <Button type="button" variant="outline" onClick={() => setCurrentStep(s => s - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />Back
                </Button>
              )}
              <Button
                type="submit"
                className="ml-auto"
                disabled={
                  submitMutation.isPending ||
                  (isLast && form.require_captcha && form.site_key && !captchaToken)
                }
              >
                {submitMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : isLast ? null : <ArrowRight className="h-4 w-4 ml-1 order-last" />
                }
                {isLast ? form.submit_button_text : 'Next'}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by FlowForge
        </p>
      </div>
    </div>
  );
}
