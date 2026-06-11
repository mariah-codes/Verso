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
 * Bottom sheet for authoring a public review or private note. Reuses the neutral
 * Drawer pattern from StopReadingSheet — title + subtitle matching the zone, a
 * single autofocused textarea, Save / Cancel. Saving empty text clears the note
 * (this is how a review is deleted), handled by the parent's onSave.
 *
 * The form mounts only while open, so each open captures a fresh `initialValue`
 * as its starting state — no effect-driven re-seeding needed.
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
  // already exists (initialValue is the current saved text) else "Post".
  const saveLabel =
    kind === "private" ? "Save" : initialValue.trim() ? "Update" : "Post"

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <DrawerHeader className="text-left px-5 pt-6 pb-0 gap-1">
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

        {open && (
          <EditorForm
            initialValue={initialValue}
            placeholder={copy.placeholder}
            saveLabel={saveLabel}
            saving={saving}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

// ── Form body ─────────────────────────────────────────────────────────────────

/** Mounted fresh on each open, so `initialValue` seeds the state directly and the
 *  textarea autofocuses once the drawer's slide-up settles. */
function EditorForm({
  initialValue,
  placeholder,
  saveLabel,
  saving,
  onSave,
  onCancel,
}: {
  initialValue: string
  placeholder: string
  saveLabel: string
  saving: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialValue)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <div className="px-5 pt-4">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={5}
          maxLength={2000}
          disabled={saving}
        />
      </div>

      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <button
          onClick={() => onSave(text)}
          disabled={saving}
          className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: "#9C4A2F" }}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-5 rounded-xl py-2.5 text-sm text-foreground/45 hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
