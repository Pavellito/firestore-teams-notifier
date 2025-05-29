
const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");

const app = express();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/0f977ddf36fa4cf8ad3617b752345c81/4a42e6a8-e54c-48b5-b048-93e987f7990b/V281ENZLpmEzu5ICOAT_BaTKUxtFm7PnGRmQucEK6PAio1";

app.get("/", async (req, res) => {
  const now = Date.now();
  const snapshot = await db.collection("stations").get();
  let notified = [];

  for (const doc of snapshot.docs) {
    const station = doc.data();
    const docRef = db.collection("stations").doc(doc.id);

    // Time remaining notification
    if (station.status === "Occupied" && station.timestamp && station.duration) {
      const endTime = station.timestamp + station.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 6 * 60000 && timeRemaining > 2 * 60000) {
        await axios.post(TEAMS_WEBHOOK_URL, {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          "summary": "AvaCharge Admin",
          "themeColor": "0076D7",
          "title": "⏰ Charging Time Ending Soon",
          "text": `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "Unknown"}**`
        });
        notified.push(`⚠️ TimeEnding: ${station.name}`);
      }
    }

    // Status change notifications
    const lastStatus = station.notifiedStatus;
    const currentStatus = station.status;

    if (currentStatus !== lastStatus) {
      let title = "";
      let text = "";

      if (currentStatus === "Occupied") {
        title = "🔌 Station Occupied";
        text = `Station: **${station.name}**\nUser: **${station.user || "Unknown"}**\nEstimated duration: **${station.duration || "?"} mins**`;
      } else if (currentStatus === "Waiting") {
        title = "📋 Joined Waiting List";
        text = `User: **${station.user || "Unknown"}** joined the waiting list for **${station.name}**`;
      } else if (currentStatus === "Free") {
        title = "✅ Station Now Free";
        text = `Station: **${station.name}** is now available.`;
      } else if (currentStatus === "LeftWaiting") {
        title = "❌ Left Waiting List";
        text = `User: **${station.user || "Unknown"}** has left the waiting list for **${station.name}**`;
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

        await docRef.update({ notifiedStatus: currentStatus });
        notified.push(`🔔 ${title}: ${station.name}`);
      }
    }
  }

  res.send(`✅ Notifications sent: ${notified.join(", ") || "none"}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
