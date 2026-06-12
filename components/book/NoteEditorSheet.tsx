"use client"

import { useEffect, useRef, useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Textarea } from "@/components/ui/textarea"

export type NoteKind = "public" | "private"

interface NoteEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which note is being edited — drives copy and which column saves. */
  kind: NoteKind
  /** Current saved text (seeds the field each time the sheet opens). */
  initialValue: string
  /** Receives the raw textarea value; empty/whitespace clears the note. */
  onSave: (text: string) => void
  /** A save is in flight. */
  saving: boolean
}

const COPY: Record<NoteKind, { title: string; subtitle: string; placeholder: string }> = {
  public: {
    title: "Review",
    subtitle: "Visible to friends",
    placeholder: "Add a few words for friends…",
  },
  private: {
    title: "Private thoughts",
    subtitle: "Only you",
    placeholder: "Just for you…",
  },
}

/**
 * Bottom sheet for authoring a public review or private note — the neutral Drawer
 * (vaul) slides up to present and down to dismiss. The form stays mounted while
 * the drawer is open (including the slide-down), so the dismiss animates with its
 * content rather than an empty panel. Saving empty text clears the note.
 */
export function NoteEditorSheet({
  open,
  onOpenChange,
  kind,
  initialValue,
  onSave,
  saving,
}: NoteEditorSheetProps) {
  const copy = COPY[kind]
  // Private thoughts always "Save". A public review reads "Update" when one
  // already exists, else "Post".
  const saveLabel =
    kind === "private" ? "Save" : initialValue.trim() ? "Update" : "Post"

  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initialValue)

  // Re-seed the field each time the sheet opens — "adjust state during render"
  // (not an effect) so the form can stay mounted for the slide-down dismiss.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setText(initialValue)
  }

  // Autofocus once the slide-up has settled; only while open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => ref.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [open])

  // Light terracotta until there's a real change to submit, then dark — the feed
  // composer's affordance, generalized. (An empty value over an existing note is
  // a valid change: it deletes the note.)
  const changed = text.trim() !== initialValue.trim()

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <DrawerHeader className="text-left px-5 pt-5 pb-0 gap-0.5">
          {/* Inline sans — DrawerTitle's font-heading maps to the serif and would
              otherwise win on specificity (same fix as StopReadingSheet). */}
          <DrawerTitle
            className="text-left text-base font-medium text-foreground"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {copy.title}
          </DrawerTitle>
          <DrawerDescription className="text-left text-foreground/50">
            {copy.subtitle}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-5 pt-3.5">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={copy.placeholder}
            rows={5}
            maxLength={2000}
            disabled={saving}
          />
        </div>

        <div className="px-5 pt-3.5 pb-1 flex items-center gap-2">
          <button
            onClick={() => onSave(text)}
            disabled={saving || !changed}
            className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#9C4A2F" }}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-5 rounded-xl py-2.5 text-sm text-foreground/45 hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
