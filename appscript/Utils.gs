/**
 * Utils.gs
 * Reusable utility functions for the backend.
 * Provides generic helpers, spreadsheet access, caching, and validation.
 */

// Memoized spreadsheet instance
let _spreadsheetCache = null;

// Prevent recursive logging
let _isLogging = false;

const Utils = {

  // --- Spreadsheet Access ---
  
  /**
   * Centralized helper to get the main spreadsheet.
   * Uses CONFIG.SPREADSHEET_ID to open the spreadsheet and memoizes it.
   */
  getSpreadsheet: function() {
    if (!_spreadsheetCache) {
      if (!CONFIG || !CONFIG.SPREADSHEET_ID) {
        throw new Error("CONFIG.SPREADSHEET_ID is missing or Config module is unavailable.");
      }
      _spreadsheetCache = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    }
    return _spreadsheetCache;
  },

  /**
   * Retrieves a sheet by name from the centralized spreadsheet object.
   */
  getSheet: function(sheetName) {
    this.validateRequired({ sheetName }, ['sheetName']);
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    return sheet;
  },

  /**
   * Reads entire sheet data as an array of objects.
   * Injects _rowIndex for easy 1-based sheet row updates.
   */
  readSheetData: function(sheetName) {
    const sheet = this.getSheet(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    const headers = data[0];
    const result = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const obj = { _rowIndex: i + 1 };
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      result.push(obj);
    }
    return result;
  },

  /**
   * Appends a new row to the sheet.
   */
  writeRow: function(sheetName, rowArray) {
    const sheet = this.getSheet(sheetName);
    sheet.appendRow(rowArray);
  },

  /**
   * Updates an existing row by 1-based index using bulk setValues.
   */
  updateRow: function(sheetName, rowIndex, rowArray) {
    const sheet = this.getSheet(sheetName);
    sheet.getRange(rowIndex, 1, 1, rowArray.length).setValues([rowArray]);
  },

  /**
   * Deletes a row by 1-based index.
   */
  deleteRow: function(sheetName, rowIndex) {
    const sheet = this.getSheet(sheetName);
    sheet.deleteRow(rowIndex);
  },

  /**
   * Finds the 1-based row index for a matching primary key.
   */
  findRowIndex: function(sheetName, primaryKeyColumnName, primaryKeyValue) {
    const data = this.readSheetData(sheetName);
    for (let i = 0; i < data.length; i++) {
      if (data[i][primaryKeyColumnName] === primaryKeyValue) {
        return data[i]._rowIndex;
      }
    }
    return -1;
  },

  // --- Generators & Formatting ---

  /**
   * Generates a native v4 UUID.
   */
  generateUUID: function() {
    return Utilities.getUuid();
  },

  /**
   * Returns current timestamp in ISO 8601 format.
   */
  getTimestamp: function() {
    return new Date().toISOString();
  },

  /**
   * Formats a date string to YYYY-MM-DD safely.
   */
  formatDate: function(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    // Use Apps Script Utilities to format strictly in the script's timezone to prevent UTC shift
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  },

  /**
   * Returns today's date formatted as YYYY-MM-DD.
   */
  today: function() {
    return this.formatDate(new Date().toISOString());
  },

  /**
   * Returns the current month formatted as YYYY-MM.
   */
  currentMonth: function() {
    return this.today().substring(0, 7);
  },

  /**
   * Returns the current year formatted as YYYY.
   */
  currentYear: function() {
    return String(new Date().getFullYear());
  },

  /**
   * Formats a number to a currency string safely.
   */
  formatCurrency: function(value, currencySymbol = CONFIG.CURRENCY || "₹") {
    const num = Number(value);
    if (isNaN(num)) return `${currencySymbol}0.00`;
    return `${currencySymbol}${num.toFixed(2)}`;
  },

  // --- Responses ---

  buildSuccess: function(data) {
    const payload = { status: "success" };
    if (data !== undefined) payload.data = data;
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  },

  buildError: function(message) {
    const payload = { status: "error", message: message || "An error occurred" };
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  },

  // --- Validation ---

  /**
   * Validates required fields exist and are not null/empty strings.
   */
  validateRequired: function(payload, requiredFields) {
    if (!payload || typeof payload !== 'object') {
      throw new Error("Invalid payload provided for validation.");
    }
    for (let i = 0; i < requiredFields.length; i++) {
      const field = requiredFields[i];
      const val = payload[field];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === "")) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  },

  /**
   * Sanitizes string inputs to prevent basic XSS and coercions.
   */
  sanitizeString: function(str) {
    if (str === null || str === undefined) return "";
    return String(str).trim().replace(/<[^>]*>?/gm, '');
  },

  /**
   * Validates and coerces to a Number safely.
   */
  validateNumber: function(val) {
    if (val === null || val === undefined || val === "") {
      throw new Error(`Value cannot be empty for number validation.`);
    }
    const num = Number(val);
    if (isNaN(num)) throw new Error(`Invalid number: ${val}`);
    return num;
  },

  /**
   * Validates UUID string structure.
   * Tolerant of prefixes for legacy backward compatibility.
   */
  validateUUID: function(uuid) {
    if (!uuid || typeof uuid !== 'string' || uuid.length < 5) {
      throw new Error(`Invalid ID format: ${uuid}`);
    }
    return uuid;
  },

  /**
   * Validates if a date string is parseable.
   */
  isValidDate: function(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime());
  },

  // --- Pagination ---

  /**
   * Paginates an array and returns a structured object response.
   */
  paginate: function(array, page, limit) {
    if (!Array.isArray(array)) {
      throw new Error("Input to paginate must be an array");
    }
    
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.max(1, parseInt(limit) || CONFIG.DEFAULT_PAGINATION_LIMIT || 50);
    const start = (p - 1) * l;
    
    const totalItems = array.length;
    const totalPages = Math.ceil(totalItems / l) || 1;
    
    return {
      items: array.slice(start, start + l),
      page: p,
      pageSize: l,
      totalItems: totalItems,
      totalPages: totalPages,
      hasNext: p < totalPages,
      hasPrevious: p > 1
    };
  },

  // --- Cache Helpers ---

  /**
   * Sets data into CacheService, and optionally persistent sheet fallback.
   */
  setCache: function(key, dataObj) {
    this.validateRequired({ key, dataObj }, ['key', 'dataObj']);
    
    const jsonStr = JSON.stringify(dataObj);
    const cacheSecs = CONFIG.CACHE_DURATION_SEC || 300;
    
    // 1. Primary: Apps Script CacheService
    try {
      const cache = CacheService.getScriptCache();
      cache.put(key, jsonStr, cacheSecs);
    } catch(e) {
      Logger.log(`Warning: Failed to write to CacheService for key ${key}. ${e.message}`);
    }
    
    // 2. Persistent Fallback (DashboardCache Sheet)
    try {
      const sheet = this.getSheet("DashboardCache");
      const idx = this.findRowIndex("DashboardCache", "cache_key", key);
      const ts = this.getTimestamp();
      
      if (idx !== -1) {
        sheet.getRange(idx, 2, 1, 2).setValues([[jsonStr, ts]]);
      } else {
        sheet.appendRow([key, jsonStr, ts]);
      }
    } catch(e) {
      Logger.log(`Warning: Failed to write to persistent cache sheet. ${e.message}`);
    }
  },

  /**
   * Retrieves data from CacheService, falling back to persistent sheet.
   */
  getCache: function(key) {
    this.validateRequired({ key }, ['key']);
    
    // 1. Primary: CacheService
    try {
      const cache = CacheService.getScriptCache();
      const cachedStr = cache.get(key);
      if (cachedStr) {
        return JSON.parse(cachedStr);
      }
    } catch(e) {
      Logger.log(`Warning: Failed to read from CacheService for key ${key}. ${e.message}`);
    }
    
    // 2. Persistent Fallback
    try {
      const data = this.readSheetData("DashboardCache");
      for (let i = 0; i < data.length; i++) {
        if (data[i]["cache_key"] === key) {
          const ts = new Date(data[i]["updated_at"]).getTime();
          const now = new Date().getTime();
          const cacheSecs = CONFIG.CACHE_DURATION_SEC || 300;
          
          if ((now - ts) / 1000 <= cacheSecs) {
            return JSON.parse(data[i]["json_data"]);
          }
        }
      }
    } catch(e) {
      Logger.log(`Warning: Failed to read from persistent cache sheet. ${e.message}`);
    }
    return null;
  },

  /**
   * Invalidates cache dynamically from both CacheService and Sheet.
   */
  invalidateCache: function(key) {
    this.validateRequired({ key }, ['key']);
    
    // 1. CacheService
    try {
      CacheService.getScriptCache().remove(key);
    } catch(e) {
      Logger.log(`Warning: Failed to remove CacheService key ${key}. ${e.message}`);
    }
    
    // 2. Persistent Fallback
    try {
      const idx = this.findRowIndex("DashboardCache", "cache_key", key);
      if (idx !== -1) {
        this.deleteRow("DashboardCache", idx);
      }
    } catch(e) {
      Logger.log(`Warning: Failed to remove persistent cache key ${key}. ${e.message}`);
    }
  },

  // --- Logger ---

  /**
   * Core logging mechanism preventing recursion and silently swallowed errors.
   */
  log: function(action, entity, entityId, details) {
    // GCP Logger Integration
    const logDetails = typeof details === "string" ? details : JSON.stringify(details || {});
    Logger.log(`[${action}] ${entity} (${entityId}): ${logDetails}`);

    if (_isLogging) {
      Logger.log("Recursion prevented in ActivityLog writing.");
      return;
    }
    
    _isLogging = true;
    try {
      const sheet = this.getSheet("ActivityLog");
      const logId = "LOG-" + this.generateUUID();
      sheet.appendRow([
        logId,
        action || "LOG",
        entity || "System",
        entityId || "",
        this.getTimestamp(),
        logDetails
      ]);
    } catch(e) {
      // Do not throw to prevent crashing the main thread on logging failure
      Logger.log(`CRITICAL: Failed to write to ActivityLog sheet. ${e.message}`);
    } finally {
      _isLogging = false;
    }
  },

  // --- Data Utilities ---

  /**
   * Deep clones an object securely.
   */
  deepClone: function(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Chunks a large array into smaller array sizes.
   */
  chunkArray: function(array, size) {
    if (!Array.isArray(array)) throw new Error("Input must be an array");
    const chunkSize = Math.max(1, parseInt(size) || 1);
    const chunked = [];
    let index = 0;
    while (index < array.length) {
      chunked.push(array.slice(index, chunkSize + index));
      index += chunkSize;
    }
    return chunked;
  }

};
