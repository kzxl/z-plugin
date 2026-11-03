/**
 * ERP Domain Linters & Quality Gate Checks
 * Packaged within dlc-erp extension
 */

/**
 * ERP-DECIMAL: Detects monetary/price fields declared as float or double
 */
export function checkDecimalPrecision(codeLine, filename = 'unknown', lineIndex = 1) {
  const decimalMatch = codeLine.match(/\b(double|float)\s+(Price|Amount|Cost|UnitPrice|SubTotal|Total|DonGia|ThanhTien|TongTien|GiaVon|GiaBan|TaxAmount|DiscountAmount)\b/i);
  if (decimalMatch) {
    return {
      severity: 'P1',
      category: 'DOMAIN_ERP',
      file: filename,
      line: lineIndex,
      rule: 'ERP Financial Precision (R_ERP_GATE)',
      message: `Monetary field '${decimalMatch[2]}' declared as '${decimalMatch[1]}'.`,
      suggestion: 'Use "decimal" for all financial, currency, and pricing fields to prevent binary IEEE-754 floating point rounding errors.'
    };
  }
  return null;
}

/**
 * ERP-LOCK: Detects direct UPDATE on inventory/stock tables without explicit row-level lock
 */
export function checkInventoryLock(codeLine, filename = 'unknown', lineIndex = 1) {
  if (/\bUPDATE\s+(?:Inventory|Stock|TonKho|SoKho|KhoVatTu)\b/i.test(codeLine) &&
      !/(?:UPDLOCK|ROWLOCK|WITH\s*\(UPDLOCK\))/i.test(codeLine)) {
    return {
      severity: 'P1',
      category: 'DOMAIN_ERP',
      file: filename,
      line: lineIndex,
      rule: 'ERP Inventory Lock Protection (R_ERP_GATE)',
      message: 'Direct UPDATE on inventory/stock table without explicit row-level lock (UPDLOCK).',
      suggestion: 'Append WITH (UPDLOCK, ROWLOCK) and ensure an ambient transaction scope to prevent race-condition negative stock allocations.'
    };
  }
  return null;
}
