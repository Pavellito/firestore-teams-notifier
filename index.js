const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(cors()); // ✅ Allow Netlify frontend
app.use(express.json());

const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/04c5baa8f40e4f4584acc23c8e68c568/4a42e6a8-e54c-48b5-b048-93e987f7990b/V2LweQhYmOVpE7Efx6e6Wz-g0O4qtI165HZakRBzwurYg1";

// 1️⃣ Cron-based notification
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
          "text": `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "Unknown"}**`
        });

        notified.push(`5min: ${station.name}`);
      }
    }
  }

  res.send(`✅ 5-min warnings sent: ${notified.join(", ") || "none"}`);
});

// 2️⃣ Frontend-triggered notifications
app.post("/notify", async (req, res) => {
  try {
    const { stationId, status, user, duration } = req.body;
    console.log("📨 Received notify request:", req.body);

    const docRef = db.collection("stations").doc(stationId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).send("Station not found");
    }

    const station = docSnap.data();
    let title = "";
    let text = "";

    if (status === "Occupied") {
      title = "🔌 Station Occupied";
      text = `Station: **${station.name}**\nUser: **${user || "AvaCharge Admin"}**\nEstimated duration: **${duration || "?"} mins**`;
    } else if (status === "Waiting") {
      title = "📋 Joined Waiting List";
      text = `User: **${user || "AvaCharge Admin"}** joined the waiting list for **${station.name}**`;
    } else if (status === "Free") {
      title = "✅ Station Now Free";
      text = `Station: **${station.name}** is now available.`;
    } else if (status === "LeftWaiting") {
      title = "❌ Left Waiting List";
      text = `User: **${user || "AvaCharge Admin"}** left the waiting list for **${station.name}**`;
    }

    if (title && text) {
      await axios.post(TEAMS_WEBHOOK_URL, {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": "AvaCharge Admin",
        "themeColor": "0076D7",
        "title": title,
        "text": text
      });

      await docRef.update({ notifiedStatus: status });

      console.log(`✅ Sent Teams message: ${title}`);
      res.send("✅ Notification sent to Teams");
    } else {
      console.log("⚠️ Invalid status sent to /notify");
      res.status(400).send("Invalid status");
    }
  } catch (err) {
    console.error("❌ Error sending to Teams:", err.message);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
