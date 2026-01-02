const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= CONFIG =================
const RAZORPAY_WEBHOOK_SECRET = "Tbipl@123";
const ALLOWED_AMOUNT = 9600; // ₹96 = 9600 paise
const ALLOWED_CURRENCY = "INR";
// ==========================================

// 🔐 paymentId => { token, createdAt }
const paymentTokens = {};

// =================================================
// 🔹 SIGNATURE VERIFY (SECURE)
// =================================================
function verifySignature(req) {
  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return signature === expected;
}

// =================================================
// 🔹 TOKEN GENERATOR
// =================================================
function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// =================================================
// 🔹 RAZORPAY WEBHOOK (TRUSTED ENTRY POINT)
// =================================================
app.post("/razorpay-webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Invalid webhook signature");
    return res.sendStatus(400);
  }

  if (req.body.event !== "payment.captured") {
    return res.sendStatus(200);
  }

  const payment = req.body.payload.payment.entity;

  // ✅ Validate payment
  if (
    payment.amount !== ALLOWED_AMOUNT ||
    payment.currency !== ALLOWED_CURRENCY
  ) {
    console.log("❌ Invalid payment amount or currency");
    return res.sendStatus(200);
  }

  // ✅ Prevent duplicate processing
  if (paymentTokens[payment.id]) {
    return res.sendStatus(200);
  }

  // =================================================
  // ⏰ PAYMENT TIME → ASIA/KOLKATA (IST)
  // =================================================
  const paymentTimeIST = new Date(payment.created_at * 1000).toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  );

  // =================================================
  // 🔹 USER DETAILS
  // =================================================
  const userDetails = {
    paymentId: payment.id,
    name: payment.notes?.name || "N/A",
    email: payment.email || "N/A",
    phone: payment.contact || "N/A",
    city: payment.notes?.city || "N/A",
    amount: payment.amount / 100 + " INR",
    paymentTime: paymentTimeIST
  };

  console.log("======================================");
  console.log("💰 NEW PAYMENT RECEIVED");
  console.log("👤 Name        :", userDetails.name);
  console.log("📧 Email       :", userDetails.email);
  console.log("📞 Phone       :", userDetails.phone);
  console.log("🏙 City        :", userDetails.city);
  console.log("💵 Amount      :", userDetails.amount);
  console.log("🆔 Payment ID  :", userDetails.paymentId);
  console.log("⏰ Time (IST)  :", userDetails.paymentTime);
  console.log("======================================");

  // =================================================
  // 🔹 TOKEN GENERATION
  // =================================================
  const token = generateToken();

  paymentTokens[payment.id] = {
    token,
    createdAt: Date.now()
  };

  console.log("✅ One-time token created:", token);

  res.sendStatus(200);
});

// =================================================
// 🔹 PAYMENT SUCCESS PAGE
// =================================================
app.get("/payment-success", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "verifying.html"));
});

// =================================================
// 🔹 GET TOKEN (FRONTEND POLLING)
// =================================================
app.get("/get-token", (req, res) => {
  const now = Date.now();

  for (const pid in paymentTokens) {
    const p = paymentTokens[pid];

    // ⏱ Expire after 5 minutes
    if (now - p.createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
      continue;
    }

    return res.json({ token: p.token });
  }

  res.json({});
});

// =================================================
// 🔹 JOIN PAGE (TOKEN EXPIRES HERE)
// =================================================
app.get("/join", (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.send("<h2>❌ Invalid or missing token</h2>");
  }

  const pid = Object.keys(paymentTokens).find(
    id => paymentTokens[id].token === token
  );

  if (!pid) {
    return res.send("<h2>❌ Link expired or invalid</h2>");
  }

  // 🔒 Expire token immediately
  delete paymentTokens[pid];

  res.sendFile(path.join(__dirname, "public", "join.html"));
});

// =================================================
// 🔹 AUTO CLEANUP (EVERY 1 MIN)
// =================================================
setInterval(() => {
  const now = Date.now();
  for (const pid in paymentTokens) {
    if (now - paymentTokens[pid].createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
    }
  }
}, 60 * 1000);

// =================================================
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
