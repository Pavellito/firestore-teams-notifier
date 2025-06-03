const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/0f977ddf36fa4cf8ad3617b752345c81/4a42e6a8-e54c-48b5-b048-93e987f7990b/V281ENZLpmEzu5ICOAT_BaTKUxtFm7PnGRmQucEK6PAio1";

const app = express();
app.use(express.json());

// 🚨 Notify when only 5 minutes are left for a station
app.get("/", async (req, res) => {
  const now = Date.now();
  const snapshot = await db.collection("stations").get();

  let notified = [];

  for (const doc of snapshot.docs) {
    const station = doc.data();
    if (station.status === "Occupied" && station.timestamp && station.duration) {
      const endTime = station.timestamp + station.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 6 * 60000 && timeRemaining > 4 * 60000) {
        await axios.post(TEAMS_WEBHOOK_URL, {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          "summary": "AvaCharge Admin",
          "themeColor": "0076D7",
          "title": "⏰ Charging Time Ending Soon",
          "text": `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "AvaCharge Admin"}**`
        });

        notified.push(`5min: ${station.name}`);
      }
    }
  }

  res.send(`✅ 5-min warnings sent: ${notified.join(", ") || "none"}`);
});

// 🚀 Called from the client to notify Teams when status changes
app.post("/notify", async (req, res) => {
  try {
    const { stationId, status, user, duration } = req.body;

    const docRef = db.collection("stations").doc(stationId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).send("Station not found");
    }

    const station = docSnap.data();
    let title = "";
    let text = "";

    switch (status) {
      case "Occupied":
        title = "🔌 Station Occupied";
        text = `Station: **${station.name}**\nUser: **${user || "AvaCharge Admin"}**\nEstimated duration: **${duration || "?"} mins**`;
        break;

      case "Waiting":
        title = "📋 Joined Waiting List";
        text = `User: **${user || "AvaCharge Admin"}** joined the waiting list for **${station.name}**`;
        break;

      case "Free":
        title = "✅ Station Now Free";
        text = `Station: **${station.name}** is now available.`;
        break;

      case "LeftWaiting":
        title = "❌ Left Waiting List";
        text = `User: **${user || "AvaCharge Admin"}** has left the waiting list for **${station.name}**`;
        break;

      default:
        return res.status(400).send("Invalid status value");
    }

    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "summary": "AvaCharge Admin",
      "themeColor": "0076D7",
      "title": title,
      "text": text
    };

    await axios.post(TEAMS_WEBHOOK_URL, payload);
    await docRef.update({ notifiedStatus: status });

    res.send("✅ Notification sent to Teams");
  } catch (err) {
    console.error("❌ Teams notification error:", err.response?.data || err.message);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
