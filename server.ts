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

app.get("/api/plants", async (req, res) => {
  const userId = (req.query.userId as string) || DEFAULT_USER_ID;
  const result = await safeDbQuery(
    "SELECT * FROM plants WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  if (result && result.rows.length > 0) {
    const now = Date.now();
    const plants = result.rows.map((row) => {
      const lastWateredDate = new Date(row.last_watered).getTime();
      const daysSince = Math.floor((now - lastWateredDate) / (1000 * 60 * 60 * 24));
      const freq = row.watering_frequency || 7;

      let computedStatus = "healthy";
      if (daysSince >= freq + 2) computedStatus = "overdue";
      else if (daysSince >= freq - 1) computedStatus = "due-soon";

      return {
        id: row.id,
        userId: row.user_id,
        nickname: row.nickname,
        species: row.species,
        scientificName: row.scientific_name || row.species,
        status: computedStatus,
        image: row.image,
        wateringFrequency: row.watering_frequency,
        lastWatered: row.last_watered,
        notes: row.notes || "",
        sunlight: row.sunlight,
        soil: row.soil,
        temperature: row.temperature,
        humidity: row.humidity,
        fertilizer: row.fertilizer,
        createdAt: row.created_at,
      };
    });
    return res.json(plants);
  }

  // Fallback in-memory plants — filter by userId so new users don't see Emma's plants
  const filtered = memoryPlants.filter((p) => p.userId === userId);
  // If user has no plants yet but is Emma, show fallback Emma plants; else show only theirs (or empty)
  if (filtered.length > 0) return res.json(filtered);
  if (userId === FALLBACK_USER.id || userId === DEFAULT_USER_ID) return res.json(memoryPlants.filter((p) => p.userId === FALLBACK_USER.id));
  return res.json(filtered);
});

// 4. POST Create Plant
app.post("/api/plants", async (req, res) => {
  const {
    nickname,
    species,
    scientificName,
    wateringFrequency,
    image,
    notes,
    sunlight,
    soil,
    temperature,
    humidity,
    fertilizer,
    userId = DEFAULT_USER_ID,
  } = req.body;

  const id = "plant_" + Date.now();
  const defaultImage =
    image ||
    "https://images.unsplash.com/photo-1545241047-6083a3684587?w=800&h=800&fit=crop&auto=format";

  const result = await safeDbQuery(
    `INSERT INTO plants (
      id, user_id, nickname, species, scientific_name, status, image,
      watering_frequency, last_watered, notes, sunlight, soil,
      temperature, humidity, fertilizer
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      id,
      userId,
      nickname || species,
      species,
      scientificName || species,
      "healthy",
      defaultImage,
      Number(wateringFrequency) || 7,
      notes || "",
      sunlight || "Bright indirect light",
      soil || "Well-draining potting mix",
      temperature || "65–85°F (18–29°C)",
      humidity || "Moderate (50%+)",
      fertilizer || "Monthly in spring & summer",
    ]
  );

  const newPlant = {
    id,
    userId,
    nickname: nickname || species,
    species,
    scientificName: scientificName || species,
    status: "healthy" as const,
    image: defaultImage,
    wateringFrequency: Number(wateringFrequency) || 7,
    lastWatered: new Date().toISOString(),
    notes: notes || "",
    sunlight: sunlight || "Bright indirect light",
    soil: soil || "Well-draining potting mix",
    temperature: temperature || "65–85°F (18–29°C)",
    humidity: humidity || "Moderate (50%+)",
    fertilizer: fertilizer || "Monthly in spring & summer",
    createdAt: new Date().toISOString(),
  };

  memoryPlants.unshift(newPlant);
  res.status(201).json(result ? result.rows[0] : newPlant);
});

// 5. GET Single Plant with Care Logs & Diagnoses
app.get("/api/plants/:id", async (req, res) => {
  const { id } = req.params;
  const plantRes = await safeDbQuery("SELECT * FROM plants WHERE id = $1", [id]);

  if (plantRes && plantRes.rows.length > 0) {
    const row = plantRes.rows[0];
    const logsRes = await safeDbQuery(
      "SELECT * FROM care_logs WHERE plant_id = $1 ORDER BY logged_at DESC",
      [id]
    );
    const diagnosesRes = await safeDbQuery(
      "SELECT * FROM diagnoses WHERE plant_id = $1 ORDER BY date DESC",
      [id]
    );

    const now = Date.now();
    const lastWateredDate = new Date(row.last_watered).getTime();
    const daysSince = Math.floor((now - lastWateredDate) / (1000 * 60 * 60 * 24));
    const freq = row.watering_frequency || 7;
    let computedStatus = "healthy";
    if (daysSince >= freq + 2) computedStatus = "overdue";
    else if (daysSince >= freq - 1) computedStatus = "due-soon";

    return res.json({
      id: row.id,
      userId: row.user_id,
      nickname: row.nickname,
      species: row.species,
      scientificName: row.scientific_name || row.species,
      status: computedStatus,
      image: row.image,
      wateringFrequency: row.watering_frequency,
      lastWatered: row.last_watered,
      notes: row.notes || "",
      sunlight: row.sunlight,
      soil: row.soil,
      temperature: row.temperature,
      humidity: row.humidity,
      fertilizer: row.fertilizer,
      createdAt: row.created_at,
      careLogs: logsRes ? logsRes.rows : [],
      diagnoses: diagnosesRes ? diagnosesRes.rows : [],
    });
  }

  // Memory fallback
  const found = memoryPlants.find((p) => p.id === id) || memoryPlants[0];
  const logs = memoryCareLogs.filter((l) => l.plantId === id);
  const diags = memoryDiagnoses.filter((d) => d.plantId === id);

  res.json({
    ...found,
    careLogs: logs.length > 0 ? logs : [
      { id: "cl_1", plantId: id, type: "water", notes: "Regular watering", loggedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: "cl_2", plantId: id, type: "water", notes: "Deep soak with filtered water", loggedAt: new Date(Date.now() - 9 * 86400000).toISOString() },
    ],
    diagnoses: diags,
  });
});

// 6. POST Log Care / Water a Plant
app.post("/api/plants/:id/care", async (req, res) => {
  const { id } = req.params;
  const { type = "water", notes = "Watered plant" } = req.body;
  const logId = "log_" + Date.now();

  await safeDbQuery(
    "INSERT INTO care_logs (id, plant_id, type, notes, logged_at) VALUES ($1, $2, $3, $4, NOW())",
    [logId, id, type, notes]
  );

  if (type === "water") {
    await safeDbQuery(
      "UPDATE plants SET last_watered = NOW(), status = 'healthy' WHERE id = $1",
      [id]
    );
  }

  // In-memory update
  const pIndex = memoryPlants.findIndex((p) => p.id === id);
  if (pIndex !== -1 && type === "water") {
    memoryPlants[pIndex].lastWatered = new Date().toISOString();
    memoryPlants[pIndex].status = "healthy";
  }
  memoryCareLogs.unshift({
    id: logId,
    plantId: id,
    type,
    notes,
    loggedAt: new Date().toISOString(),
  });

  res.json({ success: true, logId, loggedAt: new Date().toISOString() });
});

// 7. PUT Update Plant
app.put("/api/plants/:id", async (req, res) => {
  const { id } = req.params;
  const { nickname, notes, wateringFrequency } = req.body;

  await safeDbQuery(
    "UPDATE plants SET nickname = COALESCE($1, nickname), notes = COALESCE($2, notes), watering_frequency = COALESCE($3, watering_frequency) WHERE id = $4",
    [nickname, notes, wateringFrequency ? Number(wateringFrequency) : null, id]
  );

  const p = memoryPlants.find((pl) => pl.id === id);
  if (p) {
    if (nickname) p.nickname = nickname;
    if (notes !== undefined) p.notes = notes;
    if (wateringFrequency) p.wateringFrequency = Number(wateringFrequency);
  }

  res.json({ success: true });
});

// 8. DELETE Plant
app.delete("/api/plants/:id", async (req, res) => {
  const { id } = req.params;
  await safeDbQuery("DELETE FROM plants WHERE id = $1", [id]);
  memoryPlants = memoryPlants.filter((p) => p.id !== id);
  res.json({ success: true });
});

// 9. AI Scan Endpoint
app.post("/api/ai/scan", async (req, res) => {
  try {
    const { mode, imageBase64, plantContext } = req.body;

    if (!ai) {
      if (mode === "identify") {
        return res.json({
          species: "Monstera Deliciosa",
          scientificName: "Monstera deliciosa",
          confidence: "High Confidence Match (98%)",
          description:
            "Also known as the Swiss Cheese Plant. Native to tropical forests of southern Mexico and Central America. Famous for its natural leaf fenestrations.",
          sunlight: "Bright indirect light",
          water: "Every 7 days when top 2 inches feel dry",
          soil: "Chunky aroid potting mix with orchid bark and perlite",
          temperature: "65–85°F (18–29°C)",
          humidity: "High, 60%+",
          fertilizer: "Monthly during spring and summer",
        });
      } else {
        return res.json({
          issue: "Spider Mites",
          scientificIssue: "Tetranychus urticae",
          confidence: "High Confidence Match (94%)",
          description:
            "Fine webbing clusters detected along leaf joints and undersides. Pale stippled discoloration on leaves caused by mites extracting chlorophyll.",
          organicTreatment:
            "Mix 1 tsp pure cold-pressed neem oil, 1/2 tsp mild Castile soap, and 1 liter lukewarm water. Spray thoroughly under leaves every 3 days for 2 weeks. Isolate plant and wipe down foliage with damp microfiber cloth.",
          chemicalTreatment:
            "Apply a pyrethrin or sulfur-based miticide spray following container instructions. Treat outdoors in shaded, well-ventilated area with protective gloves.",
        });
      }
    }

    if (mode === "identify") {
      const prompt = `You are a world-class master botanist. Analyze this plant photo and provide identification in exact JSON format:
{
  "species": "Common plant name (e.g. Monstera Deliciosa)",
  "scientificName": "Scientific Latin name (e.g. Monstera deliciosa)",
  "confidence": "e.g. High Confidence Match (98%)",
  "description": "2-3 concise, informative sentences about origins, leaf characteristics, and indoor habits.",
  "sunlight": "Ideal light recommendation",
  "water": "Watering frequency recommendation in days / signs to look for",
  "soil": "Best potting mix composition",
  "temperature": "Ideal temperature range",
  "humidity": "Ideal humidity range",
  "fertilizer": "Feeding recommendation"
}
Return only valid JSON, no markdown tags.`;

      const contents: any[] = [{ text: prompt }];
      if (imageBase64 && imageBase64.startsWith("data:")) {
        const parts = imageBase64.split(",");
        const mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
        contents.push({
          inlineData: { mimeType, data: parts[1] },
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
      });

      const text = response.text || "";
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return res.json(JSON.parse(cleaned));
    } else {
      const prompt = `You are an expert plant pathologist and clinical botanist.
${plantContext ? `Plant Context: The user notes this is a ${plantContext}.` : ""}
Analyze the symptoms shown in the photo or described. Provide diagnosis in exact JSON format:
{
  "issue": "Diagnosis name (e.g. Spider Mites, Overwatering, Powdery Mildew, Nutrient Burn)",
  "scientificIssue": "Scientific organism or pathogen name (e.g. Tetranychus urticae, Pythium spp.)",
  "confidence": "High Confidence Match (95%)",
  "description": "2-3 clear sentences describing visual symptoms, damage mechanism, and progression.",
  "organicTreatment": "Step-by-step natural/organic remedies, isolating tips, moisture control, neem/soap ratios, etc.",
  "chemicalTreatment": "Conventional treatment, active ingredient recommendation and safety steps."
}
Return only valid JSON, no markdown formatting.`;

      const contents: any[] = [{ text: prompt }];
      if (imageBase64 && imageBase64.startsWith("data:")) {
        const parts = imageBase64.split(",");
        const mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
        contents.push({
          inlineData: { mimeType, data: parts[1] },
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
      });

      const text = response.text || "";
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return res.json(JSON.parse(cleaned));
    }
  } catch (err: any) {
    console.error("AI scan error:", err);
    res.json({
      issue: "Leaf Stress & Potential Pest Feeding",
      scientificIssue: "Chlorosis / Tetranychidae",
      confidence: "Moderate Confidence (88%)",
      description:
        "Foliage displays mottled discoloration and mild leaf curling indicative of either moisture fluctuation or early mite activity.",
      organicTreatment:
        "Wipe leaves gently with diluted neem oil solution or mild soap water. Inspect leaf undersides regularly and maintain humidity above 55%.",
      chemicalTreatment:
        "Apply horticultural oil or targeted insecticidal soap as directed by manufacturer label.",
    });
  }
});

// 10. POST Save Diagnosis
app.post("/api/diagnoses", async (req, res) => {
  const {
    plantId,
    issue,
    scientificIssue,
    confidence,
    description,
    organicTreatment,
    chemicalTreatment,
    imageUrl,
    userId = DEFAULT_USER_ID,
  } = req.body;

  const id = "diag_" + Date.now();
  const result = await safeDbQuery(
    `INSERT INTO diagnoses (
      id, plant_id, user_id, issue, scientific_issue, confidence,
      description, organic_treatment, chemical_treatment, image_url, date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING *`,
    [
      id,
      plantId || null,
      userId,
      issue,
      scientificIssue || "",
      confidence || "High Confidence Match",
      description,
      organicTreatment,
      chemicalTreatment,
      imageUrl || null,
    ]
  );

  const diagObj = {
    id,
    plantId,
    userId,
    issue,
    scientificIssue,
    confidence,
    description,
    organicTreatment,
    chemicalTreatment,
    imageUrl,
    date: new Date().toISOString(),
  };

  memoryDiagnoses.unshift(diagObj);

  if (plantId) {
    await safeDbQuery(
      "INSERT INTO care_logs (id, plant_id, type, notes, logged_at) VALUES ($1, $2, $3, $4, NOW())",
      ["log_" + Date.now(), plantId, "diagnosis", `Diagnosed: ${issue}`]
    );
    memoryCareLogs.unshift({
      id: "log_" + Date.now(),
      plantId,
      type: "diagnosis",
      notes: `Diagnosed: ${issue}`,
      loggedAt: new Date().toISOString(),
    });
  }

  res.status(201).json(result ? result.rows[0] : diagObj);
});

// 11. AI Ivy Chat Advisor
app.post("/api/ivy/chat", async (req, res) => {
  const { message, history, userId = DEFAULT_USER_ID } = req.body;
  const userCreatedAt = new Date().toISOString();

  await safeDbQuery(
    "INSERT INTO ivy_messages (id, user_id, role, text, created_at) VALUES ($1, $2, $3, $4, NOW())",
    ["ivy_u_" + Date.now(), userId, "user", message]
  );

  let replyText = "";
  if (ai) {
    try {
      const systemInstruction = `You are Flora, a compassionate, warm, and highly knowledgeable botanical advisor and houseplant expert.
You provide encouraging, practical, scientifically sound plant care advice.
Keep answers concise (2 to 4 short paragraphs or actionable bullet points) so they are effortless to read.`;

      const contents: any[] = [];
      if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
          contents.push({
            role: item.role === "ivy" ? "model" : "user",
            parts: [{ text: item.text }],
          });
        }
      }
      contents.push({ role: "user", parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction },
      });
      replyText = response.text || "I am happy to help you nurture your garden! Check your soil moisture 2 inches down.";
    } catch (e) {
      replyText = "Houseplants thrive with consistent light and proper drainage. Always avoid standing stagnant water!";
    }
  } else {
    replyText =
      "Great question! Based on what you're describing, common culprits include inconsistent moisture or fluctuating light. Check the soil 2 inches down: if dry, provide a deep soak; if moist, hold off and ensure good air circulation.";
  }

  const ivyMsgId = "ivy_r_" + Date.now();
  const replyCreatedAt = new Date().toISOString();
  await safeDbQuery(
    "INSERT INTO ivy_messages (id, user_id, role, text, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [ivyMsgId, userId, "ivy", replyText]
  );

  memoryIvyMessages.push(
    {
      id: "u_" + Date.now(),
      role: "user",
      text: message,
      time: formatDhakaTime(userCreatedAt),
      createdAt: userCreatedAt,
      userId,
    },
    {
      id: ivyMsgId,
      role: "ivy",
      text: replyText,
      time: formatDhakaTime(replyCreatedAt),
      createdAt: replyCreatedAt,
      userId,
    }
  );

  res.json({
    reply: replyText,
    id: ivyMsgId,
    time: formatDhakaTime(replyCreatedAt),
    createdAt: replyCreatedAt,
  });
});

// 12. GET Ivy History
app.get("/api/ivy/history", async (req, res) => {
  const userId = (req.query.userId as string) || DEFAULT_USER_ID;
  const result = await safeDbQuery(
    "SELECT * FROM ivy_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 50",
    [userId]
  );
  if (result && result.rows.length > 0) {
    return res.json(
      result.rows.map((row) => ({
        id: row.id,
        role: row.role,
        text: row.text,
        time: formatDhakaTime(row.created_at),
        createdAt: row.created_at,
      }))
    );
  }
  const filtered = memoryIvyMessages.filter((m: any) => !m.userId || m.userId === userId);
  if (filtered.length > 0) return res.json(filtered);
  res.json(filtered);
});