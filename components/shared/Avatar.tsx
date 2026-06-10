import Image from "next/image"
import { cn } from "@/lib/utils"

interface AvatarProps {
  displayName: string
  photoUrl: string | null
  /** Diameter in px. */
  size: number
  /** Initials font-size class — scale it to `size` (e.g. text-2xl @ 80, text-xs @ 38). */
  initialsClassName?: string
  className?: string
}

/**
 * The single avatar implementation for the whole app — photo if present, else an
 * initials circle (terracotta on a faint terracotta wash). Extracted from
 * ProfileIdentity so profile headers and the feed render visually identical
 * avatars. Size-parameterised; never hand-roll a second avatar style.
 */
export function Avatar({
  displayName,
  photoUrl,
  size,
  initialsClassName = "text-2xl",
  className,
}: AvatarProps) {
  const initials =
    displayName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"

  return (
    <div
      className={cn("rounded-full overflow-hidden bg-muted ring-2 ring-border shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={displayName}
          width={size}
          height={size}
          className="object-cover size-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="size-full flex items-center justify-center bg-[#9C4A2F]/10">
          <span
            className={cn("font-medium text-[#9C4A2F]", initialsClassName)}
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {initials}
          </span>
        </div>
      )}
    </div>
  )
}
