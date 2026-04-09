function doPost(e) {
  try {
    // Parse JSON safely. If using text/plain for bypass CORS, the content sits in e.postData.contents.
    let postData;
    if (e.postData && e.postData.contents) {
        postData = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
        postData = JSON.parse(e.parameter.data);
    } else {
        throw new Error('No valid post data provided.');
    }
    
    // Allow Origin Headers for proper fetch access if requested (even though text/plain helps)
    if (postData.action === 'registerMember') {
      const result = registerMember(postData.data);
      return ContentService.createTextOutput(JSON.stringify(result))
                           .setMimeType(ContentService.MimeType.JSON);
    } else if (postData.action === 'submitTransaction') {
      const result = submitTransaction(postData.data);
      return ContentService.createTextOutput(JSON.stringify(result))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    throw new Error('Invalid action');
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    if (!e || !e.parameter || !e.parameter.action) {
      // Default view if visited in browser directly
      return ContentService.createTextOutput("Family Network API is running. Please access via frontend app.")
                           .setMimeType(ContentService.MimeType.TEXT);
    }
    
    const action = e.parameter.action;
    let result = {};
    if (action === 'checkMember') {
      result = checkMember(e.parameter.personId);
    } else if (action === 'getAllMembers') {
      result = getAllMembers();
    } else if (action === 'getFinancialReport') {
      result = getFinancialReport();
    } else {
      throw new Error('Invalid action');
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// Configuration Variables
const SHEET_NAME = 'members';
const IMAGE_FOLDER_NAME = 'images';
const TRANSACTIONS_SHEET_NAME = 'transactions';
const SLIPS_FOLDER_NAME = 'slips';
const PAYMENT_FILE_NAME = 'payment';

/**
 * Get or create the 'members' sheet
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add headers if created new
    sheet.appendRow(['Register_date', 'Person_id', 'Name', 'Surname', 'Address', 'Phone', 'Image_URL', 'Birthdate', 'Illness', 'Beneficiary', 'Related', 'Nickname']);
  }
  return sheet;
}

/**
 * Get or create the 'images' folder in Google Drive
 */
function getFolder() {
  const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

/**
 * Check if the 13-digit Person ID exists in the sheet
 * @param {string} personId - The 13 digit ID to check
 * @return {object} - { found: boolean }
 */
function checkMember(personId) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return { found: false };
    
    const headers = data[0];
    const idRegisterDate = headers.indexOf('Register_date') > -1 ? headers.indexOf('Register_date') : 0;
    // Try to find Person_id column, fallback to index 1 if not exactly found
    const findPersonCol = headers.findIndex(h => h.toString().toLowerCase().includes('person_id') || h.toString().toLowerCase().includes('บัตรประชาชน'));
    const idPerson = findPersonCol > -1 ? findPersonCol : 1;
    
    const idName = headers.indexOf('Name') > -1 ? headers.indexOf('Name') : 2;
    const idSurname = headers.indexOf('Surname') > -1 ? headers.indexOf('Surname') : 3;
    const idAddress = headers.indexOf('Address') > -1 ? headers.indexOf('Address') : 4;
    const idPhone = headers.indexOf('Phone') > -1 ? headers.indexOf('Phone') : 5;
    const idImage = headers.indexOf('Image_URL') > -1 ? headers.indexOf('Image_URL') : 6;
    const idBirthdate = headers.indexOf('Birthdate') > -1 ? headers.indexOf('Birthdate') : 7;
    const idIllness = headers.indexOf('Illness') > -1 ? headers.indexOf('Illness') : 8;
    const idBeneficiary = headers.indexOf('Beneficiary') > -1 ? headers.indexOf('Beneficiary') : 9;
    const idRelated = headers.indexOf('Related') > -1 ? headers.indexOf('Related') : 10;
    const idNicknameCol = headers.findIndex(h => h.toString().toLowerCase().includes('nickname') || h.toString().toLowerCase().includes('ชื่อเล่น'));
    const idNickname = idNicknameCol > -1 ? idNicknameCol : 11;

    for (let i = 1; i < data.length; i++) {
        if (String(data[i][idPerson]).trim() === String(personId).trim()) {
            const member = {
                registerDate: idRegisterDate !== -1 && data[i][idRegisterDate] !== undefined ? data[i][idRegisterDate] : '',
                personId: String(data[i][idPerson]).trim(),
                name: data[i][idName],
                surname: data[i][idSurname],
                address: data[i][idAddress],
                phone: data[i][idPhone],
                image: data[i][idImage],
                birthdate: idBirthdate !== -1 && data[i][idBirthdate] !== undefined ? data[i][idBirthdate] : '',
                illness: idIllness !== -1 && data[i][idIllness] !== undefined ? data[i][idIllness] : '',
                beneficiary: idBeneficiary !== -1 && data[i][idBeneficiary] !== undefined ? data[i][idBeneficiary] : '',
                related: idRelated !== -1 && data[i][idRelated] !== undefined ? data[i][idRelated] : '',
                nickname: idNickname !== -1 && data[i][idNickname] !== undefined ? data[i][idNickname] : ''
            };
            return { found: true, member: member, isAdmin: isAdmin(personId) };
        }
    }
    return { found: false, isAdmin: isAdmin(personId) };
  } catch (error) {
    return { error: error.toString() };
  }
}

/**
 * Register a new member including uploading image
 * @param {object} data - Form data
 * @return {object} - { success: boolean }
 */
function registerMember(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const folder = getFolder();
    let imageUrl = '';
    
    // Extra safety measure
    const check = checkMember(data.personId);
    if (check.found) {
        throw new Error('Member ID already exists. Please login instead.');
    }

    // Process image file
    if (data.imageFile && data.imageName) {
      // Find content type and base64 string
      const contentType = data.imageFile.substring(5, data.imageFile.indexOf(';'));
      const base64Data = data.imageFile.substring(data.imageFile.indexOf('base64,') + 7);
      
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, data.personId + '_' + data.imageName);
      const file = folder.createFile(blob);
      
      // Allow image to be viewed by anyone with the link
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId();
    }

    // Save to Google Sheet
    const sheet = getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const requiredHeaders = ['Register_date', 'Person_id', 'Name', 'Surname', 'Address', 'Phone', 'Image_URL', 'Birthdate', 'Illness', 'Beneficiary', 'Related', 'Nickname'];
    
    // Check and add missing headers to maintain correct column alignment
    requiredHeaders.forEach((h, index) => {
        if (headers.indexOf(h) === -1) {
            sheet.getRange(1, index + 1).setValue(h);
        }
    });

    // Re-check headers after potentially adding new ones
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colIdx = (h) => currentHeaders.indexOf(h);

    const rowData = new Array(requiredHeaders.length).fill('');
    rowData[colIdx('Register_date')] = data.registerDate || '';
    rowData[colIdx('Person_id')] = data.personId ? "'" + String(data.personId) : '';
    rowData[colIdx('Name')] = data.name || '';
    rowData[colIdx('Surname')] = data.surname || '';
    rowData[colIdx('Address')] = data.address || '';
    rowData[colIdx('Phone')] = data.phone ? "'" + String(data.phone) : '';
    rowData[colIdx('Image_URL')] = imageUrl || '';
    rowData[colIdx('Birthdate')] = data.birthdate || '';
    rowData[colIdx('Illness')] = data.illness || '';
    rowData[colIdx('Beneficiary')] = data.beneficiary || '';
    rowData[colIdx('Related')] = data.related || '';
    rowData[colIdx('Nickname')] = data.nickname || '';

    sheet.appendRow(rowData);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Get all members from sheet, showing only Name, Surname, Image
 * @return {object} - { success: boolean, members: Array }
 */
function getAllMembers() {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    // Return empty if only header exists
    if (data.length <= 1) return { success: true, members: [] };
    
    const headers = data[0];
    const members = [];
    
    const idRegisterDate = headers.indexOf('Register_date') > -1 ? headers.indexOf('Register_date') : 0;
    const idPerson = headers.indexOf('Person_id') > -1 ? headers.indexOf('Person_id') : 1;
    const idName = headers.indexOf('Name') > -1 ? headers.indexOf('Name') : 2;
    const idSurname = headers.indexOf('Surname') > -1 ? headers.indexOf('Surname') : 3;
    const idAddress = headers.indexOf('Address') > -1 ? headers.indexOf('Address') : 4;
    const idPhone = headers.indexOf('Phone') > -1 ? headers.indexOf('Phone') : 5;
    const idImage = headers.indexOf('Image_URL') > -1 ? headers.indexOf('Image_URL') : 6;
    const idBirthdate = headers.indexOf('Birthdate') > -1 ? headers.indexOf('Birthdate') : 7;
    const idIllness = headers.indexOf('Illness') > -1 ? headers.indexOf('Illness') : 8;
    const idBeneficiary = headers.indexOf('Beneficiary') > -1 ? headers.indexOf('Beneficiary') : 9;
    const idRelated = headers.indexOf('Related') > -1 ? headers.indexOf('Related') : 10;
    const idNicknameCol = headers.findIndex(h => h.toString().toLowerCase().includes('nickname') || h.toString().toLowerCase().includes('ชื่อเล่น'));
    const idNickname = idNicknameCol > -1 ? idNicknameCol : 11;

    for (let i = 1; i < data.length; i++) {
        // Skip empty rows
        if(String(data[i][idPerson]).trim() === "") continue; 
        
        members.push({
            registerDate: idRegisterDate !== -1 && data[i][idRegisterDate] !== undefined ? data[i][idRegisterDate] : '',
            personId: String(data[i][idPerson]).trim(),
            name: data[i][idName],
            surname: data[i][idSurname],
            address: data[i][idAddress],
            phone: data[i][idPhone],
            image: data[i][idImage],
            birthdate: idBirthdate !== -1 && data[i][idBirthdate] !== undefined ? data[i][idBirthdate] : '',
            illness: idIllness !== -1 && data[i][idIllness] !== undefined ? data[i][idIllness] : '',
            beneficiary: idBeneficiary !== -1 && data[i][idBeneficiary] !== undefined ? data[i][idBeneficiary] : '',
            related: idRelated !== -1 && data[i][idRelated] !== undefined ? data[i][idRelated] : '',
            nickname: idNickname !== -1 && data[i][idNickname] !== undefined ? data[i][idNickname] : ''
        });
    }
    return { success: true, members: members };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Get Financial Report from 'financial' sheet
 */
function getFinancialReport() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('financial');
    if (!sheet) {
      sheet = ss.insertSheet('financial');
      sheet.appendRow(['Date', 'Description', 'Income', 'Outcome']);
      return { success: true, data: [] };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    
    const headers = data[0];
    const idDate = headers.findIndex(h => h.toString().toLowerCase().includes('date') || h.toString().toLowerCase().includes('วัน'));
    const idIncome = headers.findIndex(h => h.toString().toLowerCase().includes('income') || h.toString().toLowerCase().includes('รายรับ'));
    const idOutcome = headers.findIndex(h => h.toString().toLowerCase().includes('outcome') || h.toString().toLowerCase().includes('expense') || h.toString().toLowerCase().includes('รายจ่าย'));
    
    const dateCol = idDate > -1 ? idDate : 0;
    const incomeCol = idIncome > -1 ? idIncome : 2;
    const outcomeCol = idOutcome > -1 ? idOutcome : 3;
    
    const result = [];
    for (let i = 1; i < data.length; i++) {
        let rowDate = data[i][dateCol];
        let rowIncome = data[i][incomeCol];
        let rowOutcome = data[i][outcomeCol];
        
        if (!rowDate && !rowIncome && !rowOutcome) continue; 
        
        result.push({
            date: rowDate instanceof Date ? rowDate.toISOString() : rowDate,
            income: parseFloat(rowIncome) || 0,
            outcome: parseFloat(rowOutcome) || 0
        });
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Get or create the 'transactions' sheet in an external 'payment' spreadsheet
 */
function getTransactionsSheet() {
  let file;
  const files = DriveApp.getFilesByName(PAYMENT_FILE_NAME);
  
  if (files.hasNext()) {
    file = files.next();
  } else {
    // Create new external spreadsheet
    const newSS = SpreadsheetApp.create(PAYMENT_FILE_NAME);
    file = DriveApp.getFileById(newSS.getId());
  }

  const ss = SpreadsheetApp.open(file);
  let sheet = ss.getSheetByName(TRANSACTIONS_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(TRANSACTIONS_SHEET_NAME);
    sheet.appendRow(['Date', 'Person_id', 'Type_code', 'Amount', 'Slip_URL', 'Remark']);
    
    // Optionally remove 'Sheet1' if it's a new spreadsheet
    const sheet1 = ss.getSheetByName('Sheet1');
    if (sheet1) ss.deleteSheet(sheet1);
  }
  
  return sheet;
}

/**
 * Get or create the 'slips' folder in Google Drive
 */
function getSlipsFolder() {
  const folders = DriveApp.getFoldersByName(SLIPS_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(SLIPS_FOLDER_NAME);
}

/**
 * Submit a new transaction including uploading slip image
 * @param {object} data - Transaction data
 * @return {object} - { success: boolean }
 */
function submitTransaction(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const folder = getSlipsFolder();
    let slipUrl = '';
    
    // Process slip image file
    if (data.slipFile && data.slipName) {
      const contentType = data.slipFile.substring(5, data.slipFile.indexOf(';'));
      const base64Data = data.slipFile.substring(data.slipFile.indexOf('base64,') + 7);
      
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, data.personId + '_slip_' + Date.now() + '_' + data.slipName);
      const file = folder.createFile(blob);
      
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      slipUrl = 'https://drive.google.com/thumbnail?id=' + file.getId();
    }

    // Save to transactions sheet
    const sheet = getTransactionsSheet();
    sheet.appendRow([
      data.date || new Date(),
      "'" + String(data.personId),
      data.typeCode || '',
      data.amount || 0,
      slipUrl,
      data.remark || ''
    ]);

    // [New] Send Telegram Notification
    try {
      const memberInfo = checkMember(data.personId);
      let memberName = data.personId;
      if (memberInfo.found) {
        memberName = memberInfo.member.name + ' ' + memberInfo.member.surname;
      }
      
      const typeMap = {
        'INP01': 'บริจาคเป็นทุนประเดิม(ค่าสมัคร)',
        'INP02': 'บริจาครายเดือน(ค่าสมาชิก)',
        'INP03': 'บริจาครายปี(ค่าสมาชิก)',
        'INP04': 'บริจาคทำบุญอื่นๆ',
        'OUT01': 'สนับสนุนค่ารักษาพยาบาล',
        'OUT02': 'สนับสนุนค่าทำพิธีศพ'
      };
      const typeLabel = typeMap[data.typeCode] || data.typeCode;
      
      const msg = `💰 <b>มีการแจ้งทำรายการใหม่</b>\n👤 ผู้แจ้ง: ${memberName}\n📝 ประเภท: ${typeLabel}\n💵 จำนวน: ${data.amount.toLocaleString()} บาท\n📅 วันที่โอน: ${data.date}\n💬 หมายเหตุ: ${data.remark || '-'}`;
      
      sendTelegramNotify(msg, slipUrl);
    } catch (tgErr) {
      console.error('Notify fail: ' + tgErr.toString());
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Check if the personId is in the 'admin' sheet
 * @param {string} personId
 * @return {boolean}
 */
function isAdmin(personId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('admin');
    if (!sheet) return false;
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return false;
    
    // Check headers for Person_id
    const headers = data[0];
    const findPersonCol = headers.findIndex(h => h.toString().toLowerCase().includes('person_id') || h.toString().toLowerCase().includes('รหัส'));
    const colIdx = findPersonCol > -1 ? findPersonCol : 0;
    
    const pId = String(personId).trim();
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][colIdx]).trim() === pId) {
            return true;
        }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * [New] Send notification to Telegram Group/Channel via Telegram Bot API
 */
const TG_BOT_TOKEN = '8732094943:AAGSGEhAnWyrZZqIb4FYlksiyJNAeOI5eew'; // ใส่ Bot Token จาก BotFather
const TG_CHAT_ID = '6931878766';     // ลองเพิ่ม -100 เข้าไปข้างหน้า (สำหรับกลุ่ม)

function sendTelegramNotify(message, imageUrl) {
  // If token or chat id is not set, skip
  if (!TG_BOT_TOKEN || TG_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN' || !TG_CHAT_ID || TG_CHAT_ID === 'YOUR_TELEGRAM_CHAT_ID') {
    console.log('Telegram Token or Chat ID not set. Skipping notification.');
    return;
  }
  
  const botUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}`;
  
  try {
    if (imageUrl) {
      // Try sending with Photo first
      const photoUrl = `${botUrl}/sendPhoto`;
      const photoPayload = {
        'chat_id': TG_CHAT_ID,
        'photo': imageUrl,
        'caption': message,
        'parse_mode': 'HTML'
      };
      
      const photoOptions = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(photoPayload),
        'muteHttpExceptions': true
      };
      
      const response = UrlFetchApp.fetch(photoUrl, photoOptions);
      const resCode = response.getResponseCode();
      const resBody = response.getContentText();
      
      console.log(`Telegram sendPhoto Response (${resCode}): ${resBody}`);
      
      // If sendPhoto failed (e.g. image URL not accessible by Telegram), fallback to sendMessage
      if (resCode !== 200) {
        sendTextMessageFallback(botUrl, message, imageUrl);
      }
    } else {
      sendTextMessageFallback(botUrl, message);
    }
  } catch (e) {
    console.error('Telegram Notify Error: ' + e.toString());
    // Try text-only as last resort
    try { sendTextMessageFallback(botUrl, message); } catch(inner) {}
  }
}

/**
 * Helper to send text message if photo fails or no photo
 */
function sendTextMessageFallback(botUrl, message, link) {
  const url = `${botUrl}/sendMessage`;
  let text = message;
  if (link) {
    text += `\n\n📄 <b>ลิงก์รูปสลิป:</b> <a href="${link}">ดูรูปภาพ</a>`;
  }
  
  const payload = {
    'chat_id': TG_CHAT_ID,
    'text': text,
    'parse_mode': 'HTML',
    'disable_web_page_preview': false
  };
  
  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  console.log(`Telegram fallback Response (${response.getResponseCode()}): ${response.getContentText()}`);
}

/**
 * ฟังก์ชันสำหรับทดสอบการแจ้งเตือน Telegram (ใช้กด Run ในหน้า App Script Editor)
 * เมื่อกดปุ่ม Run ครั้งแรก ระบบจะให้กดยืนยันสิทธิ์ (Allow Permissions)
 */
function testTelegram() {
  const testMsg = "🔔 <b>ทดสอบการเชื่อมต่อ Telegram</b>\nหากคุณเห็นข้อความนี้ แสดงว่าระบบพร้อมใช้งานแล้วครับ!";
  
  // ย้ายการเรียกใช้ออกมานอก try-catch เพื่อให้ระบบ Google บังคับกดยอมรับสิทธิ์ (Authorize)
  const botUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const payload = {
    'chat_id': TG_CHAT_ID,
    'text': testMsg,
    'parse_mode': 'HTML'
  };
  
  // บรรทัดนี้จะบังคับให้เกิดกล่องข้อความ Authorization Required หากยังไม่ได้รับสิทธิ์
  UrlFetchApp.fetch(botUrl, {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload)
  });
  
  console.log("กรุณาดูผลการส่งใน Telegram");
}

/**
 * แจ้งเตือนสรุปยอดประจำวัน
 */
function sendDailySummary() {
  generateAndSendSummary('daily');
}

/**
 * แจ้งเตือนสรุปยอดประจำเดือน
 */
function sendMonthlySummary() {
  generateAndSendSummary('monthly');
}

/**
 * ฟังก์ชันหลักในการคำนวณและส่งแจ้งเตือน
 * @param {string} period - 'daily' หรือ 'monthly'
 */
function generateAndSendSummary(period) {
  try {
    const sheet = getTransactionsSheet(); 
    const data = sheet.getDataRange().getValues();
    
    // ลบบรรทัด if (data.length <= 1) return; ออก เพื่อให้มันทำงานต่อเช็คยอด
    
    const headers = data.length > 0 ? data[0] : [];
    const dateCol = 0;   
    const typeCol = 2;   
    const amountCol = 3; 
    
    const now = new Date();
    let totalIncome = 0;
    let totalOutcome = 0;
    let count = 0;
    
    // แก้ลูปให้เช็คว่าถ้ามี data ให้วนลูป
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        let rowDateObj = new Date(data[i][dateCol]);
        if (isNaN(rowDateObj.getTime())) continue; 
        
        let isMatch = false;
        if (period === 'daily') {
          if (rowDateObj.getDate() === now.getDate() &&
              rowDateObj.getMonth() === now.getMonth() &&
              rowDateObj.getFullYear() === now.getFullYear()) {
            isMatch = true;
          }
        } else if (period === 'monthly') {
          if (rowDateObj.getMonth() === now.getMonth() &&
              rowDateObj.getFullYear() === now.getFullYear()) {
            isMatch = true;
          }
        }
        
        if (isMatch) {
           count++;
           const typeCode = String(data[i][typeCol]).toUpperCase();
           const amount = parseFloat(data[i][amountCol]) || 0;
           
           if (typeCode.startsWith('INP')) {
             totalIncome += amount;
           } else if (typeCode.startsWith('OUT')) {
             totalOutcome += amount;
           }
        }
      }
    }
    
    let title = period === 'daily' ? '📊 <b>สรุปยอดประจำวัน</b>' : '📊 <b>สรุปยอดประจำเดือน</b>';
    let dateStr = period === 'daily' ? Utilities.formatDate(now, "GMT+0700", "dd/MM/yyyy") : Utilities.formatDate(now, "GMT+0700", "MMMM yyyy");
    
    let msg = `${title}\n📆 วันที่: ${dateStr}\n\n`;
    if (count === 0) {
      msg += `<i>ไม่มีรายการเคลื่อนไหวในระบบ</i>`;
    } else {
      msg += `📥 <b>รายรับรวม:</b> ${totalIncome.toLocaleString('th-TH')} บาท\n`;
      msg += `📤 <b>รายจ่ายรวม:</b> ${totalOutcome.toLocaleString('th-TH')} บาท\n`;
      msg += `✅ จำนวนรายการ: ${count} รายการ`;
    }
    
    console.log("กำลังจะส่งข้อความ: " + msg);
    sendTelegramNotify(msg);
    
  } catch(e) {
    console.error("Summary error: " + e.toString());
  }
}
