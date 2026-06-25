/**
 * Settings.gs
 * Handles reading and updating user settings/preferences.
 * Securely blocks access to internal authentication variables.
 * Schema: key, value
 */

const Settings = {

  // Immutable Set representing keys that the frontend can never access or modify
  _PROTECTED_KEYS: new Set(["pin_hash", "session_token", "session_expiry"]),

  /**
   * Validates incoming settings securely before updating.
   * Provides hard fallback definitions for known system properties.
   */
  _validateSetting: function(key, rawValue) {
    const value = String(rawValue).trim();
    
    switch (key) {
      case "theme":
        if (!["light", "dark", "system"].includes(value.toLowerCase())) {
          throw new Error(`Invalid theme configuration: ${value}`);
        }
        return value.toLowerCase();
        
      case "currency":
        // Fast ISO alpha-3 check validation fallback
        if (value.length < 1 || value.length > 5) {
          throw new Error("Currency format appears invalid. Please use a standard symbol or ISO code.");
        }
        return value;
        
      case "number_format":
        if (!["US", "IN", "EU"].includes(value.toUpperCase())) {
          throw new Error(`Unsupported number format: ${value}`);
        }
        return value.toUpperCase();
        
      default:
        // Accept and sanitize unknown generic keys to ensure forward-compatibility
        return Utils.sanitizeString(value);
    }
  },

  /**
   * Retrieves all public-facing settings while blinding protected internal variables.
   */
  getSettings: function() {
    const data = Utils.readSheetData("Settings");
    const settingsMap = {};
    
    for (let i = 0; i < data.length; i++) {
      const key = data[i].key;
      // Blindly ignore backend authentication tokens
      if (!this._PROTECTED_KEYS.has(key)) {
        settingsMap[key] = data[i].value;
      }
    }
    
    return Utils.buildSuccess(settingsMap);
  },

  /**
   * Securely validates and batch-updates configuration settings.
   */
  updateSettings: function(payload) {
    if (!payload || !payload.settings) {
      throw new Error("Settings payload is missing.");
    }
    
    const settings = payload.settings;
    
    const sheet = Utils.getSheet("Settings");
    const data = Utils.readSheetData("Settings");
    
    // Hash map the existing database rows for instantaneous lookup
    const existingMap = {};
    for (let i = 0; i < data.length; i++) {
      existingMap[data[i].key] = {
        value: data[i].value,
        rowIndex: data[i]._rowIndex
      };
    }
    
    // Track if any writes actually occur
    let writesExecuted = 0;
    
    for (const key in settings) {
      // 1. Strict Quarantine: Reject protected keys silently
      if (this._PROTECTED_KEYS.has(key)) continue; 
      
      // 2. Rigid validation parser
      const parsedValue = this._validateSetting(key, settings[key]);
      
      const existing = existingMap[key];
      
      if (existing) {
        // 3. Batch Diffing: Only push a sheet write if the value mathematically changed
        if (String(existing.value) !== parsedValue) {
          sheet.getRange(existing.rowIndex, 2).setValue(parsedValue);
          writesExecuted++;
        }
      } else {
        // Missing row logic, append explicitly
        sheet.appendRow([key, parsedValue]);
        writesExecuted++;
      }
    }
    
    Utils.log("SETTINGS_UPDATE", "Settings", "Global", `Updated ${writesExecuted} application settings`);
    
    return this.getSettings();
  }

};
