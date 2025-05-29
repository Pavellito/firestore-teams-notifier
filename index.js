const admin = require("firebase-admin");
const axios = require("axios");
const express = require("express");
const app = express();

// Use your actual Firebase service account here
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/0f977ddf36fa4cf8ad3617b752345c81/4a42e6a8-e54c-48b5-b048-93e987f7990b/V281ENZLpmEzu5ICOAT_BaTKUxtFm7PnGRmQucEK6PAio1";

app.get("/", async (req, res) => {
  const now = Date.now();
  const stationsRef = db.collection("stations");
  const snapshot = await stationsRef.get();

  let notified = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.status === "Occupied" && data.timestamp && data.duration) {
      const endTime = data.timestamp + data.duration * 60000;
      const timeRemaining = endTime - now;

      if (timeRemaining < 6 * 60000 && timeRemaining > 2 * 60000) {
        const message = {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: "Charging Time Ending",
          themeColor: "0076D7",
          title: "⏰ Charging Time Ending Soon",
          text: `Station **${data.name}** will be available in ~5 minutes.\nUser: **${data.user || "Unknown"}**`
        };

        await axios.post(TEAMS_WEBHOOK_URL, message);
        notified.push(data.name);
      }
    }
  }

  res.send("✅ Notified stations: " + (notified.join(", ") || "none"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});