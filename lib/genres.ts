export const GENRES = {
  fiction: [
    "General fiction", "Classics", "Historical fiction",
    "Sci-fi & fantasy", "Mystery & thriller", "Romance",
    "Short stories & essays", "Poetry & drama",
  ],
  nonfiction: [
    "Memoir & biography", "Narrative non-fiction", "History & politics",
    "Society & culture", "Science & ideas", "Psychology & self-improvement",
    "Business & strategy", "Art, fashion & design", "Travel & place", "Other",
  ],
} as const;

export const COMMON_GENRES = [
  "General fiction", "Classics", "Historical fiction",
  "Narrative non-fiction", "Memoir & biography",
  "Science & ideas", "Psychology & self-improvement",
];

// Flat list of every allowed genre across both groups.
const ALL_GENRES: readonly string[] = [...GENRES.fiction, ...GENRES.nonfiction];

/** True if `value` is one of the allowed genres (either group). */
export function isValidGenre(value: string): boolean {
  return ALL_GENRES.includes(value);
}
