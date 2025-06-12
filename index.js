const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("./serviceAccountKey.json");

const app = express(); // ✅ DECLARED EARLY

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
app.use(cors());
app.use(express.json());

const TEAMS_WEBHOOK_URL = "https://avafinancialltd.webhook.office.com/webhookb2/f0a37630-3b42-468f-b1a5-7af974245202@a234d4e6-b5c1-4f59-b108-5a6e5b909ddb/IncomingWebhook/0f977ddf36fa4cf8ad3617b752345c81/4a42e6a8-e54c-48b5-b048-93e987f7990b/V281ENZLpmEzu5ICOAT_BaTKUxtFm7PnGRmQucEK6PAio1";

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
          summary: "AvaCharge Admin",
          themeColor: "0076D7",
          title: "⏰ Charging Time Ending Soon",
          text: `Station **${station.name}** will be available in ~5 minutes.\nUser: **${station.user || "Unknown"}**`
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
    const { stationId, status, user, duration, bookingTime } = req.body;
    console.log("📨 Received notify request:", req.body);

    const docRef = db.collection("stations").doc(stationId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).send("Station not found");
    }

    const station = docSnap.data();
    let title = "";
    let text = "";

    const normalizedStatus = status?.toLowerCase();

    switch (normalizedStatus) {
      case "occupied":
        title = "🔌 Station Occupied";
        text = `Station: **${station.name}**\nUser: **${user || "AvaCharge Admin"}**\nEstimated duration: **${duration || "?"} mins**`;
        break;
      case "free":
        title = "✅ Station Now Free";
        text = `Station: **${station.name}** is now available.`;
        break;
      case "waiting":
      case "joined waiting list":
        title = "📋 Joined Waiting List";
        text = `User: **${user || "AvaCharge Admin"}** joined the waiting list for **${station.name}**`;
        break;
      case "leftwaiting":
      case "left waiting list":
        title = "❌ Left Waiting List";
        text = `User: **${user || "AvaCharge Admin"}** left the waiting list for **${station.name}**`;
        break;
      case "booked":
      case "booking":
        title = "📅 Station Booked";
        text = `User: **${user || "AvaCharge Admin"}** booked **${station.name}**${bookingTime ? ` at **${bookingTime}**` : ""}`;
        break;
      default:
        title = `ℹ️ Station Status Update`;
        text = `User: **${user || "AvaCharge Admin"}** updated **${station.name}** to status: **${status}**.`;
    }

    if (title && text) {
      await axios.post(TEAMS_WEBHOOK_URL, {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        summary: "AvaCharge Admin",
        themeColor: "0076D7",
        title,
        text
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

// 3️⃣ Scheduled daily reset (skips booked stations)
app.post("/reset-daily", async (req, res) => {
  const secret = req.headers["x-reset-key"];
  if (secret !== "AVACHARGE2024") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const snapshot = await db.collection("stations").get();

    const updates = snapshot.docs.map(docSnap => {
      const station = docSnap.data();

      // ⛔ Skip resetting booked stations
      if (station.booking) {
        console.log(`⏭ Skipping reset for booked station: ${station.name}`);
        return Promise.resolve();
      }

      return docSnap.ref.update({
        status: "Free",
        user: "",
        duration: 0,
        timestamp: null,
        booking: null,
        waitingList: [],
        notifiedStatus: "Free"
      });
    });

    await Promise.all(updates);

    await axios.post(TEAMS_WEBHOOK_URL, {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      summary: "AvaCharge Admin",
      themeColor: "0076D7",
      title: "🔁 Daily Auto-Reset at 18:00 (Israel Time)",
      text: "Stations **without bookings** were reset to **Free**. Booked stations were skipped."
    });

    console.log("✅ Daily reset completed");
    res.send("✅ Daily reset done — booked stations skipped");
  } catch (err) {
    console.error("❌ Error during daily reset:", err.message);
    res.status(500).send("❌ Reset failed");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
