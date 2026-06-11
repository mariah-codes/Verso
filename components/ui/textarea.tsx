import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The single note-authoring textarea for the app. Styling is lifted from the
 * original inline RankingResult note box (warm muted fill, terracotta focus ring)
 * so every note editor — the public/private review sheets and anywhere notes are
 * edited later — looks identical. Never hand-roll a second textarea style.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-input bg-muted/50 px-3 py-2.5 text-sm",
        "text-foreground placeholder:text-foreground/30 outline-none focus:border-ring resize-none",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
