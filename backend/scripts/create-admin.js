const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid"); // Make sure you ran: npm install uuid
const path = require("path");

const dbPath = path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

async function createAdmin() {
  // --- CHANGE THESE TWO VARIABLES ---
  const username = "admin";
  const password = "my_secure_password";
  // ----------------------------------

  console.log(`Generating hash for ${username}...`);

  // 1. Hash the password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 2. Generate a unique ID
  const id = uuidv4();

  try {
    // 3. Insert the user with the 'admin' role
    db.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    ).run(id, username, passwordHash, "admin");

    console.log("✅ Admin user created successfully!");
    console.log(`ID: ${id}`);
    console.log(`Username: ${username}`);
    console.log(`Hash: ${passwordHash}`);
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      console.error("❌ Error: A user with that username already exists.");
    } else {
      console.error("❌ Database Error:", error.message);
    }
  }
}

createAdmin();
