"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { GENRES, COMMON_GENRES } from "@/lib/genres"

interface GenrePickerProps {
  /** The book's current genre for this user, highlighted if present. */
  selected?: string | null
  /** Called with the chosen genre. The parent is responsible for closing. */
  onSelect: (genre: string) => void
  /** Optional cancel affordance (e.g. when editing an existing tag). */
  onCancel?: () => void
}

/**
 * Single-select genre picker. Opens common-first: a short row of the most-used
 * genres plus a "More" affordance that expands to the full list grouped under
 * Fiction / Non-fiction. No pre-filled suggestion in V1 — nothing is selected
 * unless the book already has a genre for this user, in which case it's
 * highlighted (and the full list auto-expands if that genre isn't a common one).
 */
export function GenrePicker({ selected = null, onSelect, onCancel }: GenrePickerProps) {
  // Start expanded when the current selection lives outside the common set, so
  // it's visible and highlighted right away.
  const selectedIsCommon = !selected || COMMON_GENRES.includes(selected)
  const [expanded, setExpanded] = useState(!selectedIsCommon)

  return (
    <div className="w-full max-w-xs">
      {!expanded ? (
        <div className="flex flex-wrap gap-2">
          {COMMON_GENRES.map((g) => (
            <Chip key={g} label={g} active={g === selected} onClick={() => onSelect(g)} />
          ))}
          <button
            onClick={() => setExpanded(true)}
            className="rounded-full border border-dashed px-[13px] py-[7px] text-xs leading-none font-medium transition-colors border-[#B7AE9F] text-[#8A8175] hover:border-[#9C9282]"
            style={{ backgroundColor: "transparent" }}
          >
            More…
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Group title="Fiction" genres={GENRES.fiction} selected={selected} onSelect={onSelect} />
          <Group title="Non-fiction" genres={GENRES.nonfiction} selected={selected} onSelect={onSelect} />
        </div>
      )}

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-3 text-xs text-foreground/40 underline underline-offset-2 hover:text-foreground/60 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Group({
  title,
  genres,
  selected,
  onSelect,
}: {
  title: string
  genres: readonly string[]
  selected: string | null
  onSelect: (genre: string) => void
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-widest uppercase font-sans mb-2" style={{ color: "#B7AE9F" }}>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {genres.map((g) => (
          <Chip key={g} label={g} active={g === selected} onClick={() => onSelect(g)} />
        ))}
      </div>
    </div>
  )
}

/**
 * Shared chip appearance — identical padding/radius/font in every state and
 * across the picker and the book-detail read state, so nothing resizes on
 * select and pills wrap consistently. 1px transparent border in BOTH states.
 *   Default:  #EEE6DA bg · transparent border · #2A241D text
 *   Selected: #9C4A2F bg · transparent border · #FBF3EC text
 */
function chipClass(active: boolean, interactive: boolean): string {
  return cn(
    "rounded-full border border-transparent px-[13px] py-[7px] text-xs leading-none font-medium transition-colors",
    active
      ? "bg-[#9C4A2F] text-[#FBF3EC]"
      : "bg-[#EEE6DA] text-[#2A241D]",
    interactive && "active:scale-[0.97]",
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} aria-pressed={active} className={chipClass(active, true)}>
      {label}
    </button>
  )
}
