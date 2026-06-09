import Image from "next/image"

interface ProfileIdentityProps {
  displayName: string
  /** Shown as @username directly under the name; omitted if null (e.g. still loading). */
  username: string | null
  photoUrl: string | null
}

/**
 * The shared identity block at the top of every profile — avatar, display name,
 * and @handle. Used by BOTH /me and UserProfileView so the spacing is physically
 * identical and can't drift. The name + @handle are a tight unit (the handle is
 * subordinate to the name); each page renders its own taste line / controls below.
 */
export function ProfileIdentity({ displayName, username, photoUrl }: ProfileIdentityProps) {
  const initials =
    displayName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar */}
      <div className="size-20 rounded-full overflow-hidden bg-muted ring-2 ring-border shrink-0">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={displayName}
            width={80}
            height={80}
            className="object-cover size-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="size-full flex items-center justify-center bg-[#9C4A2F]/10">
            <span className="text-2xl font-medium text-[#9C4A2F]" style={{ fontFamily: "var(--font-serif)" }}>
              {initials}
            </span>
          </div>
        )}
      </div>

      {/* Name + @handle — tight unit (~2px gap) */}
      <div className="flex flex-col items-center gap-0.5">
        <h1
          className="text-2xl text-foreground text-center leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {displayName}
        </h1>
        {username && (
          <p className="text-sm text-foreground/45 font-sans leading-tight">@{username}</p>
        )}
      </div>
    </div>
  )
}
