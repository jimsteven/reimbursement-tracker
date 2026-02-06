/**
 * ReimbursementTracker - Standalone Backend
 * FREE reimbursement tracking for HMO claims
 * Version: 1.4.0
 * 
 * SETUP:
 * 1. Run setSpreadsheetId('YOUR_SPREADSHEET_ID') to connect your spreadsheet
 * 2. Deploy as web app with "Anyone" access
 * 3. Copy deployment URL to rt_openapi.yaml
 * 
 * v1.4.0 CHANGES:
 * - 4 input types: Receipt, App Screenshot, Email, Bank Screenshot
 * - Silent duplicate checking before confirmation
 * - Fixed BenefitTypes from ReimbursementBenefits sheet
 * - Bank screenshot flow for marking claims as paid
 *
 * v1.5.0 CHANGES:
 * - ReferenceData sheet as source of truth for Source, BenefitType, ClaimType
 * - Menu: Initialize/view ReferenceData
 * - API: rtGetReferenceData, rtAddReferenceItem actions
 * - Validation uses ReferenceData sheet instead of hardcoded lists
 */

const RT_VERSION = '1.5.0';

// ============================================
// MENU & UI SETUP
// ============================================

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📋 ReimbursementTracker')
    .addItem('🔧 Setup: Connect This Sheet', 'setupConnectSheet')
    .addItem('🔗 Setup: Connect to BudgetQuest', 'setupBudgetQuestIntegration')
    .addSeparator()
    .addItem('📊 Initialize Reimbursements Sheet', 'menuInitializeSheet')
    .addItem('📚 Initialize Reference Data', 'menuInitializeReferenceData')
    .addItem('🔄 Migrate to v1.2 Schema', 'menuMigrateToV12')
    .addItem('📈 View Summary', 'menuShowSummary')
    .addSeparator()
    .addItem('ℹ️ View Configuration', 'menuShowConfig')
    .addToUi();
}

/**
 * Menu: Migrate to v1.2 schema
 */
function menuMigrateToV12() {
  const ui = SpreadsheetApp.getUi();
  
  const confirm = ui.alert(
    '🔄 Migrate to v1.2 Schema',
    'This will add new columns (ClaimType, ClaimID, AmountDisapproved) to support HMO claims.\n\n' +
    'Existing data will be preserved.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (confirm === ui.Button.YES) {
    const result = rtMigrateToV12();
    if (result.success) {
      ui.alert('✅ ' + result.message + (result.rowsMigrated ? '\nRows migrated: ' + result.rowsMigrated : ''), ui.ButtonSet.OK);
    } else {
      ui.alert('❌ Error: ' + result.error, ui.ButtonSet.OK);
    }
  }
}

/**
 * Setup: Connect this spreadsheet to the API
 */
function setupConnectSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetId = ss.getId();
  
  const result = ui.alert(
    '🔧 Connect This Sheet',
    'This will configure ReimbursementTracker to use this spreadsheet.\n\n' +
    'Spreadsheet ID: ' + sheetId + '\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (result === ui.Button.YES) {
    setSpreadsheetId(sheetId);
    
    // Also initialize the Reimbursements sheet if it doesn't exist
    rtInitializeSheet();
    
    ui.alert(
      '✅ Setup Complete',
      'ReimbursementTracker is now connected to this spreadsheet!\n\n' +
      '• Reimbursements sheet has been created/verified\n' +
      '• You can now use the Custom GPT to track reimbursements\n\n' +
      'API URL: https://script.google.com/macros/s/AKfycbw7BOmUd6Erm8wlU1oVd1_y7mTQx7LACKj2duN2jdkZo6LuvMDPQ4QZg10SzFfN_hlRuA/exec',
      ui.ButtonSet.OK
    );
  }
}

/**
 * Setup: Connect to BudgetQuest for integration features
 */
function setupBudgetQuestIntegration() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    '🔗 Connect to BudgetQuest',
    'Enter your BudgetQuest API URL to enable integration features:\n' +
    '(This allows syncing NetCost when reimbursements are paid)\n\n' +
    'Example: https://script.google.com/macros/s/AKfycby.../exec',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const url = response.getResponseText().trim();
    if (url) {
      setBudgetQuestApiUrl(url);
      ui.alert(
        '✅ BudgetQuest Connected',
        'Integration enabled! When reimbursements are marked as "paid", ' +
        'the NetCost will be synced to your BudgetQuest transactions.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('No URL provided. Integration not configured.', ui.ButtonSet.OK);
    }
  }
}

/**
 * Menu: Initialize Reimbursements sheet
 */
function menuInitializeSheet() {
  const result = rtInitializeSheet();
  const ui = SpreadsheetApp.getUi();
  
  if (result.success) {
    ui.alert('✅ Reimbursements sheet initialized!', ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Error: ' + result.error, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Initialize ReferenceData sheet with default values
 */
function menuInitializeReferenceData() {
  const result = rtInitializeReferenceData();
  const ui = SpreadsheetApp.getUi();
  
  if (result.success) {
    ui.alert('✅ ' + result.message, ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Error: ' + result.error, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Show summary in dialog
 */
function menuShowSummary() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const summary = rtGetSummary({});
    
    if (!summary.success) {
      ui.alert('❌ Error: ' + summary.error, ui.ButtonSet.OK);
      return;
    }
    
    const s = summary.summary;
    let message = '📊 REIMBURSEMENT SUMMARY\n\n';
    message += '💰 Total Claimed: ₱' + s.totalClaimed.toLocaleString() + '\n';
    message += '✅ Total Approved: ₱' + s.totalApproved.toLocaleString() + '\n';
    message += '💵 Total Paid: ₱' + s.totalPaid.toLocaleString() + '\n';
    message += '⏳ Total Pending: ₱' + s.totalPending.toLocaleString() + '\n';
    message += '📝 Total Claims: ' + s.count + '\n\n';
    
    if (summary.bySource.length > 0) {
      message += '📁 BY SOURCE:\n';
      summary.bySource.forEach(src => {
        message += '  • ' + src.source + ': ₱' + src.claimed.toLocaleString() + 
                   ' (' + src.count + ' claims)\n';
      });
    }
    
    ui.alert('Reimbursement Summary', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('❌ Error: ' + error.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu: Show current configuration
 */
function menuShowConfig() {
  const ui = SpreadsheetApp.getUi();
  const config = rtGetConfig();
  
  let message = '⚙️ CURRENT CONFIGURATION\n\n';
  message += '📊 Spreadsheet: ' + (config.hasSpreadsheet ? '✅ Connected' : '❌ Not connected') + '\n';
  if (config.spreadsheetId) {
    message += '   ID: ' + config.spreadsheetId + '\n';
  }
  message += '\n🔗 BudgetQuest: ' + (config.hasBudgetQuestIntegration ? '✅ Connected' : '❌ Not connected') + '\n';
  
  message += '\n📋 API Endpoint:\n';
  message += 'https://script.google.com/macros/s/AKfycbw7BOmUd6Erm8wlU1oVd1_y7mTQx7LACKj2duN2jdkZo6LuvMDPQ4QZg10SzFfN_hlRuA/exec';
  
  ui.alert('Configuration', message, ui.ButtonSet.OK);
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Set the spreadsheet ID (run once from Apps Script editor)
 */
function setSpreadsheetId(id) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  return { success: true, message: 'Spreadsheet ID saved: ' + id };
}

/**
 * Set BudgetQuest API URL for integration features
 */
function setBudgetQuestApiUrl(url) {
  PropertiesService.getScriptProperties().setProperty('BUDGETQUEST_API_URL', url);
  return { success: true, message: 'BudgetQuest API URL saved' };
}

/**
 * Get the configured spreadsheet
 */
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('Spreadsheet ID not configured. Run setSpreadsheetId() first.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Get BudgetQuest API URL
 */
function getBudgetQuestApiUrl() {
  return PropertiesService.getScriptProperties().getProperty('BUDGETQUEST_API_URL');
}

// ============================================
// WEB APP HANDLERS
// ============================================

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    
    if (params.action) {
      return handleAction(params);
    }
    
    // Simple test endpoint
    if (params.test === 'true') {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: 'ReimbursementTracker API is working!',
        timestamp: new Date().toISOString(),
        spreadsheetConfigured: !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: 'ReimbursementTracker API - Use ?action=rtPing to test'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('doGet error:', error);
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    let data = {};
    
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        // Not JSON, use params
      }
    }
    
    // Merge query params and body
    const merged = { ...params, ...data };
    
    if (merged.action) {
      return handleAction(merged);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: 'No action specified' 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('doPost error:', error);
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle API actions
 */
function handleAction(params) {
  try {
    const action = params.action;
    console.log('handleAction:', action);
    
    const data = { ...params };
    let result;
    
    switch (action) {
      case 'rtAddReimbursement':
        result = rtAddReimbursement(data);
        break;
      case 'rtGetSummary':
        result = rtGetSummary(data);
        break;
      case 'rtUpdateStatus':
        result = rtUpdateStatus(data);
        break;
      case 'rtListReimbursements':
        result = rtListReimbursements(data);
        break;
      case 'rtCheckDuplicate':
        result = rtCheckDuplicate(data);
        break;
      case 'rtPing':
        result = { success: true, message: 'ReimbursementTracker API is working!' };
        break;
      case 'rtInit':
        result = rtInitializeSheet();
        break;
      case 'rtGetConfig':
        result = rtGetConfig();
        break;
      case 'rtMigrateToV12':
        result = rtMigrateToV12();
        break;
      // BudgetQuest Integration
      case 'rtLinkToBudgetQuest':
        result = rtLinkToBudgetQuest(data);
        break;
      case 'rtSyncNetCost':
        result = rtSyncNetCost(data);
        break;
      case 'rtGetReferenceData':
        result = rtGetReferenceData(data);
        break;
      case 'rtAddReferenceItem':
        result = rtAddReferenceItem(data);
        break;
      case 'rtInitReferenceData':
        result = rtInitializeReferenceData();
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('handleAction error:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate unique reimbursement ID
 */
function rtGenerateId() {
  return 'R-' + Date.now();
}

/**
 * Get header indices for a sheet
 */
function rtGetHeaderIndices(headers) {
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  return idx;
}

/**
 * Safely format a date value to YYYY-MM-DD string
 */
function safeFormatDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

/**
 * Get current configuration
 */
function rtGetConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    success: true,
    spreadsheetId: props.getProperty('SPREADSHEET_ID') || null,
    budgetQuestApiUrl: props.getProperty('BUDGETQUEST_API_URL') || null,
    hasSpreadsheet: !!props.getProperty('SPREADSHEET_ID'),
    hasBudgetQuestIntegration: !!props.getProperty('BUDGETQUEST_API_URL')
  };
}

// ============================================
// CORE API FUNCTIONS
// ============================================

/**
 * Initialize the ReferenceData sheet with default values
 */
function rtInitializeReferenceData() {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ReferenceData');
    
    if (!sheet) {
      sheet = ss.insertSheet('ReferenceData');
    }
    
    const headers = ['Type', 'Value', 'DisplayName', 'Description'];
    
    if (sheet.getLastRow() === 0 || sheet.getLastRow() === 1) {
      sheet.clear();
      
      const data = [
        headers,
        // Sources
        ['Source', 'Avega Managed Care', 'Avega Managed Care', 'HMO provider'],
        // Benefit Types
        ['BenefitType', 'maternity_assistance', 'Maternity Assistance', ''],
        ['BenefitType', 'medicine_reimbursement', 'Medicine (Confinement)', ''],
        ['BenefitType', 'pet_support', 'Pet Support Program', ''],
        ['BenefitType', 'optical', 'Optical Benefit', ''],
        ['BenefitType', 'psychology_sessions', 'Psychology Sessions', ''],
        ['BenefitType', 'dental_reimbursement', 'Dental (Provincial)', ''],
        // Claim Types
        ['ClaimType', 'OT', 'Outpatient Treatment', ''],
        ['ClaimType', 'OL', 'Outpatient Lab', ''],
        ['ClaimType', 'DP', 'Dental Procedure', ''],
        ['ClaimType', 'APE', 'Annual Physical Exam', ''],
        ['ClaimType', 'PS', 'Pet Support', ''],
        ['ClaimType', 'OP', 'Optical', ''],
        ['ClaimType', 'PY', 'Psychology', ''],
        ['ClaimType', 'MT', 'Maternity', ''],
        ['ClaimType', 'MR', 'Medicine Reimbursement', '']
      ];
      
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      
      return { success: true, message: 'ReferenceData sheet initialized with ' + (data.length - 1) + ' entries' };
    }
    
    return { success: true, message: 'ReferenceData sheet already exists with data' };
  } catch (error) {
    console.error('rtInitializeReferenceData error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get reference data, optionally filtered by type
 */
function rtGetReferenceData(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('ReferenceData');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: false, error: 'ReferenceData sheet not found or empty. Use rtInitReferenceData to create it.' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    
    const typeFilter = data && data.type ? data.type : null;
    
    const results = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      const type = row[idx['Type']];
      
      if (typeFilter && type !== typeFilter) continue;
      
      results.push({
        type: type,
        value: row[idx['Value']],
        displayName: row[idx['DisplayName']] || '',
        description: row[idx['Description']] || ''
      });
    }
    
    // Group by type
    const grouped = {};
    results.forEach(item => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });
    
    return {
      success: true,
      referenceData: results,
      grouped: grouped,
      count: results.length
    };
  } catch (error) {
    console.error('rtGetReferenceData error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a new item to the ReferenceData sheet
 */
function rtAddReferenceItem(data) {
  try {
    if (!data.type) {
      return { success: false, error: 'type is required (Source, BenefitType, or ClaimType)' };
    }
    if (!data.value) {
      return { success: false, error: 'value is required' };
    }
    
    const validTypes = ['Source', 'BenefitType', 'ClaimType'];
    if (!validTypes.includes(data.type)) {
      return { success: false, error: 'Invalid type. Must be one of: ' + validTypes.join(', ') };
    }
    
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('ReferenceData');
    
    if (!sheet) {
      const initResult = rtInitializeReferenceData();
      if (!initResult.success) return initResult;
      sheet = ss.getSheetByName('ReferenceData');
    }
    
    // Check for duplicates
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });
    
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idx['Type']] === data.type && allData[i][idx['Value']] === data.value) {
        return { success: false, error: 'Entry already exists: ' + data.type + ' = ' + data.value };
      }
    }
    
    const row = [
      data.type,
      data.value,
      data.displayName || data.value,
      data.description || ''
    ];
    
    sheet.appendRow(row);
    
    return {
      success: true,
      message: data.type + ' "' + data.value + '" added to reference data',
      item: { type: data.type, value: data.value, displayName: data.displayName || data.value }
    };
  } catch (error) {
    console.error('rtAddReferenceItem error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize the Reimbursements sheet
 */
function rtInitializeSheet() {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet) {
      sheet = ss.insertSheet('Reimbursements');
    }
    
    const headers = [
      'ReimbursementID', 'Category', 'Source', 'BenefitType', 'ClaimType', 'ClaimID',
      'Description', 'AmountClaimed', 'AmountApproved', 'AmountDisapproved', 'Status',
      'SubmittedDate', 'ApprovedDate', 'PaidDate', 'PurchaseDate', 'LinkedTransactionID',
      'ReceiptImageURL', 'Notes', 'CreatedAt', 'UpdatedAt', 'ReceiptNumber'
    ];
    
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    return { success: true, message: 'Reimbursements sheet initialized', headers: headers };
  } catch (error) {
    console.error('rtInitializeSheet error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for duplicate reimbursement by ClaimID or similar attributes
 */
function rtCheckDuplicate(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, isDuplicate: false };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = rtGetHeaderIndices(headers);
    
    const duplicates = [];
    
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      let isMatch = false;
      let matchReason = '';
      
      // Check by ClaimID (exact match) - most reliable for HMO
      if (data.claimId && row[idx['ClaimID']] === data.claimId) {
        isMatch = true;
        matchReason = 'Same ClaimID: ' + data.claimId;
      }
      
      // Check by ReimbursementID (if using ClaimID as ID)
      if (!isMatch && data.claimId && row[idx['ReimbursementID']] === data.claimId) {
        isMatch = true;
        matchReason = 'Same ReimbursementID: ' + data.claimId;
      }
      
      // Check by ReceiptNumber (exact match)
      if (!isMatch && data.receiptNumber && idx['ReceiptNumber'] !== undefined) {
        const rowReceiptNum = String(row[idx['ReceiptNumber']] || '').trim();
        const inputReceiptNum = String(data.receiptNumber).trim();
        if (rowReceiptNum && rowReceiptNum === inputReceiptNum) {
          isMatch = true;
          matchReason = 'Same ReceiptNumber: ' + inputReceiptNum;
        }
      }
      
      // Quarterly match: pending + same amount + same source + same quarter
      // Quarters: Jan-Mar (Q1), Apr-Jun (Q2), Jul-Sep (Q3), Oct-Dec (Q4)
      if (!isMatch && data.amountClaimed && data.source) {
        const rowSource = row[idx['Source']];
        const rowAmount = parseFloat(row[idx['AmountClaimed']]) || 0;
        const rowStatus = row[idx['Status']];
        const rowDate = row[idx['PurchaseDate']] ? new Date(row[idx['PurchaseDate']]) : null;
        const inputDate = data.date ? new Date(data.date) : null;
        
        const amountMatch = Math.abs(rowAmount - parseFloat(data.amountClaimed)) < 0.01;
        const sourceMatch = rowSource === data.source;
        const isPending = rowStatus === 'pending';
        
        // Check if both dates fall in the same quarter
        let sameQuarter = false;
        if (rowDate && inputDate) {
          const rowQ = Math.floor(rowDate.getMonth() / 3);
          const inputQ = Math.floor(inputDate.getMonth() / 3);
          sameQuarter = rowQ === inputQ && rowDate.getFullYear() === inputDate.getFullYear();
        }
        
        // Provider/description bonus (optional, adds confidence)
        const rowDesc = (row[idx['Description']] || '').toLowerCase();
        const inputDesc = (data.description || '').toLowerCase();
        const descMatch = inputDesc && rowDesc && (
          rowDesc.includes(inputDesc) || inputDesc.includes(rowDesc) ||
          rowDesc === inputDesc
        );
        
        if (amountMatch && sourceMatch && isPending && sameQuarter) {
          isMatch = true;
          matchReason = 'Same source + amount + pending + same quarter' + 
            (descMatch ? ' + description match' : '');
        }
      }
      
      if (isMatch) {
        duplicates.push({
          reimbursementId: row[idx['ReimbursementID']],
          claimId: row[idx['ClaimID']] || null,
          claimType: row[idx['ClaimType']] || null,
          benefitType: row[idx['BenefitType']] || null,
          source: row[idx['Source']],
          description: row[idx['Description']] || null,
          amountClaimed: parseFloat(row[idx['AmountClaimed']]) || 0,
          amountApproved: parseFloat(row[idx['AmountApproved']]) || 0,
          amountDisapproved: parseFloat(row[idx['AmountDisapproved']]) || 0,
          status: row[idx['Status']],
          purchaseDate: safeFormatDate(row[idx['PurchaseDate']]),
          submittedDate: safeFormatDate(row[idx['SubmittedDate']]),
          approvedDate: safeFormatDate(row[idx['ApprovedDate']]),
          receiptNumber: row[idx['ReceiptNumber']] || null,
          matchReason: matchReason
        });
      }
    }
    
    return {
      success: true,
      isDuplicate: duplicates.length > 0,
      duplicateCount: duplicates.length,
      duplicates: duplicates
    };
  } catch (error) {
    console.error('rtCheckDuplicate error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a new reimbursement
 */
function rtAddReimbursement(data) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet) {
      const initResult = rtInitializeSheet();
      if (!initResult.success) return initResult;
      sheet = ss.getSheetByName('Reimbursements');
    }
    
    // Check for duplicates first (unless explicitly skipped)
    if (!data.skipDuplicateCheck) {
      const dupCheck = rtCheckDuplicate(data);
      if (dupCheck.isDuplicate) {
        return {
          success: false,
          isDuplicate: true,
          error: 'Duplicate claim detected',
          duplicates: dupCheck.duplicates,
          message: 'This claim appears to already exist. Use skipDuplicateCheck=true to add anyway.'
        };
      }
    }
    
    // Validate required fields
    if (!data.category) {
      return { success: false, error: 'category is required (hmo, business, client, personal, other)' };
    }
    if (!data.source) {
      return { success: false, error: 'source is required (who will reimburse)' };
    }
    if (!data.description) {
      return { success: false, error: 'description is required' };
    }
    if (!data.amountClaimed && data.amountClaimed !== 0) {
      return { success: false, error: 'amountClaimed is required' };
    }
    if (!data.date) {
      return { success: false, error: 'date is required (YYYY-MM-DD)' };
    }
    
    const validCategories = ['hmo', 'business', 'client', 'personal', 'other'];
    if (!validCategories.includes(data.category.toLowerCase())) {
      return { success: false, error: 'Invalid category. Must be one of: ' + validCategories.join(', ') };
    }
    
    // Validate benefitType and claimType against ReferenceData sheet if available
    try {
      const refData = rtGetReferenceData({});
      if (refData.success && refData.grouped) {
        if (data.benefitType && refData.grouped['BenefitType']) {
          const validBenefits = refData.grouped['BenefitType'].map(b => b.value);
          if (!validBenefits.includes(data.benefitType)) {
            return { success: false, error: 'Invalid benefitType "' + data.benefitType + '". Valid: ' + validBenefits.join(', ') };
          }
        }
        if (data.claimType && refData.grouped['ClaimType']) {
          const validClaims = refData.grouped['ClaimType'].map(c => c.value);
          if (!validClaims.includes(data.claimType)) {
            return { success: false, error: 'Invalid claimType "' + data.claimType + '". Valid: ' + validClaims.join(', ') };
          }
        }
      }
    } catch (refErr) {
      // ReferenceData sheet not available, skip validation
    }
    
    const now = new Date();
    const purchaseDate = new Date(data.date);
    const reimbId = data.claimId || rtGenerateId();
    
    // Normalize status (map denied -> rejected for consistency, but keep original if valid)
    let status = data.status ? data.status.toLowerCase() : 'pending';
    const validStatuses = ['pending', 'approved', 'paid', 'rejected', 'expired', 'lacking', 'denied'];
    if (!validStatuses.includes(status)) {
      status = 'pending';
    }
    
    const row = [
      reimbId,                                        // ReimbursementID
      data.category.toLowerCase(),                    // Category
      data.source,                                    // Source
      data.benefitType || '',                         // BenefitType (pet_support, optical, etc.)
      data.claimType || '',                           // ClaimType (OT, OL, DP, APE, etc.)
      data.claimId || '',                             // ClaimID (67-RM012606416A)
      data.description,                               // Description
      parseFloat(data.amountClaimed) || 0,            // AmountClaimed
      parseFloat(data.amountApproved) || 0,           // AmountApproved
      parseFloat(data.amountDisapproved) || 0,        // AmountDisapproved
      status,                                         // Status
      data.submittedDate ? new Date(data.submittedDate) : now,  // SubmittedDate
      data.approvedDate ? new Date(data.approvedDate) : '',     // ApprovedDate
      data.paidDate ? new Date(data.paidDate) : '',   // PaidDate
      purchaseDate,                                   // PurchaseDate
      data.linkedTransactionId || '',                 // LinkedTransactionID
      data.receiptImageURL || '',                     // ReceiptImageURL
      data.notes || '',                               // Notes
      now,                                            // CreatedAt
      now,                                            // UpdatedAt
      data.receiptNumber || ''                        // ReceiptNumber
    ];
    
    sheet.appendRow(row);
    
    return {
      success: true,
      reimbursementId: reimbId,
      status: status,
      message: 'Reimbursement added successfully',
      category: data.category.toLowerCase(),
      source: data.source,
      amountClaimed: parseFloat(data.amountClaimed) || 0,
      amountApproved: parseFloat(data.amountApproved) || 0,
      amountDisapproved: parseFloat(data.amountDisapproved) || 0,
      claimType: data.claimType || null,
      claimId: data.claimId || null,
      receiptNumber: data.receiptNumber || null
    };
  } catch (error) {
    console.error('rtAddReimbursement error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get reimbursement summary with optional filters
 */
function rtGetSummary(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return {
        success: true,
        summary: { totalClaimed: 0, totalApproved: 0, totalPaid: 0, totalPending: 0, count: 0 },
        byCategory: [],
        bySource: []
      };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = rtGetHeaderIndices(headers);
    
    const dateFrom = data && data.dateFrom ? new Date(data.dateFrom) : null;
    const dateTo = data && data.dateTo ? new Date(data.dateTo) : null;
    const statusFilter = data && data.status 
      ? (Array.isArray(data.status) ? data.status : [data.status])
      : null;
    
    let totalClaimed = 0, totalApproved = 0, totalPaid = 0, totalPending = 0, count = 0;
    const byCategory = {};
    const bySource = {};
    
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      const category = row[idx['Category']];
      const source = row[idx['Source']];
      const status = row[idx['Status']];
      const amountClaimed = parseFloat(row[idx['AmountClaimed']]) || 0;
      const amountApproved = parseFloat(row[idx['AmountApproved']]) || 0;
      const purchaseDate = row[idx['PurchaseDate']] ? new Date(row[idx['PurchaseDate']]) : null;
      
      // Apply filters
      if (data && data.category && category !== data.category.toLowerCase()) continue;
      if (data && data.source && source !== data.source) continue;
      if (statusFilter && !statusFilter.includes(status)) continue;
      if (dateFrom && purchaseDate && purchaseDate < dateFrom) continue;
      if (dateTo && purchaseDate && purchaseDate > dateTo) continue;
      
      count++;
      totalClaimed += amountClaimed;
      
      if (status === 'approved') {
        totalApproved += amountApproved || amountClaimed;
      } else if (status === 'paid') {
        totalApproved += amountApproved || amountClaimed;
        totalPaid += amountApproved || amountClaimed;
      } else if (status === 'pending') {
        totalPending += amountClaimed;
      }
      
      // By category
      if (!byCategory[category]) {
        byCategory[category] = { claimed: 0, approved: 0, paid: 0, pending: 0, count: 0 };
      }
      byCategory[category].claimed += amountClaimed;
      byCategory[category].count++;
      if (status === 'approved' || status === 'paid') {
        byCategory[category].approved += amountApproved || amountClaimed;
      }
      if (status === 'paid') {
        byCategory[category].paid += amountApproved || amountClaimed;
      }
      if (status === 'pending') {
        byCategory[category].pending += amountClaimed;
      }
      
      // By source
      if (!bySource[source]) {
        bySource[source] = { claimed: 0, approved: 0, paid: 0, pending: 0, count: 0 };
      }
      bySource[source].claimed += amountClaimed;
      bySource[source].count++;
      if (status === 'approved' || status === 'paid') {
        bySource[source].approved += amountApproved || amountClaimed;
      }
      if (status === 'paid') {
        bySource[source].paid += amountApproved || amountClaimed;
      }
      if (status === 'pending') {
        bySource[source].pending += amountClaimed;
      }
    }
    
    return {
      success: true,
      summary: {
        totalClaimed: totalClaimed,
        totalApproved: totalApproved,
        totalPaid: totalPaid,
        totalPending: totalPending,
        count: count
      },
      byCategory: Object.entries(byCategory).map(([category, d]) => ({ category, ...d })),
      bySource: Object.entries(bySource).map(([source, d]) => ({ source, ...d }))
    };
  } catch (error) {
    console.error('rtGetSummary error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update reimbursement - status and/or any other fields
 * Supports updating: status, claimId, claimType, benefitType, description,
 * amountApproved, amountDisapproved, approvedDate, submittedDate, paidDate, notes, receiptNumber
 */
function rtUpdateStatus(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet) {
      return { success: false, error: 'Reimbursements sheet not found' };
    }
    
    if (!data.reimbursementId) {
      return { success: false, error: 'reimbursementId is required' };
    }
    
    const validStatuses = ['pending', 'approved', 'paid', 'rejected', 'expired', 'lacking', 'denied'];
    if (data.status && !validStatuses.includes(data.status.toLowerCase())) {
      return { success: false, error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = rtGetHeaderIndices(headers);
    
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idx['ReimbursementID']] === data.reimbursementId) {
        const rowNum = i + 1;
        const now = new Date();
        const updatedFields = [];
        
        // Update status
        if (data.status) {
          const newStatus = data.status.toLowerCase();
          sheet.getRange(rowNum, idx['Status'] + 1).setValue(newStatus);
          updatedFields.push('status → ' + newStatus);
          
          if ((newStatus === 'approved' || newStatus === 'paid') && !allData[i][idx['ApprovedDate']]) {
            const approvedDate = data.approvedDate ? new Date(data.approvedDate) : now;
            sheet.getRange(rowNum, idx['ApprovedDate'] + 1).setValue(approvedDate);
            updatedFields.push('approvedDate');
          }
          
          if (newStatus === 'paid') {
            const paidDate = data.paidDate ? new Date(data.paidDate) : now;
            sheet.getRange(rowNum, idx['PaidDate'] + 1).setValue(paidDate);
            updatedFields.push('paidDate');
            
            const linkedTxId = allData[i][idx['LinkedTransactionID']];
            if (linkedTxId && getBudgetQuestApiUrl()) {
              rtSyncNetCost({
                transactionId: linkedTxId,
                amountReimbursed: data.amountApproved || allData[i][idx['AmountClaimed']]
              });
            }
          }
        }
        
        // Update ClaimID
        if (data.claimId) {
          sheet.getRange(rowNum, idx['ClaimID'] + 1).setValue(data.claimId);
          updatedFields.push('claimId → ' + data.claimId);
        }
        
        // Update ClaimType
        if (data.claimType) {
          sheet.getRange(rowNum, idx['ClaimType'] + 1).setValue(data.claimType);
          updatedFields.push('claimType → ' + data.claimType);
        }
        
        // Update BenefitType
        if (data.benefitType) {
          sheet.getRange(rowNum, idx['BenefitType'] + 1).setValue(data.benefitType);
          updatedFields.push('benefitType → ' + data.benefitType);
        }
        
        // Update Description
        if (data.description) {
          sheet.getRange(rowNum, idx['Description'] + 1).setValue(data.description);
          updatedFields.push('description');
        }
        
        // Update amounts
        if (data.amountApproved !== undefined) {
          sheet.getRange(rowNum, idx['AmountApproved'] + 1).setValue(parseFloat(data.amountApproved) || 0);
          updatedFields.push('amountApproved → ' + data.amountApproved);
        }
        if (data.amountDisapproved !== undefined) {
          sheet.getRange(rowNum, idx['AmountDisapproved'] + 1).setValue(parseFloat(data.amountDisapproved) || 0);
          updatedFields.push('amountDisapproved → ' + data.amountDisapproved);
        }
        
        // Update dates (explicit, not auto-set)
        if (data.approvedDate && !updatedFields.some(f => f === 'approvedDate')) {
          sheet.getRange(rowNum, idx['ApprovedDate'] + 1).setValue(new Date(data.approvedDate));
          updatedFields.push('approvedDate → ' + data.approvedDate);
        }
        if (data.submittedDate) {
          sheet.getRange(rowNum, idx['SubmittedDate'] + 1).setValue(new Date(data.submittedDate));
          updatedFields.push('submittedDate → ' + data.submittedDate);
        }
        
        // Update ReceiptNumber
        if (data.receiptNumber) {
          sheet.getRange(rowNum, idx['ReceiptNumber'] + 1).setValue(data.receiptNumber);
          updatedFields.push('receiptNumber → ' + data.receiptNumber);
        }
        
        // Append notes
        if (data.notes) {
          const existingNotes = allData[i][idx['Notes']] || '';
          const newNotes = existingNotes ? existingNotes + ' | ' + data.notes : data.notes;
          sheet.getRange(rowNum, idx['Notes'] + 1).setValue(newNotes);
          updatedFields.push('notes');
        }
        
        sheet.getRange(rowNum, idx['UpdatedAt'] + 1).setValue(now);
        
        return {
          success: true,
          reimbursementId: data.reimbursementId,
          newStatus: data.status ? data.status.toLowerCase() : allData[i][idx['Status']],
          updatedFields: updatedFields,
          message: 'Reimbursement updated: ' + updatedFields.join(', ')
        };
      }
    }
    
    return { success: false, error: 'Reimbursement not found: ' + data.reimbursementId };
  } catch (error) {
    console.error('rtUpdateStatus error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * List reimbursements with optional filters
 */
function rtListReimbursements(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, reimbursements: [], count: 0 };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = rtGetHeaderIndices(headers);
    
    const statusFilter = data && data.status 
      ? (Array.isArray(data.status) ? data.status : [data.status])
      : null;
    
    const results = [];
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      const category = row[idx['Category']];
      const source = row[idx['Source']];
      const status = row[idx['Status']];
      
      if (data && data.category && category !== data.category.toLowerCase()) continue;
      if (data && data.source && source !== data.source) continue;
      if (statusFilter && !statusFilter.includes(status)) continue;
      
      results.push({
        reimbursementId: row[idx['ReimbursementID']],
        category: category,
        source: source,
        benefitType: row[idx['BenefitType']] || null,
        claimType: row[idx['ClaimType']] || null,
        claimId: row[idx['ClaimID']] || null,
        description: row[idx['Description']],
        amountClaimed: parseFloat(row[idx['AmountClaimed']]) || 0,
        amountApproved: parseFloat(row[idx['AmountApproved']]) || 0,
        amountDisapproved: parseFloat(row[idx['AmountDisapproved']]) || 0,
        status: status,
        submittedDate: safeFormatDate(row[idx['SubmittedDate']]),
        approvedDate: safeFormatDate(row[idx['ApprovedDate']]),
        paidDate: safeFormatDate(row[idx['PaidDate']]),
        purchaseDate: safeFormatDate(row[idx['PurchaseDate']]),
        linkedTransactionId: row[idx['LinkedTransactionID']] || null,
        receiptImageURL: row[idx['ReceiptImageURL']] || null,
        notes: row[idx['Notes']] || null,
        receiptNumber: row[idx['ReceiptNumber']] || null
      });
    }
    
    const sortBy = data && data.sortBy ? data.sortBy : 'purchaseDate';
    const sortOrder = data && data.sortOrder === 'asc' ? 1 : -1;
    
    results.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (aVal < bVal) return -1 * sortOrder;
      if (aVal > bVal) return 1 * sortOrder;
      return 0;
    });
    
    const limit = data && data.limit ? parseInt(data.limit) : 20;
    const limited = results.slice(0, limit);
    
    return {
      success: true,
      reimbursements: limited,
      count: limited.length,
      totalCount: results.length
    };
  } catch (error) {
    console.error('rtListReimbursements error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// SCHEMA MIGRATION
// ============================================

/**
 * Migrate Reimbursements sheet from v1.0 to v1.2 schema
 * Adds: ClaimType, ClaimID, AmountDisapproved columns
 */
function rtMigrateToV12() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet) {
      return { success: false, error: 'Reimbursements sheet not found' };
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Check if already migrated
    if (headers.includes('ClaimType') && headers.includes('ClaimID') && headers.includes('AmountDisapproved')) {
      return { success: true, message: 'Sheet already at v1.2 schema', migrated: false };
    }
    
    // Expected v1.0 schema (17 columns):
    // ReimbursementID, Category, Source, BenefitType, Description,
    // AmountClaimed, AmountApproved, Status, SubmittedDate, ApprovedDate,
    // PaidDate, PurchaseDate, LinkedTransactionID, ReceiptImageURL, Notes,
    // CreatedAt, UpdatedAt
    
    // New v1.2 schema (20 columns):
    // ReimbursementID, Category, Source, BenefitType, ClaimType, ClaimID,
    // Description, AmountClaimed, AmountApproved, AmountDisapproved, Status,
    // SubmittedDate, ApprovedDate, PaidDate, PurchaseDate, LinkedTransactionID,
    // ReceiptImageURL, Notes, CreatedAt, UpdatedAt
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      // No data, just update headers
      const newHeaders = [
        'ReimbursementID', 'Category', 'Source', 'BenefitType', 'ClaimType', 'ClaimID',
        'Description', 'AmountClaimed', 'AmountApproved', 'AmountDisapproved', 'Status',
        'SubmittedDate', 'ApprovedDate', 'PaidDate', 'PurchaseDate', 'LinkedTransactionID',
        'ReceiptImageURL', 'Notes', 'CreatedAt', 'UpdatedAt', 'ReceiptNumber'
      ];
      sheet.clear();
      sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
      sheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      return { success: true, message: 'Headers updated to v1.2', migrated: true, rowsMigrated: 0 };
    }
    
    // Has data - need to migrate each row
    const allData = sheet.getDataRange().getValues();
    const oldHeaders = allData[0];
    
    // Map old column positions
    const oldIdx = {};
    oldHeaders.forEach((h, i) => { oldIdx[h] = i; });
    
    // Build new data
    const newHeaders = [
      'ReimbursementID', 'Category', 'Source', 'BenefitType', 'ClaimType', 'ClaimID',
      'Description', 'AmountClaimed', 'AmountApproved', 'AmountDisapproved', 'Status',
      'SubmittedDate', 'ApprovedDate', 'PaidDate', 'PurchaseDate', 'LinkedTransactionID',
      'ReceiptImageURL', 'Notes', 'CreatedAt', 'UpdatedAt', 'ReceiptNumber'
    ];
    
    const newData = [newHeaders];
    
    for (let i = 1; i < allData.length; i++) {
      const oldRow = allData[i];
      const newRow = [
        oldRow[oldIdx['ReimbursementID']] || '',
        oldRow[oldIdx['Category']] || '',
        oldRow[oldIdx['Source']] || '',
        oldRow[oldIdx['BenefitType']] || '',
        '',  // ClaimType (new)
        '',  // ClaimID (new)
        oldRow[oldIdx['Description']] || '',
        oldRow[oldIdx['AmountClaimed']] || 0,
        oldRow[oldIdx['AmountApproved']] || 0,
        0,   // AmountDisapproved (new)
        oldRow[oldIdx['Status']] || '',
        oldRow[oldIdx['SubmittedDate']] || '',
        oldRow[oldIdx['ApprovedDate']] || '',
        oldRow[oldIdx['PaidDate']] || '',
        oldRow[oldIdx['PurchaseDate']] || '',
        oldRow[oldIdx['LinkedTransactionID']] || '',
        oldRow[oldIdx['ReceiptImageURL']] || '',
        oldRow[oldIdx['Notes']] || '',
        oldRow[oldIdx['CreatedAt']] || '',
        oldRow[oldIdx['UpdatedAt']] || '',
        oldRow[oldIdx['ReceiptNumber']] || ''
      ];
      newData.push(newRow);
    }
    
    // Clear and write new data
    sheet.clear();
    sheet.getRange(1, 1, newData.length, newHeaders.length).setValues(newData);
    sheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    
    return { 
      success: true, 
      message: 'Migrated to v1.2 schema', 
      migrated: true, 
      rowsMigrated: newData.length - 1 
    };
  } catch (error) {
    console.error('rtMigrateToV12 error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// BUDGETQUEST INTEGRATION (Paid Feature)
// ============================================

/**
 * Link a reimbursement to a BudgetQuest transaction
 */
function rtLinkToBudgetQuest(data) {
  try {
    if (!data.reimbursementId) {
      return { success: false, error: 'reimbursementId is required' };
    }
    if (!data.transactionId) {
      return { success: false, error: 'transactionId (BudgetQuest) is required' };
    }
    
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Reimbursements');
    
    if (!sheet) {
      return { success: false, error: 'Reimbursements sheet not found' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idx = rtGetHeaderIndices(headers);
    
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idx['ReimbursementID']] === data.reimbursementId) {
        const rowNum = i + 1;
        sheet.getRange(rowNum, idx['LinkedTransactionID'] + 1).setValue(data.transactionId);
        sheet.getRange(rowNum, idx['UpdatedAt'] + 1).setValue(new Date());
        
        return {
          success: true,
          reimbursementId: data.reimbursementId,
          linkedTransactionId: data.transactionId,
          message: 'Linked to BudgetQuest transaction'
        };
      }
    }
    
    return { success: false, error: 'Reimbursement not found: ' + data.reimbursementId };
  } catch (error) {
    console.error('rtLinkToBudgetQuest error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync NetCost to BudgetQuest when reimbursement is paid
 * Calls BudgetQuest API to update the transaction's NetCost field
 */
function rtSyncNetCost(data) {
  try {
    const apiUrl = getBudgetQuestApiUrl();
    if (!apiUrl) {
      return { success: false, error: 'BudgetQuest API URL not configured' };
    }
    
    if (!data.transactionId) {
      return { success: false, error: 'transactionId is required' };
    }
    if (data.amountReimbursed === undefined) {
      return { success: false, error: 'amountReimbursed is required' };
    }
    
    // Call BudgetQuest API to update NetCost
    const url = apiUrl + '/exec?action=updateTransactionNetCost' +
      '&transactionId=' + encodeURIComponent(data.transactionId) +
      '&amountReimbursed=' + encodeURIComponent(data.amountReimbursed);
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      muteHttpExceptions: true
    });
    
    const result = JSON.parse(response.getContentText());
    return result;
    
  } catch (error) {
    console.error('rtSyncNetCost error:', error);
    return { success: false, error: error.message };
  }
}
