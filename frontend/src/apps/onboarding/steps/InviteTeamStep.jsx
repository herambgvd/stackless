import { useState } from "react";
import { UserPlus, X, Mail } from "lucide-react";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function InviteTeamStep({ inviteEmails, onChange, onSkip }) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (!isValidEmail(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (inviteEmails.includes(trimmed)) {
      setError("This email has already been added.");
      return;
    }
    if (inviteEmails.length >= 3) {
      setError("You can invite up to 3 teammates at once.");
      return;
    }

    onChange([...inviteEmails, trimmed]);
    setInputValue("");
    setError("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(email) {
    onChange(inviteEmails.filter((e) => e !== email));
  }

  return (
    <div className="px-4 py-2 animate-fade-in-up">
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
          Invite your teammates
        </h2>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          They&apos;ll get an email to join your workspace. You can always do
          this later.
        </p>
      </div>

      {/* Email input row */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="colleague@company.com"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400 transition-shadow duration-150"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={inviteEmails.length >= 3}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors duration-150 shrink-0"
        >
          <span>+ Add</span>
        </button>
      </div>

      {/* Validation error */}
      {error && (
        <p className="text-red-500 text-xs mb-3 ml-1">{error}</p>
      )}

      {/* Added email chips */}
      {inviteEmails.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 mb-2">
          {inviteEmails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium rounded-full pl-3 pr-2 py-1"
            >
              {email}
              <button
                onClick={() => handleRemove(email)}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200 transition-colors duration-100"
                aria-label={`Remove ${email}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Capacity hint */}
      {inviteEmails.length > 0 && (
        <p className="text-xs text-slate-400 mt-1 ml-1">
          {inviteEmails.length}/3 invites added
        </p>
      )}

      {/* Skip link */}
      <div className="mt-6 text-center">
        <button
          onClick={onSkip}
          className="text-sm text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors duration-150 font-medium"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
