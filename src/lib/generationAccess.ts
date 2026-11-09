// Each generation pays for a video, so with no list set nobody can start one.
export function canGenerate(email: string) {
  const allowed = (process.env.GENERATION_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
