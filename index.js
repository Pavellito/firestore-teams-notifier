// 3️⃣ Scheduled daily reset
app.post("/reset-daily", async (req, res) => {
  const secret = req.headers["x-reset-key"];
  if (secret !== "AVACHARGE2024") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const snapshot = await db.collection("stations").get();

    const updates = snapshot.docs.map(docSnap => {
      const station = docSnap.data();

      // ⛔ Skip stations that have active bookings
      if (station.booking) {
        console.log(`⏭ Skipping reset for booked station: ${station.name}`);
        return Promise.resolve(); // No-op
      }

      // ✅ Reset station fields
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
      text: "Stations **without bookings** were reset to **Free**. Booking statuses were preserved."
    });

    console.log("✅ Daily reset completed (booked stations excluded)");
    res.send("✅ Daily reset done — booked stations were skipped");
  } catch (err) {
    console.error("❌ Error during daily reset:", err.message);
    res.status(500).send("❌ Reset failed");
  }
});
