export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      books: {
        Row: {
          author: string
          cover_url: string
          created_at: string
          google_books_id: string | null
          id: string
          open_library_id: string | null
          published_year: number | null
          title: string
        }
        Insert: {
          author: string
          cover_url: string
          created_at?: string
          google_books_id?: string | null
          id?: string
          open_library_id?: string | null
          published_year?: number | null
          title: string
        }
        Update: {
          author?: string
          cover_url?: string
          created_at?: string
          google_books_id?: string | null
          id?: string
          open_library_id?: string | null
          published_year?: number | null
          title?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          created_at: string
          event_subject_book_id: string
          event_subject_user_id: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_subject_book_id: string
          event_subject_user_id: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_subject_book_id?: string
          event_subject_user_id?: string
          event_type?: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_event_subject_book_id_fkey"
            columns: ["event_subject_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_event_subject_user_id_fkey"
            columns: ["event_subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comparisons: {
        Row: {
          book_a_id: string
          book_b_id: string
          created_at: string
          id: string
          tier: Database["public"]["Enums"]["book_tier"]
          user_id: string
          winner_id: string
        }
        Insert: {
          book_a_id: string
          book_b_id: string
          created_at?: string
          id?: string
          tier: Database["public"]["Enums"]["book_tier"]
          user_id: string
          winner_id: string
        }
        Update: {
          book_a_id?: string
          book_b_id?: string
          created_at?: string
          id?: string
          tier?: Database["public"]["Enums"]["book_tier"]
          user_id?: string
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparisons_book_a_id_fkey"
            columns: ["book_a_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_book_b_id_fkey"
            columns: ["book_b_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          event_subject_book_id: string
          event_subject_user_id: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id: string
          reaction_type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          event_subject_book_id: string
          event_subject_user_id: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          reaction_type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          event_subject_book_id?: string
          event_subject_user_id?: string
          event_type?: Database["public"]["Enums"]["feed_event_type"]
          id?: string
          reaction_type?: Database["public"]["Enums"]["reaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_event_subject_book_id_fkey"
            columns: ["event_subject_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_event_subject_user_id_fkey"
            columns: ["event_subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_books: {
        Row: {
          added_at: string
          book_id: string
          finished_at: string | null
          genre: string | null
          id: string
          note: string | null
          rank_position: number | null
          score: number | null
          status: Database["public"]["Enums"]["book_status"]
          tier: Database["public"]["Enums"]["book_tier"] | null
          user_id: string
          visibility: Database["public"]["Enums"]["book_visibility"]
          was_started: boolean
        }
        Insert: {
          added_at?: string
          book_id: string
          finished_at?: string | null
          genre?: string | null
          id?: string
          note?: string | null
          rank_position?: number | null
          score?: number | null
          status: Database["public"]["Enums"]["book_status"]
          tier?: Database["public"]["Enums"]["book_tier"] | null
          user_id: string
          visibility?: Database["public"]["Enums"]["book_visibility"]
          was_started?: boolean
        }
        Update: {
          added_at?: string
          book_id?: string
          finished_at?: string | null
          genre?: string | null
          id?: string
          note?: string | null
          rank_position?: number | null
          score?: number | null
          status?: Database["public"]["Enums"]["book_status"]
          tier?: Database["public"]["Enums"]["book_tier"] | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["book_visibility"]
          was_started?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          id: string
          photo_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          photo_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
        }
        Relationships: []
      }
      weekly_picks: {
        Row: {
          book_ids: string[]
          created_at: string
          id: string
          reasons: Json
          user_id: string
          week_of: string
        }
        Insert: {
          book_ids: string[]
          created_at?: string
          id?: string
          reasons?: Json
          user_id: string
          week_of: string
        }
        Update: {
          book_ids?: string[]
          created_at?: string
          id?: string
          reasons?: Json
          user_id?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      shift_rank_positions: {
        Args: { p_from_position: number; p_tier: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      book_status: "want_to_read" | "reading" | "finished" | "dnf"
      book_tier: "loved" | "liked" | "fine"
      book_visibility: "visible" | "private"
      feed_event_type: "ranked" | "want_to_read" | "top_10_change"
      reaction_type: "flame" | "smile"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      book_status: ["want_to_read", "reading", "finished", "dnf"],
      book_tier: ["loved", "liked", "fine"],
      book_visibility: ["visible", "private"],
      feed_event_type: ["ranked", "want_to_read", "top_10_change"],
      reaction_type: ["flame", "smile"],
    },
  },
} as const
