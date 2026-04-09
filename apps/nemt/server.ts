
import express from "express";
import fileUpload from "express-fileupload";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { GoogleGenAI, Type } from "@google/genai";
import helmet from "helmet";
import cors from "cors";
import xss from "xss-clean";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Joi from "joi";

const DB_PATH = process.env.NODE_ENV === "production" ? "/tmp/nutrimoment.db" : "nutrimoment.db";

// Copy initial database to /tmp in production if it doesn't exist
if (process.env.NODE_ENV === "production" && !fs.existsSync(DB_PATH) && fs.existsSync("nutrimoment.db")) {
  fs.copyFileSync("nutrimoment.db", DB_PATH);
}

const db = new Database(DB_PATH);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pantry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity TEXT,
    expiration DATE
  );
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    is_saved INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS health_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    condition TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'English');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('inputLanguage', 'English');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('cuisine', 'Any');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('calorieTarget', '2000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('maxMissingIngredients', '2');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', 1);

  // Security Middlewares
  app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP to allow Vite dev server inline scripts
  app.use(cors({
    origin: ["http://localhost:3000", "https://yourdomain.com", process.env.APP_URL || "*"]
  }));
  app.use(xss());
  app.use(hpp());
  app.use(morgan("combined"));
  app.use(fileUpload());

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use("/api", limiter);

  app.use(express.json({ limit: '50mb' }));

  // Safe Async Wrapper
  const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  // AI Fallback System
  function fallbackRecipe(ingredients: string[]) {
    return [{
      name: "Simple Mixed Dish",
      cuisine: "General",
      ingredients: ingredients.length > 0 ? ingredients : ["Available ingredients"],
      missing_ingredients: [],
      steps: [
        "Prepare and chop all ingredients.",
        "Heat oil in a pan over medium heat.",
        "Add ingredients and cook for 10-15 minutes.",
        "Season to taste and serve warm."
      ],
      calories: 300,
      protein: "10g",
      carbs: "20g",
      fat: "10g",
      cook_time: "15 mins",
      difficulty: "Easy"
    }];
  }

  // Helper to get AI response (Gemini only)
  
async function generateAIResponse(
  prompt: string,
  systemInstruction?: string,
  imageBase64?: string,
  retries = 1
): Promise<any> {

  const { GoogleGenAI } = require("@google/generative-ai");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("API_KEY_MISSING");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const model = process.env.FAST_MODE === "true"
    ? "gemini-1.5-flash"
    : "gemini-1.5-pro";

  const parts = [{ text: prompt }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        systemInstruction: systemInstruction || "",
        responseMimeType: "application/json",
        temperature: 0.4
      }
    });

    const text = response.text || "{}";

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("INVALID_JSON");
    }

  } catch (error) {
    if (retries > 0) {
      return generateAIResponse(prompt, systemInstruction, imageBase64, retries - 1);
    }

    return {
      recipeName: "Simple Dish",
      ingredients: [],
      steps: ["Cook ingredients together and serve."],
      nutrition: {
        calories: "N/A",
        protein: "N/A",
        carbs: "N/A",
        fat: "N/A"
      }
    };
  }
}


startServer();


function enforceLanguage(text: string, language: string) {
  const patterns: any = {
    Arabic: /[؀-ۿ]/,
    English: /^[\x00-\x7F\s.,\-:()"']+$/
  };

  if (patterns[language] && !patterns[language].test(text)) {
    throw new Error("LANGUAGE_MISMATCH");
  }

  return text;
}

