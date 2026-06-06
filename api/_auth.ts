// @ts-nocheck
// Shared: require a valid Supabase session on an API request, so the paid Claude
// endpoints can't be hit by anyone who isn't signed in. The underscore prefix
// keeps this file from being treated as its own route.
export async function requireAuth(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const ANON = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON) {
    res.status(500).json({ error: "not_configured", message: "Auth isn't configured on the server." });
    return false;
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Please sign in and try again." });
    return false;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      res.status(401).json({ error: "unauthorized", message: "Your session expired — sign in again." });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Couldn't verify your session." });
    return false;
  }
}
