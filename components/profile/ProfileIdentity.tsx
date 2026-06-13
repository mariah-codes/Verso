import { Avatar } from "@/components/shared/Avatar"

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
  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar displayName={displayName} photoUrl={photoUrl} size={80} initialsClassName="text-2xl" />

      {/* Name + @handle — tight unit (~2px gap) */}
      <div className="flex flex-col items-center gap-0.5">
        <h1
          className="text-2xl text-foreground text-center leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {displayName}
        </h1>
        {username && (
          <p className="text-sm text-foreground/40 font-sans leading-tight">@{username}</p>
        )}
      </div>
    </div>
  )
}
