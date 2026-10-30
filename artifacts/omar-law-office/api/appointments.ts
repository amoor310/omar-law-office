
export default async function handler(req: any, res: any) {
  // Accept POST requests only
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const scriptUrl = (globalThis as any).process.env.APPS_SCRIPT_URL;
    const apiSecret = (globalThis as any).process.env.API_SECRET;

    if (!scriptUrl || !apiSecret) {
      return res.status(500).json({
        success: false,
        message: "Server configuration is missing",
      });
    }

    const data =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid request data",
      });
    }

    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: apiSecret,
        action: "submit",
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || "",
          topic: data.topic,
          meetingMode: data.meetingMode,
          date: data.date,
          time: data.time,
          message: data.message || "",
        },
      }),
      redirect: "follow",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Could not submit appointment",
      });
    }

    return res.status(200).json({
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      topic: data.topic,
      meetingMode: data.meetingMode,
      date: data.date,
      time: data.time,
      message: data.message || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Appointment submission error:", error);

    return res.status(500).json({
      success: false,
      message: "An error occurred while submitting your request",
    });
  }
}

