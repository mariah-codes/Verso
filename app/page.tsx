export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-background">
      <h1
        className="text-7xl tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Verso
      </h1>
      <p className="mt-4 text-sm text-foreground/50 font-sans tracking-widest uppercase">
        Your reading life, shared
      </p>
    </main>
  );
}
