/**
 * Config.gs
 * Application configuration settings.
 * Does not contain business logic.
 */

const CONFIG = {
  APP_NAME: "RupeeTrail",
  VERSION: "1.0.0",

  SPREADSHEET_ID: "1edepltJxtmpULLEZoLq7SbMiK-_1TTbnn2zFB1xfJoQ",

  TIMEZONE: "Asia/Kolkata",
  CURRENCY: "₹",
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  CACHE_DURATION_SEC: 300, // 5 minutes in seconds for dashboard cache
  DEFAULT_PAGINATION_LIMIT: 50
};
