/**
 * Persistent "step x of 4" indicator for the onboarding flow. The active step is
 * a terracotta pill; completed steps are terracotta dots; upcoming are muted.
 */
export function OnboardingDots({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const active = n === step
        const reached = n <= step
        return (
          <span
            key={n}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: active ? 20 : 6,
              backgroundColor: reached
                ? "#9C4A2F"
                : "color-mix(in srgb, var(--foreground) 15%, transparent)",
            }}
          />
        )
      })}
    </div>
  )
}
