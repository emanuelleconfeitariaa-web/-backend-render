const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI não definida.");
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB conectado.");
  } catch (err) {
    console.error("Erro ao conectar no MongoDB:", err);
    throw err;
  }
}

module.exports = { connectDB };