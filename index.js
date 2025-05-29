
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/0f977ddf36fa4cf8ad3617b752345c81/4a42e6a8-e54c-48b5-b048-93e987f7990b/V281ENZLpmEzu5ICOAT_BaTKUxtFm7PnGRmQucEK6PAio1";

exports.checkChargingStatus = functions.https.onRequest(async (req, res) => {
  const now = Date.now();
  const db = admin.firestore();
  const snapshot = await db.collection("stations").get();

  let notified = [];

  for (const doc of snapshot.docs) {
    const station = doc.data();
    const docRef = db.collection("stations").doc(doc.id);

    // ⏰ Logic for end-of-charging notification
    if (station.status === "Occupied" && station.timestamp && station.duration) {
      const endTime = station.timestamp + station.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 6 * 60000 && timeRemaining > 2 * 60000) {
        const msg = {
          title: "⏰ Charging Time Ending Soon",
          text: `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "Unknown"}**`
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

    // 📋 Notify on Occupied or Waiting status
    if (
      (station.status === "Occupied" || station.status === "Waiting") &&
      station.notifiedStatus !== station.status
    ) {
      const action = station.status === "Occupied" ? "🔌 Station Occupied" : "📋 Waiting List Entry";
      const text =
        station.status === "Occupied"
          ? `Station: **${station.name}**\nUser: **${station.user || "Unknown"}**\nEstimated duration: **${station.duration || "?"} mins**`
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
