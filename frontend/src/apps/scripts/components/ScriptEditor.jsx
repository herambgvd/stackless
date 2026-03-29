export function ScriptEditor({ value, onChange, language = "python", placeholder }) {
  return (
    <div className="relative border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-mono font-medium text-slate-500 uppercase tracking-wider">
          {language}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[280px] p-4 font-mono text-sm text-green-400 bg-slate-950 resize-y outline-none leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
