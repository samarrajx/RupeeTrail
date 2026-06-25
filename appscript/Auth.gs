/**
 * Auth.gs
 * Handles authentication, PIN validation, and session management.
 * Provides completely backward compatible APIs for RupeeTrail.
 */

const Auth = {
  
  /**
   * Securely hashes a PIN using native SHA-256.
   * @param {string} pin - The raw PIN input.
   * @returns {string} The SHA-256 hash representation.
   */
  _hashPin: function(pin) {
    if (!pin) return "";
    const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin), Utilities.Charset.UTF_8);
    let hash = '';
    for (let i = 0; i < signature.length; i++) {
      let byte = signature[i];
      if (byte < 0) byte += 256;
      let byteStr = byte.toString(16);
      if (byteStr.length === 1) byteStr = '0' + byteStr;
      hash += byteStr;
    }
    return hash;
  },

  /**
   * Validates PIN structure based on security policies.
   * Ensures PIN is numeric, within bounds, and sanitized.
   */
  _validatePinInput: function(pin) {
    if (pin === undefined || pin === null) {
      throw new Error("PIN is required.");
    }
    const trimmed = String(pin).trim();
    if (trimmed === "") {
      throw new Error("PIN cannot be empty.");
    }
    if (trimmed.length < 4 || trimmed.length > 12) {
      throw new Error("PIN must be between 4 and 12 characters.");
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("PIN must be numeric.");
    }
    return trimmed;
  },

  /**
   * Batch fetches essential authentication settings in one optimized sheet read.
   * @returns {Object} { pin_hash, session_token, session_expiry }
   */
  _getAuthSettings: function() {
    const settings = Utils.readSheetData("Settings");
    const authConfig = {
      pin_hash: "",
      session_token: "",
      session_expiry: ""
    };
    
    for (let i = 0; i < settings.length; i++) {
      const key = settings[i].key;
      if (authConfig.hasOwnProperty(key)) {
        authConfig[key] = settings[i].value;
      }
    }
    return authConfig;
  },

  /**
   * Batch updates authentication settings in a single optimized pass.
   * Modifies existing keys or appends them if missing.
   * @param {Object} updates - Key-Value map of settings to update.
   */
  _batchSetSettings: function(updates) {
    const sheet = Utils.getSheet("Settings");
    const data = Utils.readSheetData("Settings");
    
    for (const key in updates) {
      const value = String(updates[key]);
      let idx = -1;
      
      for (let i = 0; i < data.length; i++) {
        if (data[i].key === key) {
          idx = data[i]._rowIndex;
          break;
        }
      }
      
      if (idx !== -1) {
        sheet.getRange(idx, 2).setValue(value);
      } else {
        sheet.appendRow([key, value]);
      }
    }
  },

  /**
   * Core login handler.
   */
  login: function(payload) {
    if (!payload || !payload.pin) {
      Utils.log("LOGIN_FAILED", "User", "auth", "Login attempt with missing PIN payload");
      return Utils.buildError("Invalid PIN"); // Generic error masking missing payload
    }

    let rawPin;
    try {
      rawPin = this._validatePinInput(payload.pin);
    } catch (e) {
      Utils.log("LOGIN_FAILED", "User", "auth", `Validation error: ${e.message}`);
      return Utils.buildError(e.message);
    }

    const authSettings = this._getAuthSettings();
    let storedHash = authSettings.pin_hash;
    const inputHash = this._hashPin(rawPin);

    // If no PIN is set, accept any PIN and securely set it (First time setup behavior)
    if (!storedHash) {
      storedHash = inputHash;
      this._batchSetSettings({ "pin_hash": inputHash });
      Utils.log("SETUP", "User", "auth", "Initial PIN setup completed");
    }

    if (storedHash === inputHash) {
      const token = Utils.generateUUID();
      // Calculate expiry safely, ensuring CONFIG exists
      const durationMs = (typeof CONFIG !== 'undefined' && CONFIG.SESSION_DURATION_MS) ? CONFIG.SESSION_DURATION_MS : 604800000;
      const expiry = new Date(Date.now() + durationMs).toISOString();
      
      this._batchSetSettings({
        "session_token": token,
        "session_expiry": expiry
      });
      
      Utils.log("LOGIN_SUCCESS", "User", "auth", "Session established");
      
      return Utils.buildSuccess({ token: token, expires: expiry });
    }

    Utils.log("LOGIN_FAILED", "User", "auth", "Incorrect PIN hash comparison");
    return Utils.buildError("Invalid PIN"); // Mask internal details securely
  },

  /**
   * Logs out user securely.
   */
  logout: function(token) {
    if (!token) return Utils.buildSuccess({ message: "Logged out" });

    const authSettings = this._getAuthSettings();
    if (authSettings.session_token === token) {
      this._batchSetSettings({
        "session_token": "",
        "session_expiry": ""
      });
      Utils.log("LOGOUT", "User", "auth", "Session cleared");
    }
    
    return Utils.buildSuccess({ message: "Logged out" });
  },

  /**
   * External-facing token verification.
   */
  verifyToken: function(token) {
    const check = this.validateSession(token);
    return Utils.buildSuccess({ valid: check.valid });
  },

  /**
   * Internal session validation logic.
   * Identifies expired sessions and performs database cleanup safely.
   */
  validateSession: function(token) {
    if (!token || typeof token !== 'string' || token.trim() === "") {
      return { valid: false };
    }
    
    const authSettings = this._getAuthSettings();
    
    if (authSettings.session_token !== token) {
      return { valid: false };
    }
    if (!authSettings.session_expiry) {
      return { valid: false };
    }
    
    const expiryTime = new Date(authSettings.session_expiry).getTime();
    if (isNaN(expiryTime)) {
      return { valid: false };
    }
    
    if (Date.now() > expiryTime) {
      // Automatic cleanup of stale session
      this._batchSetSettings({
        "session_token": "",
        "session_expiry": ""
      });
      Utils.log("SESSION_EXPIRED", "User", "auth", "Auto-cleared expired session");
      return { valid: false };
    }
    
    return { valid: true };
  },

  /**
   * Allows user to change their PIN if they know the current one.
   */
  changePin: function(payload) {
    if (!payload) throw new Error("Invalid payload");
    
    Utils.validateRequired(payload, ['oldPin', 'newPin']);
    
    const rawOldPin = this._validatePinInput(payload.oldPin);
    const rawNewPin = this._validatePinInput(payload.newPin);
    
    const authSettings = this._getAuthSettings();
    
    if (authSettings.pin_hash !== this._hashPin(rawOldPin)) {
      Utils.log("CHANGE_PIN_FAILED", "User", "auth", "Invalid old PIN provided");
      throw new Error("Invalid current PIN.");
    }
    
    // Process PIN change and forcibly log out active sessions simultaneously
    this._batchSetSettings({
      "pin_hash": this._hashPin(rawNewPin),
      "session_token": "",
      "session_expiry": ""
    });
    
    Utils.log("PIN_CHANGED", "User", "auth", "PIN updated; all sessions invalidated");
    
    return Utils.buildSuccess({ message: "PIN changed successfully. Please log in again." });
  }

};
