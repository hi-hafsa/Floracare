// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_USER_ID = "user_emma";

// 1. GET Current User Profile
app.get("/api/user", async (req, res) => {
  const userId = (req.query.userId as string) || DEFAULT_USER_ID;
  const result = await safeDbQuery("SELECT * FROM users WHERE id = $1", [userId]);
  if (result && result.rows.length > 0) {
    const u = result.rows[0];
    memoryUsers[u.id] = u;
    return res.json(u);
  }
  // Return fallback user — per-id map to avoid Emma overwrite
  if (memoryUsers[userId]) return res.json(memoryUsers[userId]);
  res.json(memoryUser);
});

// 2. Auth: Sign In or Sign Up mock/real DB sync
app.post("/api/auth/login", async (req, res) => {
  const { email, name, mode = "login" } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const result = await safeDbQuery("SELECT * FROM users WHERE email = $1", [email]);
  if (result && result.rows.length > 0) {
    const u = result.rows[0];
    memoryUsers[u.id] = u;
    memoryUser = u;
    return res.json(u);
  }

  // A login must never create an account implicitly.
  if (mode === "login") {
    return res.status(404).json({ error: "No account found for this email. Please sign up first." });
  }

  // Fallback in-memory — keep per-email map so refresh keeps name
  const existingFallback = Object.values(memoryUsers).find((u: any) => u.email === email);
  if (existingFallback) {
    return res.json(existingFallback);
  }

  if (result) {
    const id = "user_" + Date.now();
    const insertResult = await safeDbQuery(
      "INSERT INTO users (id, email, name, avatar, bio, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [
        id,
        email,
        name || email.split("@")[0],
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&auto=format",
        "Plant lover & green thumb explorer",
        "New York, NY",
      ]
    );
    if (insertResult && insertResult.rows.length > 0) {
      const u = insertResult.rows[0];
      memoryUsers[u.id] = u;
      memoryUser = u;
      return res.status(201).json(u);
    }
  }

  const newUser = {
    id: "user_" + Date.now(),
    email,
    name: name || email.split("@")[0],
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&auto=format",
    bio: "Urban gardener and green thumb explorer",
    location: "New York, NY",
  };
  memoryUser = newUser;
  memoryUsers[newUser.id] = newUser;
  res.status(201).json(newUser);
});
