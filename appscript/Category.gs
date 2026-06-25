/**
 * Category.gs
 * Handles CRUD operations and business logic for Categories.
 * Schema: category_id, name, icon, color, type, monthly_budget, is_active
 */

const Category = {

  /**
   * Internal helper to load and index all categories in one pass.
   * Prevents repeated sheet iterations.
   */
  _getCategoryData: function() {
    const data = Utils.readSheetData("Categories");
    const map = {};
    for (let i = 0; i < data.length; i++) {
      map[data[i].category_id] = data[i];
    }
    return { data, map };
  },

  /**
   * Centralized category validation logic.
   * Prevents invalid types, empty strings, and negative budgets.
   */
  _validateCategoryData: function(payloadObj, isUpdate = false) {
    const validTypes = { "expense": "Expense", "income": "Income", "both": "Both" };
    const validated = {};

    // Validate Name
    if (payloadObj.name !== undefined) {
      const name = Utils.sanitizeString(payloadObj.name);
      if (name === "") throw new Error("Category name cannot be empty.");
      validated.name = name;
    } else if (!isUpdate) {
      throw new Error("Category name is required.");
    }

    // Validate Type
    if (payloadObj.type !== undefined) {
      const typeKey = String(payloadObj.type).trim().toLowerCase();
      if (!validTypes[typeKey]) {
        throw new Error("Type must be exactly 'Expense', 'Income', or 'Both'.");
      }
      validated.type = validTypes[typeKey];
    } else if (!isUpdate) {
      throw new Error("Category type is required.");
    }

    // Validate Budget
    if (payloadObj.monthly_budget !== undefined) {
      const budget = Number(payloadObj.monthly_budget);
      if (isNaN(budget) || budget < 0) {
        throw new Error("Monthly budget must be a non-negative numeric value.");
      }
      validated.monthly_budget = budget;
    }

    // Sanitization for Optionals
    if (payloadObj.icon !== undefined) {
      validated.icon = Utils.sanitizeString(payloadObj.icon);
    }
    
    if (payloadObj.color !== undefined) {
      validated.color = Utils.sanitizeString(payloadObj.color);
    }

    return validated;
  },

  /**
   * Fetches the list of categories.
   */
  getCategories: function(payload) {
    const { data } = this._getCategoryData();
    const activeOnly = payload && payload.activeOnly !== false;
    
    const categories = [];
    for (let i = 0; i < data.length; i++) {
      if (activeOnly && String(data[i].is_active).toUpperCase() !== "TRUE") {
        continue;
      }
      
      categories.push({
        id: data[i].category_id,
        name: data[i].name,
        icon: data[i].icon,
        color: data[i].color,
        type: data[i].type,
        monthly_budget: Number(data[i].monthly_budget)
      });
    }
    
    return Utils.buildSuccess(categories);
  },

  /**
   * Creates a new category.
   */
  createCategory: function(payload) {
    const categoryPayload = payload.category;
    if (!categoryPayload) throw new Error("Category payload is missing.");

    // Validate structure securely
    const validated = this._validateCategoryData(categoryPayload, false);

    const { data } = this._getCategoryData();
    const lowerName = validated.name.toLowerCase();
    
    // Prevent duplicate active names
    for (let i = 0; i < data.length; i++) {
      if (String(data[i].name).toLowerCase() === lowerName && 
          String(data[i].is_active).toUpperCase() === "TRUE") {
        throw new Error("An active category with this name already exists.");
      }
    }

    const id = "CAT-" + Utils.generateUUID();
    
    const row = [
      id,
      validated.name,
      validated.icon || "🏷️",
      validated.color || "#9CA3AF",
      validated.type,
      validated.monthly_budget !== undefined ? validated.monthly_budget : 0,
      "TRUE"
    ];
    
    Utils.writeRow("Categories", row);
    Utils.log("CAT_CREATE", "Category", id, `Created: ${validated.name}`);
    Utils.invalidateCache("dashboard_summary");
    
    // Return formatted success mimicking frontend expectations
    return Utils.buildSuccess({
      id: id,
      name: validated.name,
      icon: validated.icon || "🏷️",
      color: validated.color || "#9CA3AF",
      type: validated.type,
      monthly_budget: validated.monthly_budget !== undefined ? validated.monthly_budget : 0
    });
  },

  /**
   * Edits an existing category.
   */
  editCategory: function(payload) {
    const id = payload.id;
    const categoryPayload = payload.category;
    Utils.validateRequired(payload, ['id', 'category']);
    
    const { data, map } = this._getCategoryData();
    const currentObj = map[id];
    
    if (!currentObj) {
      throw new Error("Category not found.");
    }
    
    // Validate structure securely as an update operation
    const validated = this._validateCategoryData(categoryPayload, true);
    
    // Enforce name uniqueness on edit if name is changing
    if (validated.name) {
      const lowerName = validated.name.toLowerCase();
      for (let i = 0; i < data.length; i++) {
        if (data[i].category_id !== id && 
            String(data[i].name).toLowerCase() === lowerName && 
            String(data[i].is_active).toUpperCase() === "TRUE") {
          throw new Error("An active category with this name already exists.");
        }
      }
    }

    const row = [
      id,
      validated.name !== undefined ? validated.name : currentObj.name,
      validated.icon !== undefined ? validated.icon : currentObj.icon,
      validated.color !== undefined ? validated.color : currentObj.color,
      validated.type !== undefined ? validated.type : currentObj.type,
      validated.monthly_budget !== undefined ? validated.monthly_budget : currentObj.monthly_budget,
      currentObj.is_active
    ];

    Utils.updateRow("Categories", currentObj._rowIndex, row);
    Utils.log("CAT_EDIT", "Category", id, `Updated: ${row[1]}`);
    Utils.invalidateCache("dashboard_summary");

    // Return formatted success mimicking frontend expectations
    return Utils.buildSuccess({
      id: id,
      name: row[1],
      icon: row[2],
      color: row[3],
      type: row[4],
      monthly_budget: row[5]
    });
  },

  /**
   * Deletes a category if it has no associated transactions.
   */
  deleteCategory: function(payload) {
    const id = payload.id;
    Utils.validateRequired(payload, ['id']);
    
    const { map } = this._getCategoryData();
    const currentObj = map[id];
    
    if (!currentObj) {
      throw new Error("Category not found.");
    }

    // Strict validation: Prevent deleting if transactions are linked
    const txs = Utils.readSheetData("Transactions");
    let hasTxs = false;
    
    for (let i = 0; i < txs.length; i++) {
      if (txs[i].category_id === id) {
        hasTxs = true;
        break;
      }
    }
    
    if (hasTxs) {
      throw new Error("Cannot delete a category with linked transactions. Please archive/deactivate it, or delete its transactions first.");
    }

    Utils.deleteRow("Categories", currentObj._rowIndex);
    Utils.log("CAT_DELETE", "Category", id, "Category permanently removed");
    Utils.invalidateCache("dashboard_summary");
    
    return Utils.buildSuccess({ message: "Category deleted successfully." });
  }

};
