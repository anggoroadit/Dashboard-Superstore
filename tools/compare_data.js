/**
 * Compare metrics between data.js (SUPERSTORE_DATA) and sample_-_superstore (1).json
 * Metrics: Total Sales, Total Orders, Unique Customers, Avg Order Value
 */

const fs = require('fs');
const path = require('path');

// --- Helper: parse comma-decimal numbers (European format like "16,448") ---
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    const normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (hasComma) {
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

// --- Load data.js ---
// data.js starts with "const SUPERSTORE_DATA = [..." so we extract the JSON array
const dataJsRaw = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf-8');
// Remove the "const SUPERSTORE_DATA = " prefix and trailing semicolons
const jsonStartIdx = dataJsRaw.indexOf('[');
const jsonStr = dataJsRaw.substring(jsonStartIdx).replace(/;\s*$/, '');
const dataJsArray = JSON.parse(jsonStr);

// --- Load sample JSON ---
const sampleJsonRaw = fs.readFileSync(path.join(__dirname, '..', 'sample_-_superstore (1).json'), 'utf-8');
const sampleJsonArray = JSON.parse(sampleJsonRaw);

// --- Compute metrics ---
function computeMetrics(data, label) {
  const totalRows = data.length;

  let totalSales = 0;
  let totalProfit = 0;
  let totalQuantity = 0;
  let totalDiscount = 0;

  const uniqueOrders = new Set();
  const uniqueCustomers = new Set();

  data.forEach(row => {
    const sales = toNumber(row.Sales || row.sales);
    const profit = toNumber(row.Profit || row.profit);
    const qty = toNumber(row.Quantity || row.quantity);
    const disc = toNumber(row.Discount || row.discount);
    const orderId = row['Order ID'] || row.orderId || '';
    const custName = row['Customer Name'] || row.customerName || '';
    const custId = row['Customer ID'] || row.customerId || '';

    totalSales += sales;
    totalProfit += profit;
    totalQuantity += qty;
    totalDiscount += disc;

    if (orderId) uniqueOrders.add(orderId);
    if (custId) uniqueCustomers.add(custId);
    else if (custName) uniqueCustomers.add(custName);
  });

  const avgOrderValue = uniqueOrders.size > 0 ? totalSales / uniqueOrders.size : 0;
  const avgDiscount = totalRows > 0 ? (totalDiscount / totalRows) * 100 : 0;

  return {
    label,
    totalRows,
    totalSales,
    totalProfit,
    totalQuantity,
    uniqueOrders: uniqueOrders.size,
    uniqueCustomers: uniqueCustomers.size,
    avgOrderValue,
    avgDiscount
  };
}

const metricsDataJs = computeMetrics(dataJsArray, 'data.js (SUPERSTORE_DATA)');
const metricsJson = computeMetrics(sampleJsonArray, 'sample_-_superstore (1).json');

// --- Print comparison table ---
function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n;
}

function fmtCurrency(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

console.log('');
console.log('='.repeat(80));
console.log('  DATA COMPARISON: data.js  vs  sample_-_superstore (1).json');
console.log('='.repeat(80));
console.log('');

const rows = [
  ['Metric', metricsDataJs.label, metricsJson.label, 'Match?'],
  ['---', '---', '---', '---'],
  ['Total Rows', fmt(metricsDataJs.totalRows), fmt(metricsJson.totalRows), metricsDataJs.totalRows === metricsJson.totalRows ? '✅' : '❌'],
  ['Total Sales', fmtCurrency(metricsDataJs.totalSales), fmtCurrency(metricsJson.totalSales), Math.abs(metricsDataJs.totalSales - metricsJson.totalSales) < 0.01 ? '✅' : '❌'],
  ['Total Profit', fmtCurrency(metricsDataJs.totalProfit), fmtCurrency(metricsJson.totalProfit), Math.abs(metricsDataJs.totalProfit - metricsJson.totalProfit) < 0.01 ? '✅' : '❌'],
  ['Total Orders (unique)', fmt(metricsDataJs.uniqueOrders), fmt(metricsJson.uniqueOrders), metricsDataJs.uniqueOrders === metricsJson.uniqueOrders ? '✅' : '❌'],
  ['Unique Customers', fmt(metricsDataJs.uniqueCustomers), fmt(metricsJson.uniqueCustomers), metricsDataJs.uniqueCustomers === metricsJson.uniqueCustomers ? '✅' : '❌'],
  ['Total Quantity', fmt(metricsDataJs.totalQuantity), fmt(metricsJson.totalQuantity), metricsDataJs.totalQuantity === metricsJson.totalQuantity ? '✅' : '❌'],
  ['Avg Order Value', fmtCurrency(metricsDataJs.avgOrderValue), fmtCurrency(metricsJson.avgOrderValue), Math.abs(metricsDataJs.avgOrderValue - metricsJson.avgOrderValue) < 0.01 ? '✅' : '❌'],
  ['Avg Discount %', metricsDataJs.avgDiscount.toFixed(1) + '%', metricsJson.avgDiscount.toFixed(1) + '%', Math.abs(metricsDataJs.avgDiscount - metricsJson.avgDiscount) < 0.01 ? '✅' : '❌'],
];

rows.forEach(r => {
  console.log(`| ${r[0].padEnd(22)} | ${r[1].toString().padEnd(30)} | ${r[2].toString().padEnd(30)} | ${r[3]} |`);
});

console.log('');
console.log('='.repeat(80));

// Check if data is identical row-by-row (spot check first 5 and last 5)
console.log('\n--- Spot Check: First record ---');
console.log('data.js[0]:', JSON.stringify(dataJsArray[0], null, 2).substring(0, 300));
console.log('json[0]:   ', JSON.stringify(sampleJsonArray[0], null, 2).substring(0, 300));

console.log('\n--- Spot Check: Last record ---');
console.log('data.js[last]:', JSON.stringify(dataJsArray[dataJsArray.length - 1], null, 2).substring(0, 300));
console.log('json[last]:   ', JSON.stringify(sampleJsonArray[sampleJsonArray.length - 1], null, 2).substring(0, 300));

// Deep equality check
const isIdentical = JSON.stringify(dataJsArray) === JSON.stringify(sampleJsonArray);
console.log('\n📊 Deep JSON Equality:', isIdentical ? '✅ IDENTICAL' : '❌ DIFFERENT');
console.log('');
