const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =================================================
// 🔧 CONFIG
// =================================================
const RAZORPAY_WEBHOOK_SECRET = "Tbipl@123";
const ALLOWED_CURRENCY = "INR";

const PLANS = {
  9600: {
    whatsapp: "https://chat.whatsapp.com/L49jAfY1CltBXXcUQNL9KU",
    event: "10 January Webinar"
  },
  9900: {
    whatsapp: "https://chat.whatsapp.com/HCAvvC1okgsGigsZZM0krm",
    event: "4 January Seminar"
  }
};

// paymentId => { token, whatsapp, user, createdAt }
const paymentTokens = {};

// =================================================
// 🔐 VERIFY WEBHOOK SIGNATURE
// =================================================
function verifySignature(req) {
  const signature = req.headers["x-razorpay-signature"];

  const expected = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return signature === expected;
}

// =================================================
// 🔑 TOKEN GENERATOR
// =================================================
function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// =================================================
// 🔹 RAZORPAY WEBHOOK (TRUSTED ENTRY)
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
  const plan = PLANS[payment.amount];

  if (!plan || payment.currency !== ALLOWED_CURRENCY) {
    console.log("❌ Invalid payment amount or currency");
    return res.sendStatus(200);
  }

  // Prevent duplicate processing
  if (paymentTokens[payment.id]) {
    return res.sendStatus(200);
  }

  // =================================================
  // ⏰ PAYMENT TIME → IST
  // =================================================
  const paymentTimeIST = new Date(payment.created_at * 1000).toLocaleString(
    "en-IN",
    { timeZone: "Asia/Kolkata" }
  );

  // =================================================
  // 👤 USER DETAILS
  // =================================================
  const userDetails = {
    paymentId: payment.id,
    name: payment.notes?.name || "N/A",
    email: payment.email || "N/A",
    phone: payment.contact || "N/A",
    city: payment.notes?.city || "N/A",
    amount: payment.amount / 100 + " INR",
    paymentTime: paymentTimeIST,
    event: plan.event
  };

  console.log("======================================");
  console.log("💰 NEW PAYMENT RECEIVED");
  console.log("👤 Name        :", userDetails.name);
  console.log("📧 Email       :", userDetails.email);
  console.log("📞 Phone       :", userDetails.phone);
  console.log("🏙 City        :", userDetails.city);
  console.log("💵 Amount      :", userDetails.amount);
  console.log("🆔 Payment ID  :", userDetails.paymentId);
  console.log("📦 Event       :", userDetails.event);
  console.log("⏰ Time (IST)  :", userDetails.paymentTime);
  console.log("======================================");

  // =================================================
  // 🔑 CREATE ONE-TIME TOKEN
  // =================================================
  const token = generateToken();

  paymentTokens[payment.id] = {
    token,
    whatsapp: plan.whatsapp,
    user: userDetails,
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
// 🔹 FRONTEND POLLING FOR TOKEN
// =================================================
app.get("/get-token", (req, res) => {
  const now = Date.now();

  for (const pid in paymentTokens) {
    const data = paymentTokens[pid];

    if (now - data.createdAt > 5 * 60 * 1000) {
      delete paymentTokens[pid];
      continue;
    }

    return res.json({ token: data.token });
  }

  res.json({});
});

// =================================================
// 🔹 VERIFY TOKEN (SEND WHATSAPP + USER DATA)
// =================================================
app.get("/verify-token", (req, res) => {
  const token = req.query.token;

  const pid = Object.keys(paymentTokens).find(
    id => paymentTokens[id].token === token
  );

  if (!pid) {
    return res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
  }

  const data = paymentTokens[pid];

  // 🔒 One-time use
  delete paymentTokens[pid];

  res.json({
    whatsapp: data.whatsapp,
    user: data.user
  });
});

// =================================================
// 🔹 JOIN PAGE (SINGLE HTML FILE)
// =================================================
app.get("/join", (req, res) => {
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
