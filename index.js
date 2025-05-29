
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

app.get("/", async (req, res) => {
  const now = Date.now();
  const snapshot = await db.collection("stations").get();

  let notified = [];

  snapshot.forEach(doc => {
    const station = doc.data();
    if (station.status === "Occupied" && station.timestamp && station.duration) {
      const endTime = station.timestamp + station.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 5.5 * 60000 && timeRemaining > 4.5 * 60000) {
        const msg = {
          title: "⏰ Charging Time Ending Soon",
          text: `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "AvaCharge Admin"}**`
        };

        axios.post(TEAMS_WEBHOOK_URL, {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          "summary": msg.title,
          "themeColor": "0076D7",
          "title": msg.title,
          "text": msg.text
        });

        notified.push(station.name);
      }
    }
  });

  res.send(`✅ Notified stations: ${notified.join(", ") || "none"}`);
});

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
      text = `User: **${user || "AvaCharge Admin"}** has left the waiting list for **${station.name}**`;
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

      res.send("✅ Notification sent");
    } else {
      res.status(400).send("Invalid status");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
