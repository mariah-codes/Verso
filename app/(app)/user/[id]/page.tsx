"use client"

import { useParams } from "next/navigation"
import { UserProfileView } from "@/components/profile/UserProfileView"

/**
 * Internal, id-based profile route. Kept alongside the canonical /[username]
 * route so existing id links (Friends list rows, shelf "see all") keep working.
 * Both render the shared UserProfileView.
 */
export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  return <UserProfileView targetId={id} />
}
