import { UserPlus } from "lucide-react"
import { Avatar } from "@/components/shared/Avatar"

/** The shape a search row needs — a subset of SearchResult so both the main
 *  Find Friends tab and the onboarding step can pass their results directly. */
export interface FriendSearchRowUser {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
  isFollowing: boolean
}

/**
 * One result row in a friend search: avatar · display name · @username (muted)
 * · Follow/Following pill. The single implementation used by BOTH the main Find
 * Friends tab and the onboarding "Find your friends" step, so the two can't
 * drift (the @handle disambiguation must exist in both places).
 */
export function FriendSearchRow({
  user,
  pending,
  onToggle,
}: {
  user: FriendSearchRowUser
  pending: boolean
  /** Toggle follow state. Callers that never unfollow (e.g. the main tab, where
   *  followed users are filtered out) can treat this as follow-only. */
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar displayName={user.displayName} photoUrl={user.photoUrl} size={40} initialsClassName="text-sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-[1.2]">
          {user.displayName}
        </p>
        {user.username && (
          <p className="text-xs text-foreground/40 truncate mt-px">@{user.username}</p>
        )}
      </div>
      <button
        onClick={onToggle}
        disabled={pending}
        aria-label={user.isFollowing ? `Unfollow ${user.displayName}` : `Follow ${user.displayName}`}
        className={[
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium shrink-0",
          "transition-all active:scale-[0.97] disabled:opacity-50",
          user.isFollowing
            ? "border border-foreground/20 text-foreground/55"
            : "text-white hover:opacity-90",
        ].join(" ")}
        style={user.isFollowing ? undefined : { backgroundColor: "#9C4A2F" }}
      >
        {pending ? (
          <PillSpinner />
        ) : user.isFollowing ? (
          "Following"
        ) : (
          <><UserPlus className="size-3.5" strokeWidth={1.75} />Follow</>
        )}
      </button>
    </div>
  )
}

/**
 * Quiet empty-state hint shown before the user types — the Verso open-book line
 * mark over a one-line nudge. Shared so onboarding and the main tab read the
 * same. Caller controls the copy (the two surfaces word it slightly differently).
 */
export function FriendSearchHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12 flex flex-col items-center text-center gap-3 px-8">
      <OpenBookMark />
      <p className="text-[13px] text-foreground/40 leading-relaxed font-sans">{children}</p>
    </div>
  )
}

/** Verso open-book line mark — the brand glyph, reused as the empty-state mark. */
export function OpenBookMark() {
  return (
    <svg
      width="28"
      viewBox="0 0 40 11"
      fill="none"
      stroke="#1F1B16"
      strokeOpacity={0.3}
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 4 Q13 4 20 8 Q27 4 38 4" />
    </svg>
  )
}

function PillSpinner() {
  return (
    <svg className="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
