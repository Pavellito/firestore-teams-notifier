const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");

const app = express();
admin.initializeApp();

const TEAMS_WEBHOOK_URL = "YOUR_WEBHOOK_URL_HERE";

app.get("/", async (req, res) => {
  const now = Date.now();
  const db = admin.firestore();
  const snapshot = await db.collection("stations").get();

  let notified = [];

  for (const doc of snapshot.docs) {
    const station = doc.data();
    const docRef = db.collection("stations").doc(doc.id);

    if (station.status === "Occupied" && station.timestamp && station.duration) {
      const endTime = station.timestamp + station.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 6 * 60000 && timeRemaining > 2 * 60000) {
        const msg = {
          title: "⏰ Charging Time Ending Soon",
          text: `Station **${station.name}** will be available in ~5 minutes.\\nUser: **${station.user || "Unknown"}**`
        };

        await axios.post(TEAMS_WEBHOOK_URL, {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          "summary": msg.title,
          "themeColor": "0076D7",
          "title": msg.title,
          "text": msg.text
        });

        notified.push(`⚠️ TimeEnding: ${station.name}`);
      }
    }

    if (
      (station.status === "Occupied" || station.status === "Waiting") &&
      station.notifiedStatus !== station.status
    ) {
      const action = station.status === "Occupied" ? "🔌 Station Occupied" : "📋 Waiting List Entry";
      const text =
        station.status === "Occupied"
          ? `Station: **${station.name}**\\nUser: **${station.user || "Unknown"}**\\nEstimated duration: **${station.duration || "?"} mins**`
          : `User: **${station.user || "Unknown"}** joined the waiting list for **${station.name}**`;

      await axios.post(TEAMS_WEBHOOK_URL, {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": action,
        "themeColor": "0076D7",
        "title": action,
        "text": text
      });

      await docRef.update({ notifiedStatus: station.status });
      notified.push(`🔔 StatusChange: ${station.name} [${station.status}]`);
    }
  }

  res.send(`✅ Notifications sent: ${notified.join(", ") || "none"}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
