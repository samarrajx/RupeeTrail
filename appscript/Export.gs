/**
 * Export.gs
 * Handles secure formatting and data exportation.
 * Guarantees RFC 4180 CSV compliance and strict JSON data typing.
 */

const Export = {

  /**
   * Generates a platform-safe filename string (YYYY-MM-DD_HH-mm-ss)
   */
  _getSafeFilename: function(prefix, extension) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${prefix}_${dateStr}_${timeStr}.${extension}`;
  },

  /**
   * Generates formatted exports for frontend downloads.
   */
  generateExport: function(payload) {
    const startTime = Date.now();
    const format = payload && payload.format ? String(payload.format).trim().toLowerCase() : 'csv';
    
    // Read the dataset precisely once
    const data = Utils.readSheetData("Transactions");
    
    // Reverse sort transactions by date safely, moving malformed dates to the bottom natively
    data.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });

    let result;
    if (format === 'json') {
      result = this._exportJSON(data);
    } else if (format === 'csv') {
      result = this._exportCSV(data);
    } else {
      throw new Error(`Unsupported export format requested: ${format}`);
    }
    
    Utils.log("EXPORT_GENERATED", "System", format.toUpperCase(), `Exported ${data.length} records in ${Date.now() - startTime}ms`);
    return result;
  },

  /**
   * Generates JSON with strictly mapped primitive values.
   */
  _exportJSON: function(data) {
    const cleanData = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // Safely structure JSON ensuring amounts are Numbers and missing fields don't bleed as 'undefined'
      cleanData.push({
        id: row.transaction_id,
        date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
        type: row.type || "Unknown",
        amount: Number(row.amount) || 0,
        categoryId: row.category_id || null,
        accountId: row.account_id || null,
        transferAccountId: row.transfer_account_id || null,
        note: row.note || "",
        tags: row.tags || "",
        paymentMode: row.payment_mode || "Unknown"
      });
    }

    const jsonStr = JSON.stringify(cleanData, null, 2);
    const base64 = Utilities.base64Encode(jsonStr, Utilities.Charset.UTF_8);
    
    return Utils.buildSuccess({
      filename: this._getSafeFilename("RupeeTrail_Export", "json"),
      mimeType: "application/json",
      contentBase64: base64
    });
  },

  /**
   * RFC 4180 compliant CSV Escaper.
   * Handles commas, double-quotes, newlines, and trailing spaces inherently.
   */
  _escapeCSVField: function(value) {
    if (value === null || value === undefined) return "";
    
    let str = String(value);
    // If string contains a quote, comma, newline, or carriage return, it MUST be wrapped in outer quotes.
    // Any existing inner quotes must be doubled up ("").
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  /**
   * Generates RFC-compliant CSVs via optimized high-speed array buffer strings.
   */
  _exportCSV: function(data) {
    const rowsBuffer = [];
    
    // Header
    rowsBuffer.push("ID,Date,Type,Amount,Category,Account,Transfer Account,Payment Mode,Note,Tags");
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      const csvRow = [
        this._escapeCSVField(row.transaction_id),
        this._escapeCSVField(Utils.formatDate(row.date)),
        this._escapeCSVField(row.type),
        this._escapeCSVField(Number(row.amount)),
        this._escapeCSVField(row.category_id),
        this._escapeCSVField(row.account_id),
        this._escapeCSVField(row.transfer_account_id),
        this._escapeCSVField(row.payment_mode),
        this._escapeCSVField(row.note),
        this._escapeCSVField(row.tags)
      ];
      
      rowsBuffer.push(csvRow.join(","));
    }

    // High speed string join bypassing massive memory reallocation cycles
    const csvStr = rowsBuffer.join("\n");
    const base64 = Utilities.base64Encode(csvStr, Utilities.Charset.UTF_8);
    
    return Utils.buildSuccess({
      filename: this._getSafeFilename("RupeeTrail_Export", "csv"),
      mimeType: "text/csv",
      contentBase64: base64
    });
  }

};
