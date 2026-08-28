import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = process.env.FIELD_ENCRYPTION_KEY
  ? Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "hex")
  : crypto.randomBytes(32); // fallback dev key (ephemeral per process)

const PII_FIELDS = ["email", "phone", "mobile", "taxid", "pan", "gstin", "ssn", "aadhaar"];

function isPIIField(key) {
  const k = key.toLowerCase();
  return PII_FIELDS.some(f => k.includes(f));
}

export function encryptPIIFields(dataObj) {
  if (!dataObj || typeof dataObj !== "object") return dataObj;
  const result = { ...dataObj };
  for (const [key, val] of Object.entries(result)) {
    if (isPIIField(key) && val != null && typeof val === "string") {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
      const encrypted = Buffer.concat([cipher.update(String(val), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      result[key] = `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
    }
  }
  return result;
}

export function decryptPIIFields(dataObj) {
  if (!dataObj || typeof dataObj !== "object") return dataObj;
  const result = { ...dataObj };
  for (const [key, val] of Object.entries(result)) {
    if (typeof val === "string" && val.startsWith("enc:")) {
      try {
        const [, ivHex, tagHex, encHex] = val.split(":");
        const iv = Buffer.from(ivHex, "hex");
        const tag = Buffer.from(tagHex, "hex");
        const enc = Buffer.from(encHex, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(tag);
        result[key] = decipher.update(enc) + decipher.final("utf8");
      } catch { /* leave as-is if decryption fails */ }
    }
  }
  return result;
}
