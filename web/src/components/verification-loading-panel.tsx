'use client';

type VerificationLoadingPanelProps = {
  variant?: 'dark' | 'light';
  title?: string;
  subtitle?: string;
  accentColor?: string;
  className?: string;
};

/**
 * Full-panel loading state for license verification flows.
 */
export function VerificationLoadingPanel({
  variant = 'dark',
  title = 'Checking records',
  subtitle,
  accentColor = '#1A56DB',
  className = '',
}: VerificationLoadingPanelProps) {
  const isDark = variant === 'dark';
  const dotClass = isDark ? 'bg-white/40' : 'bg-slate-400';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <div className="relative mx-auto mb-8 h-[4.5rem] w-[4.5rem]">
        <div
          className={`absolute inset-0 rounded-full border-2 ${
            isDark ? 'border-white/[0.08]' : 'border-slate-200'
          }`}
        />
        <div
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
          style={{
            borderTopColor: accentColor,
            animationDuration: '0.9s',
          }}
        />
        <div
          className="absolute inset-[10px] animate-spin rounded-full border border-transparent opacity-60"
          style={{
            borderBottomColor: accentColor,
            animationDuration: '1.4s',
            animationDirection: 'reverse',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <div
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}66` }}
          />
        </div>
      </div>

      <p
        className={`text-base font-semibold tracking-tight ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}
      >
        {title}
      </p>
      {subtitle ? (
        <p
          className={`mt-2 max-w-sm text-sm leading-relaxed ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          {subtitle}
        </p>
      ) : null}

      <div className="mt-8 flex gap-2" aria-hidden>
        <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${dotClass}`} />
        <span
          className={`h-1.5 w-1.5 animate-pulse rounded-full ${dotClass}`}
          style={{ animationDelay: '200ms' }}
        />
        <span
          className={`h-1.5 w-1.5 animate-pulse rounded-full ${dotClass}`}
          style={{ animationDelay: '400ms' }}
        />
      </div>
    </div>
  );
}
