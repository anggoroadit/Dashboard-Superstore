/**
 * Superstore Dashboard JS Controller
 * Handles filtering, KPI math, interactive charting, insight text generation,
 * and paginated/sortable transactions table.
 */

const TRANSLATIONS = {
  // Region
  'Central': 'Tengah',
  'East': 'Timur',
  'South': 'Selatan',
  'West': 'Barat',

  // Category
  'Furniture': 'Mebel',
  'Office Supplies': 'Alat Tulis Kantor',
  'Technology': 'Teknologi',

  // Segment
  'Consumer': 'Konsumen',
  'Corporate': 'Korporasi',
  'Home Office': 'Kantor Rumah',

  // Sub-Category
  'Bookcases': 'Rak Buku',
  'Chairs': 'Kursi',
  'Labels': 'Label',
  'Tables': 'Meja',
  'Storage': 'Penyimpanan',
  'Art': 'Seni',
  'Phones': 'Telepon',
  'Binders': 'Pengikat',
  'Appliances': 'Peralatan',
  'Paper': 'Kertas',
  'Accessories': 'Aksesoris',
  'Envelopes': 'Amplop',
  'Fasteners': 'Pengikat Cepat',
  'Supplies': 'Perlengkapan',
  'Machines': 'Mesin',
  'Copiers': 'Mesin Fotokopi'
};

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

function toISODate(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }

    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  const dt = new Date(value);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
}

function normalizeDataRow(row) {
  return {
    orderId: row.orderId || row['Order ID'] || '',
    orderDate: toISODate(row.orderDate || row['Order Date']),
    customerName: row.customerName || row['Customer Name'] || '',
    customerId: row.customerId || row['Customer ID'] || '',
    segment: row.segment || row.Segment || '',
    region: row.region || row.Region || row.Country?.Region || '',
    state: typeof row.state === 'string' ? row.state : (row.state?.Province || (typeof row.State === 'string' ? row.State : (row.State?.Province || ''))),
    category: row.category || row.Category || '',
    subCategory: row.subCategory || row['Sub-Category'] || '',
    sales: toNumber(row.sales ?? row.Sales),
    profit: toNumber(row.profit ?? row.Profit),
    quantity: toNumber(row.quantity ?? row.Quantity),
    discount: toNumber(row.discount ?? row.Discount)
  };
}

const DASHBOARD_DATA = (Array.isArray(SUPERSTORE_DATA) ? SUPERSTORE_DATA : [])
  .map(normalizeDataRow)
  .filter(item => item.orderId && item.orderDate);

// Global Dashboard State
let currentData = [...DASHBOARD_DATA];
let activeFilters = {
  region: 'All',
  category: 'All',
  segment: 'All',
  startDate: '2025-01-01',
  endDate: '2026-08-31'
};

// Table State
let tableState = {
  page: 1,
  pageSize: 8,
  sortColumn: 'orderDate',
  sortDirection: 'desc',
  searchQuery: ''
};

// ApexCharts Global Instances
let trendChart, donutChart, subCatChart, regionChart, gapVolumeChart, gapMarginChart, stateChart, segmentChart;
let lastSegmentSales = [0, 0, 0];

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Icons
  lucide.createIcons();

  // 2. Set min/max values for date picker from dataset
  initDateFilters();

  // 3. Setup Listeners
  setupEventListeners();

  // 4. Create initial charts
  initCharts();

  // 5. Initial Data Processing & Dashboard Render
  updateDashboard();

  // 6. Setup Storytelling Assessment
  setupAssessmentListeners();
  loadAssessmentData();

  // 7. Initial Routing
  showPage(location.hash || "#overview");
});

// Calculate min and max dates in dataset to initialize filters
function initDateFilters() {
  // Build list of valid dates from dataset and guard against invalid/empty values
  const parsedDates = DASHBOARD_DATA
    .map(d => new Date(d.orderDate))
    .filter(dt => !isNaN(dt.getTime()));

  const startInput = document.getElementById("date-start");
  const endInput = document.getElementById("date-end");
  const placeholder = document.getElementById("table-search");
  placeholder.setAttribute("placeholder", "Cari pelanggan, ID, atau sub‑kategori...");

  // Fallback to existing inputs if no valid dates found
  if (parsedDates.length === 0) {
    // Keep default input attributes and activeFilters values
    activeFilters.startDate = startInput.value || activeFilters.startDate;
    activeFilters.endDate = endInput.value || activeFilters.endDate;
    return;
  }

  let minMs = parsedDates[0].getTime();
  let maxMs = parsedDates[0].getTime();
  for (let i = 1; i < parsedDates.length; i++) {
    const time = parsedDates[i].getTime();
    if (time < minMs) minMs = time;
    if (time > maxMs) maxMs = time;
  }
  const minDate = new Date(minMs);
  const maxDate = new Date(maxMs);

  // Format to YYYY-MM-DD safely
  const formatDate = (date) => {
    try {
      return date.toISOString().split('T')[0];
    } catch (e) {
      // Fallback: construct manually
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  };

  startInput.min = formatDate(minDate);
  startInput.max = formatDate(maxDate);
  endInput.min = formatDate(minDate);
  endInput.max = formatDate(maxDate);

  activeFilters.startDate = formatDate(minDate);
  activeFilters.endDate = formatDate(maxDate);

  startInput.value = activeFilters.startDate;
  endInput.value = activeFilters.endDate;
}

// Setup Dashboard Event Listeners
function setupEventListeners() {
  // Dropdown filters
  document.getElementById("filter-region").addEventListener("change", (e) => {
    activeFilters.region = e.target.value;
    tableState.page = 1;
    updateDashboard();
  });

  document.getElementById("filter-category").addEventListener("change", (e) => {
    activeFilters.category = e.target.value;
    tableState.page = 1;
    updateDashboard();
  });

  document.getElementById("filter-segment").addEventListener("change", (e) => {
    activeFilters.segment = e.target.value;
    tableState.page = 1;
    updateDashboard();
  });

  // Date filters
  document.getElementById("date-start").addEventListener("change", (e) => {
    activeFilters.startDate = e.target.value;
    tableState.page = 1;
    updateDashboard();
  });

  document.getElementById("date-end").addEventListener("change", (e) => {
    activeFilters.endDate = e.target.value;
    tableState.page = 1;
    updateDashboard();
  });

  // Reset Filters Button
  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    document.getElementById("filter-region").value = "All";
    document.getElementById("filter-category").value = "All";
    document.getElementById("filter-segment").value = "All";

    activeFilters.region = "All";
    activeFilters.category = "All";
    activeFilters.segment = "All";

    initDateFilters();
    tableState.page = 1;
    tableState.searchQuery = "";
    document.getElementById("table-search").value = "";

    updateDashboard();
  });

  // Search Input
  document.getElementById("table-search").addEventListener("input", (e) => {
    tableState.searchQuery = e.target.value.toLowerCase().trim();
    tableState.page = 1;
    renderTable();
  });

  // Pagination buttons
  document.getElementById("btn-page-prev").addEventListener("click", () => {
    if (tableState.page > 1) {
      tableState.page--;
      renderTable();
    }
  });

  document.getElementById("btn-page-next").addEventListener("click", () => {
    const totalPages = Math.ceil(getFilteredTableData().length / tableState.pageSize);
    if (tableState.page < totalPages) {
      tableState.page++;
      renderTable();
    }
  });

  // Table sorting headers
  const headers = document.querySelectorAll("#orders-table th.sortable");
  headers.forEach(header => {
    header.addEventListener("click", () => {
      const col = header.getAttribute("data-sort");
      if (tableState.sortColumn === col) {
        tableState.sortDirection = tableState.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        tableState.sortColumn = col;
        tableState.sortDirection = 'asc';
      }
      renderTable();
    });
  });

  // Theme Toggle Button
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  themeToggleBtn.addEventListener("click", () => {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    htmlElement.setAttribute("data-theme", newTheme);

    // Update theme-toggle icons
    const sunIcon = document.getElementById("theme-icon-sun");
    const moonIcon = document.getElementById("theme-icon-moon");
    const themeText = document.getElementById("theme-text");

    if (newTheme === "light") {
      sunIcon.classList.remove("hidden");
      moonIcon.classList.add("hidden");
      themeText.textContent = "Mode Terang";
    } else {
      sunIcon.classList.add("hidden");
      moonIcon.classList.remove("hidden");
      themeText.textContent = "Mode Gelap";
    }

    // Dynamic chart updates for color systems matching theme
    setTimeout(() => {
      updateChartsTheme();
    }, 150);
  });

  // Hash-based Page Switching Router
  window.addEventListener("hashchange", () => {
    showPage(location.hash);
  });

  // Handle click on sidebar links to update hash and active states
  const navItems = document.querySelectorAll(".sidebar-nav li");
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const link = item.querySelector("a");
      if (link) {
        const href = link.getAttribute("href");
        if (href.startsWith("#")) {
          if (location.hash === href) {
            showPage(href);
          } else {
            location.hash = href;
          }
        }
      }
    });
  });
}

// SPA Router Page Switcher
function showPage(targetId) {
  if (!targetId || targetId === "#" || targetId === "") {
    targetId = "#overview";
  }

  const targetElement = document.querySelector(targetId);
  if (!targetElement) return;

  // 1. Hide all pages and show target
  const pages = document.querySelectorAll(".view-page");
  pages.forEach(p => p.classList.remove("active"));
  targetElement.classList.add("active");

  // Show storytelling evaluation header, student instructions, and grader guide if on an assessment step page
  const evalHeader = document.getElementById("storytelling-evaluation-header");
  const petunjuk = document.getElementById("petunjuk-mahasiswa-section");
  const panduan = document.getElementById("panduan-penilai-section");
  if (targetId.startsWith("#langkah-")) {
    if (evalHeader) evalHeader.classList.add("active");
    if (petunjuk) petunjuk.classList.add("active");
    if (panduan) panduan.classList.add("active");
  } else {
    if (evalHeader) evalHeader.classList.remove("active");
    if (petunjuk) petunjuk.classList.remove("active");
    if (panduan) panduan.classList.remove("active");
  }

  // 2. Update active link in sidebar
  const navItems = document.querySelectorAll(".sidebar-nav li");
  navItems.forEach(item => {
    const link = item.querySelector("a");
    if (link && link.getAttribute("href") === targetId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // 3. Scroll main content to top
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.scrollTop = 0;
  }

  // 4. Trigger resize event for ApexCharts layout recalculation
  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 50);
}

// Master Dashboard Updating Routine
function updateDashboard() {
  // 1. Filter original dataset based on filters
  currentData = DASHBOARD_DATA.filter(item => {
    const matchesRegion = activeFilters.region === 'All' || item.region === activeFilters.region;
    const matchesCategory = activeFilters.category === 'All' || item.category === activeFilters.category;
    const matchesSegment = activeFilters.segment === 'All' || item.segment === activeFilters.segment;

    const itemDate = item.orderDate;
    const matchesDate = itemDate >= activeFilters.startDate && itemDate <= activeFilters.endDate;

    return matchesRegion && matchesCategory && matchesSegment && matchesDate;
  });

  // 2. Refresh metrics cards
  calculateKPIs();

  // 3. Update Chart Visuals
  updateCharts();

  // 4. Populate Table
  renderTable();

  // 5. Generate descriptive insights
  generateAnalyticalNarratives();
}

// KPI Logic & Statistics
function calculateKPIs() {
  const count = currentData.length;

  if (count === 0) {
    document.getElementById("kpi-sales").textContent = "$0";
    document.getElementById("kpi-profit").textContent = "$0";
    document.getElementById("kpi-orders").textContent = "0";
    document.getElementById("kpi-customers").textContent = "0";
    document.getElementById("kpi-avg-order-value").textContent = "$0";

    document.getElementById("kpi-margin-value").innerHTML = `<span>0% Margin</span>`;
    document.getElementById("kpi-quantity-value").innerHTML = `<span>0 Unit Terjual</span>`;
    return;
  }

  let totalSales = 0;
  let totalProfit = 0;
  let totalQty = 0;
  let totalDiscountSum = 0;
  let uniqueCustomersSet = new Set();
  let uniqueOrdersSet = new Set();

  currentData.forEach(item => {
    totalSales += item.sales;
    totalProfit += item.profit;
    totalQty += item.quantity;
    totalDiscountSum += item.discount;
    if (item.customerId) {
      uniqueCustomersSet.add(item.customerId);
    }
    if (item.orderId) {
      uniqueOrdersSet.add(item.orderId);
    }
  });

  const profitMargin = (totalSales > 0) ? (totalProfit / totalSales) * 100 : 0;
  const avgOrderValue = (uniqueOrdersSet.size > 0) ? totalSales / uniqueOrdersSet.size : 0;

  // Set text values
  document.getElementById("kpi-sales").textContent = formatCurrency(totalSales);
  document.getElementById("kpi-profit").textContent = formatCurrency(totalProfit);
  document.getElementById("kpi-orders").textContent = uniqueOrdersSet.size.toLocaleString();
  document.getElementById("kpi-customers").textContent = uniqueCustomersSet.size.toLocaleString();
  document.getElementById("kpi-avg-order-value").textContent = formatCurrency(avgOrderValue);

  // Dynamic KPI trends / indicators
  const marginElement = document.getElementById("kpi-margin-value");
  marginElement.className = "kpi-trend " + (profitMargin >= 15 ? "trend-positive" : profitMargin >= 0 ? "" : "trend-negative");
  marginElement.innerHTML = `
    <i data-lucide="${profitMargin >= 15 ? 'arrow-up-right' : profitMargin >= 0 ? 'minus' : 'arrow-down-right'}"></i>
    <span>${profitMargin.toFixed(1)}% Margin Laba</span>
  `;

  document.getElementById("kpi-quantity-value").innerHTML = `
    <span>${totalQty.toLocaleString()} Unit Terjual</span>
  `;

  // Refresh icons embedded in dynamic updates
  lucide.createIcons();
}

// Generate Insights & analytical texts
function generateAnalyticalNarratives() {
  const count = currentData.length;

  const salesText = document.getElementById("insight-sales-text");
  const profitText = document.getElementById("insight-profit-text");
  const discountText = document.getElementById("insight-discount-text");
  const recText = document.getElementById("insight-recommendations-text");
  const quickRec = document.getElementById("dynamic-recommendation");

  if (count === 0) {
    salesText.textContent = "Tidak ada data penjualan yang cocok dengan konfigurasi filter yang dipilih.";
    profitText.textContent = "Tidak dapat menghitung faktor profitabilitas karena dataset kosong.";
    discountText.textContent = "Sensitivitas diskon memerlukan input transaksi yang valid.";
    recText.textContent = "Sesuaikan parameter di atas untuk menilai kembali rekomendasi strategis.";
    if (quickRec) {
      quickRec.textContent = "Menunggu data transaksi. Periksa batas filter.";
    }
    return;
  }

  // 1. Sales analysis metrics
  let topCategory = { name: '', sales: 0 };
  let topSub = { name: '', sales: 0 };
  const catSales = {};
  const subSales = {};

  currentData.forEach(d => {
    catSales[d.category] = (catSales[d.category] || 0) + d.sales;
    subSales[d.subCategory] = (subSales[d.subCategory] || 0) + d.sales;
  });

  Object.keys(catSales).forEach(cat => {
    if (catSales[cat] > topCategory.sales) topCategory = { name: cat, sales: catSales[cat] };
  });

  Object.keys(subSales).forEach(sub => {
    if (subSales[sub] > topSub.sales) topSub = { name: sub, sales: subSales[sub] };
  });

  const totalSales = currentData.reduce((sum, item) => sum + item.sales, 0);
  const catPercentage = ((topCategory.sales / totalSales) * 100).toFixed(1);

  // Translate for display
  const displayTopCat = topCategory.name;
  const displayTopSub = topSub.name;

  salesText.innerHTML = `Secara keseluruhan, konfigurasi filter saat ini mencatat total pendapatan sebesar <strong>${formatCurrency(totalSales)}</strong>. Sektor yang memimpin adalah <strong>${displayTopCat}</strong>, yang menyumbang <strong>${catPercentage}%</strong> dari total omset. Segmen produk dengan kinerja tertinggi adalah <strong>${displayTopSub}</strong>, dengan volume penjualan sebesar <strong>${formatCurrency(topSub.sales)}</strong>. Lini bisnis menunjukkan distribusi yang stabil di seluruh saluran aktif.`;

  // 2. Profitability metrics
  let topProfitableSub = { name: '', profit: -Infinity };
  let bottomProfitableSub = { name: '', profit: Infinity };
  const subProfits = {};

  currentData.forEach(d => {
    subProfits[d.subCategory] = (subProfits[d.subCategory] || 0) + d.profit;
  });

  Object.keys(subProfits).forEach(sub => {
    if (subProfits[sub] > topProfitableSub.profit) topProfitableSub = { name: sub, profit: subProfits[sub] };
    if (subProfits[sub] < bottomProfitableSub.profit) bottomProfitableSub = { name: sub, profit: subProfits[sub] };
  });

  const totalProfit = currentData.reduce((sum, item) => sum + item.profit, 0);
  const totalMargin = (totalSales > 0) ? ((totalProfit / totalSales) * 100).toFixed(1) : "0.0";

  const displayTopProfitableSub = topProfitableSub.name;
  const displayBottomProfitableSub = bottomProfitableSub.name;

  profitText.innerHTML = `Total laba bersih mencapai <strong>${formatCurrency(totalProfit)}</strong>, menunjukkan akumulasi margin operasional sebesar <strong>${totalMargin}%</strong>. Sub-kategori <strong>${displayTopProfitableSub}</strong> menjadi mesin laba utama dengan menghasilkan margin absolut sebesar <strong>${formatCurrency(topProfitableSub.profit)}</strong>. Sebaliknya, sub-kategori <strong>${displayBottomProfitableSub}</strong> menjadi beban terbesar pada kinerja keuangan dengan hasil bersih negatif sebesar <strong class="trend-negative">${formatCurrency(bottomProfitableSub.profit)}</strong>.`;

  // 3. Discount Sensitivity
  let highDiscountOrdersCount = 0;
  let lossyHighDiscountOrdersCount = 0;
  let totalDiscounts = 0;

  currentData.forEach(d => {
    totalDiscounts += d.discount;
    if (d.discount >= 0.2) {
      highDiscountOrdersCount++;
      if (d.profit < 0) {
        lossyHighDiscountOrdersCount++;
      }
    }
  });

  const avgDiscVal = ((totalDiscounts / count) * 100).toFixed(1);
  const discountImpactRate = highDiscountOrdersCount > 0
    ? ((lossyHighDiscountOrdersCount / highDiscountOrdersCount) * 100).toFixed(0)
    : 0;

  discountText.innerHTML = `Rata-rata diskon yang diberikan adalah <strong>${avgDiscVal}%</strong>. Audit standar menunjukkan bahwa sebanyak <strong>${highDiscountOrdersCount}</strong> item terjual dengan tingkat promosi mencapai atau melebihi 20%. Secara khusus, <strong>${discountImpactRate}%</strong> dari transaksi dengan diskon tinggi tersebut menghasilkan kerugian bersih langsung, yang mengonfirmasi adanya penurunan margin keuntungan yang signifikan saat potongan harga melewati batas toleransi utama.`;

  // 4. Strategic Recommendations & Quick AI Widget
  let quickRecText = "";
  let fullRecText = "";

  if (bottomProfitableSub.profit < 0) {
    quickRecText = `Atasi kebocoran profit pada sub-kategori <b>${displayBottomProfitableSub}</b> dengan menyesuaikan model harga dan meminimalkan tingkat diskon promosi.`;
    fullRecText = `1. <strong>Restrukturisasi Diskon:</strong> Terapkan batas diskon yang lebih ketat pada sub-kategori <strong>${displayBottomProfitableSub}</strong> yang berkinerja rendah dan mendominasi segmen kerugian.<br>
                   2. <strong>Realokasi Inventaris:</strong> Alihkan modal ke produk dengan margin tinggi seperti <strong>${displayTopProfitableSub}</strong> untuk memanfaatkan pola peningkatan promosi secara hati-hati pada kategori yang memiliki margin tinggi dan perputaran inventaris yang cepat.<br>
                   3. <strong>Audit Operasional:</strong> Lakukan audit biaya logistik di pasar dengan margin negatif untuk menentukan apakah biaya operasional pengiriman menggelembungkan pengeluaran per unit.`;
  } else {
    quickRecText = `Pertahankan momentum. Lini produk dengan margin tertinggi (<b>${displayTopProfitableSub}</b>) berkinerja sangat baik. Pertimbangkan strategi penjualan silang (cross-selling).`;
    fullRecText = `1. <strong>Optimasi Penjualan Silang (Cross-selling):</strong> Bundel produk dengan penjualan rendah namun profit tinggi bersama dengan produk terlaris seperti <strong>${displayTopSub}</strong>.<br>
                   2. <strong>Penyesuaian Promosi:</strong> Lakukan uji coba peningkatan promosi secara hati-hati pada kategori yang memiliki margin tinggi dan perputaran inventaris yang cepat.<br>
                   3. <strong>Penskalaan Wilayah:</strong> Replikasi strategi penjualan dari segmen utama kita ke zona baru yang belum tergarap sepenuhnya untuk memperluas pangsa pasar secara aman.`;
  }

  recText.innerHTML = fullRecText;
  if (quickRec) {
    quickRec.innerHTML = quickRecText;
  }
}

// Chart Initializations
function initCharts() {
  // Fetch css style variables dynamically for uniform theme integration
  const chartStyles = getChartThemeColors();

  // Chart 1: Sales Monthly Trend (Neon Area Chart + Gold Target Line)
  const trendOptions = {
    series: [],
    chart: {
      type: 'line',
      height: 280,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent',
      dropShadow: {
        enabled: true,
        enabledOnSeries: [0], // only apply neon glow to Sales series
        top: 6,
        left: 0,
        blur: 8,
        color: chartStyles.primary,
        opacity: 0.55
      }
    },
    colors: [chartStyles.primary, '#fbbf24'],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'straight',
      width: [4, 2],
      dashArray: [0, 6] // solid for Sales, dashed for Target
    },
    markers: {
      size: 0,
      hover: {
        size: 6
      }
    },
    fill: {
      type: 'solid',
      opacity: 1
    },
    xaxis: {
      categories: [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: chartStyles.textMuted } }
    },
    yaxis: {
      title: { text: 'Penjualan (USD)', style: { color: chartStyles.primary, fontWeight: 600 } },
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (value) => formatCompact(value)
      }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4,
      xaxis: { lines: { show: true } }
    },
    legend: {
      labels: { colors: chartStyles.textPrimary },
      position: 'top',
      horizontalAlign: 'right'
    },
    tooltip: { theme: chartStyles.themeMode }
  };
  trendChart = new ApexCharts(document.querySelector("#chart-sales-profit-trend"), trendOptions);
  trendChart.render();

  // Chart 2: Category Donut Chart
  const donutOptions = {
    series: [],
    chart: {
      type: 'donut',
      height: 280,
      fontFamily: 'var(--font-sans)',
      background: 'transparent'
    },
    labels: ['Furniture', 'Office Supplies', 'Technology'],
    colors: [chartStyles.primary, chartStyles.accent, chartStyles.success],
    legend: {
      position: 'bottom',
      labels: { colors: chartStyles.textPrimary }
    },
    stroke: { colors: ['transparent'] },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total Penjualan',
              color: chartStyles.textSecondary,
              fontSize: '12px',
              formatter: function (w) {
                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                return formatCompact(total);
              }
            },
            value: {
              fontSize: '18px',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              color: chartStyles.textPrimary,
              formatter: (val) => formatCurrency(val)
            }
          }
        }
      }
    },
    dataLabels: { enabled: false },
    tooltip: { theme: chartStyles.themeMode }
  };
  donutChart = new ApexCharts(document.querySelector("#chart-category-donut"), donutOptions);
  donutChart.render();

  // Chart 3: Category Volume (Vertical Column Chart)
  const gapVolumeOptions = {
    series: [],
    chart: {
      type: 'bar',
      height: 280,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent'
    },
    colors: [chartStyles.primary],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '55%',
        borderRadius: 4
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: ['Furniture', 'Office Supplies', 'Technology'],
      labels: {
        style: { colors: chartStyles.textPrimary }
      }
    },
    yaxis: {
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: { theme: chartStyles.themeMode }
  };
  gapVolumeChart = new ApexCharts(document.querySelector("#chart-category-gap-volume"), gapVolumeOptions);
  gapVolumeChart.render();

  // Chart 4: Category Gap - Margin % (Horizontal Bar)
  const gapMarginOptions = {
    series: [],
    chart: {
      type: 'bar',
      height: 180,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent'
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '60%',
        borderRadius: 4,
        colors: {
          ranges: [
            { from: -100, to: -0.01, color: chartStyles.danger },
            { from: 0, to: 100, color: chartStyles.success }
          ]
        }
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: ['Furniture', 'Office Supplies', 'Technology'],
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => `${val.toFixed(1)}%`
      }
    },
    yaxis: {
      labels: { style: { colors: chartStyles.textPrimary } }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: { theme: chartStyles.themeMode }
  };
  gapMarginChart = new ApexCharts(document.querySelector("#chart-category-gap-margin"), gapMarginOptions);
  gapMarginChart.render();

  // Chart 5: Region Performance Combo/Mixed Chart
  const regionOptions = {
    series: [],
    chart: {
      type: 'line',
      height: 280,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent'
    },
    colors: [chartStyles.primary, chartStyles.success],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '50%',
        borderRadius: 4
      }
    },
    dataLabels: { enabled: false },
    stroke: { width: [0, 4], curve: 'smooth' },
    xaxis: {
      categories: ['Central', 'East', 'South', 'West'],
      labels: { style: { colors: chartStyles.textMuted } }
    },
    yaxis: [
      {
        title: {
          text: 'Pendapatan (USD)',
          style: { color: chartStyles.primary, fontWeight: 600 }
        },
        labels: {
          style: { colors: chartStyles.textMuted },
          formatter: (val) => formatCompact(val)
        }
      },
      {
        opposite: true,
        title: {
          text: 'Laba Bersih (USD)',
          style: { color: chartStyles.success, fontWeight: 600 }
        },
        labels: {
          style: { colors: chartStyles.textMuted },
          formatter: (val) => formatCompact(val)
        }
      }
    ],
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    legend: {
      labels: { colors: chartStyles.textPrimary }
    },
    fill: { opacity: [0.85, 1] },
    tooltip: { theme: chartStyles.themeMode }
  };
  regionChart = new ApexCharts(document.querySelector("#chart-region-column"), regionOptions);
  regionChart.render();

  // Chart 6: Sub-Category Profitability Bar Chart
  const subCatOptions = {
    series: [],
    chart: {
      type: 'bar',
      height: 310,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent'
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '65%',
        borderRadius: 4,
        colors: {
          ranges: [
            { from: -1000000, to: -0.01, color: chartStyles.danger },
            { from: 0, to: 1000000, color: chartStyles.success }
          ]
        }
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    yaxis: {
      labels: { style: { colors: chartStyles.textPrimary } }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: { theme: chartStyles.themeMode }
  };
  subCatChart = new ApexCharts(document.querySelector("#chart-subcategory-bar"), subCatOptions);
  subCatChart.render();

  // Chart 7: Top 10 State Nasional (Bar Chart)
  const stateOptions = {
    series: [{
      name: 'Penjualan',
      data: []
    }],
    chart: {
      type: 'bar',
      height: 280,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent'
    },
    colors: [chartStyles.primary],
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '65%',
        borderRadius: 4
      }
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: [],
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    yaxis: {
      labels: { style: { colors: chartStyles.textPrimary } }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: { theme: chartStyles.themeMode }
  };
  stateChart = new ApexCharts(document.querySelector("#chart-state-bar"), stateOptions);
  stateChart.render();

  // Chart 8: Customer Segment Share (Radial Bar)
  const segmentOptions = {
    series: [],
    chart: {
      type: 'radialBar',
      height: 280,
      fontFamily: 'var(--font-sans)',
      background: 'transparent'
    },
    plotOptions: {
      radialBar: {
        dataLabels: {
          name: {
            fontSize: '18px',
            fontFamily: 'var(--font-display)',
            fontWeight: 600
          },
          value: {
            fontSize: '14px',
            formatter: function (val) {
              return val + '%';
            }
          },
          total: {
            show: true,
            label: 'Kontribusi',
            formatter: function (w) {
              return 'Segmen';
            }
          }
        }
      }
    },
    labels: ['Consumer', 'Corporate', 'Home Office'],
    colors: [chartStyles.primary, chartStyles.accent, chartStyles.warning],
    legend: {
      show: true,
      position: 'bottom',
      labels: { colors: chartStyles.textPrimary }
    },
    tooltip: {
      enabled: true,
      theme: chartStyles.themeMode,
      custom: function ({ series, seriesIndex, dataPointIndex, w }) {
        const val = lastSegmentSales[seriesIndex] || 0;
        const label = w.globals.labels[seriesIndex];
        return '<div style="padding: 8px; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);">' +
          '<span><b>' + label + '</b>: ' + formatCurrency(val) + ' (' + series[seriesIndex] + '%)</span>' +
          '</div>';
      }
    }
  };
  segmentChart = new ApexCharts(document.querySelector("#chart-segment-bar"), segmentOptions);
  segmentChart.render();
}

// Update Chart Series Data based on filters
function updateCharts() {
  const chartStyles = getChartThemeColors();
  const tbody = document.getElementById("region-comp-table-body");

  if (currentData.length === 0) {
    trendChart.updateSeries([]);
    donutChart.updateSeries([]);
    gapVolumeChart.updateSeries([]);
    gapMarginChart.updateSeries([]);
    regionChart.updateSeries([]);
    subCatChart.updateSeries([]);
    stateChart.updateSeries([]);
    segmentChart.updateSeries([]);

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">Tidak ada data yang cocok dengan kueri filter.</td></tr>`;
    }
    return;
  }

  // A. Calculate Sales Monthly Trend (Chart 1 - Neon Area Chart) & Target Sales
  const monthlyData = {};
  currentData.forEach(d => {
    const monthStr = d.orderDate.substring(0, 7); // YYYY-MM
    if (!monthlyData[monthStr]) {
      monthlyData[monthStr] = { sales: 0 };
    }
    monthlyData[monthStr].sales += d.sales;
  });

  const sortedMonths = Object.keys(monthlyData).sort();
  const trendSalesSeries = sortedMonths.map(m => monthlyData[m].sales);

  // Calculate target: average monthly sales of the active period * 1.08 (8% stretch target)
  const avgSales = trendSalesSeries.reduce((a, b) => a + b, 0) / trendSalesSeries.length;
  const targetSalesVal = avgSales * 1.08;
  const trendTargetSeries = sortedMonths.map(() => targetSalesVal);

  // Identify Peak and Trough for Annotations
  let peakIdx = 0;
  let troughIdx = 0;
  for (let i = 1; i < trendSalesSeries.length; i++) {
    if (trendSalesSeries[i] > trendSalesSeries[peakIdx]) peakIdx = i;
    if (trendSalesSeries[i] < trendSalesSeries[troughIdx]) troughIdx = i;
  }

  const peakMonth = formatMonthLabel(sortedMonths[peakIdx]);
  const peakValue = trendSalesSeries[peakIdx];
  const troughMonth = formatMonthLabel(sortedMonths[troughIdx]);
  const troughValue = trendSalesSeries[troughIdx];

  trendChart.updateOptions({
    chart: {
      type: 'line',
      height: 280,
      fontFamily: 'var(--font-sans)',
      toolbar: { show: false },
      background: 'transparent',
      dropShadow: {
        enabled: true,
        enabledOnSeries: [0], // only apply neon glow to Sales series
        top: 6,
        left: 0,
        blur: 8,
        color: chartStyles.primary,
        opacity: 0.55
      }
    },
    colors: [chartStyles.primary, '#fbbf24'],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'straight',
      width: [4, 2],
      dashArray: [0, 6] // solid for Sales, dashed for Target
    },
    markers: {
      size: 0,
      hover: {
        size: 6
      }
    },
    fill: {
      type: 'solid',
      opacity: 1
    },
    xaxis: {
      categories: sortedMonths.map(m => formatMonthLabel(m)),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: chartStyles.textMuted } }
    },
    yaxis: {
      title: { text: 'Penjualan (USD)', style: { color: chartStyles.primary, fontWeight: 600 } },
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (value) => formatCompact(value)
      }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4,
      xaxis: { lines: { show: true } }
    },
    legend: {
      labels: { colors: chartStyles.textPrimary },
      position: 'top',
      horizontalAlign: 'right'
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: [
      { name: 'Penjualan Bulanan', data: trendSalesSeries },
      { name: 'Target Penjualan', data: trendTargetSeries }
    ],
    annotations: {
      points: [
        {
          x: peakMonth,
          y: peakValue,
          marker: {
            size: 6,
            fillColor: '#10b981', // Neon Green
            strokeColor: '#fff',
            strokeWidth: 2
          },
          label: {
            borderColor: '#10b981',
            offsetY: -30,
            style: { color: '#fff', background: '#10b981', fontSize: '10px', fontWeight: 700 },
            text: `Puncak: ${formatCompact(peakValue)}`
          }
        },
        {
          x: troughMonth,
          y: troughValue,
          marker: {
            size: 6,
            fillColor: '#f43f5e', // Neon Pink/Red
            strokeColor: '#fff',
            strokeWidth: 2
          },
          label: {
            borderColor: '#f43f5e',
            offsetY: 30,
            style: { color: '#fff', background: '#f43f5e', fontSize: '10px', fontWeight: 700 },
            text: `Terendah: ${formatCompact(troughValue)}`
          }
        }
      ]
    }
  });

  // B. Category Share (Chart 2 - Donut)
  const categories = ['Furniture', 'Office Supplies', 'Technology'];
  const catSales = categories.map(cat => {
    return currentData
      .filter(d => d.category === cat)
      .reduce((sum, item) => sum + item.sales, 0);
  });

  donutChart.updateOptions({
    colors: [chartStyles.primary, chartStyles.accent, chartStyles.success],
    legend: {
      position: 'bottom',
      labels: { colors: chartStyles.textPrimary }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total Penjualan',
              color: chartStyles.textSecondary,
              fontSize: '12px',
              formatter: function (w) {
                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                return formatCompact(total);
              }
            },
            value: {
              fontSize: '18px',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              color: chartStyles.textPrimary,
              formatter: (val) => formatCurrency(val)
            }
          }
        }
      }
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: catSales
  });

  // C. Category Gap Analysis (Chart 3 & 4 - Horizontal Bars)
  const catVolumeData = [];
  const catMarginData = [];
  categories.forEach(cat => {
    const filtered = currentData.filter(d => d.category === cat);
    const salesSum = filtered.reduce((sum, item) => sum + item.sales, 0);
    const profitSum = filtered.reduce((sum, item) => sum + item.profit, 0);
    const marginPercent = salesSum > 0 ? (profitSum / salesSum) * 100 : 0;

    catVolumeData.push(salesSum);
    catMarginData.push(marginPercent);
  });

  gapVolumeChart.updateOptions({
    colors: [chartStyles.primary],
    xaxis: {
      categories: ['Furniture', 'Office Supplies', 'Technology'],
      labels: {
        style: { colors: chartStyles.textPrimary }
      }
    },
    yaxis: {
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: [{ name: 'Volume Penjualan', data: catVolumeData }]
  });

  gapMarginChart.updateOptions({
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '60%',
        borderRadius: 4,
        colors: {
          ranges: [
            { from: -100, to: -0.01, color: chartStyles.danger },
            { from: 0, to: 100, color: chartStyles.success }
          ]
        }
      }
    },
    xaxis: {
      categories: ['Furniture', 'Office Supplies', 'Technology'],
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => `${val.toFixed(1)}%`
      }
    },
    yaxis: {
      labels: { style: { colors: chartStyles.textPrimary } }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => `${val.toFixed(1)}%`
      }
    },
    series: [{ name: 'Margin Laba Bersih (%)', data: catMarginData }]
  });

  // D. Region Column Performance (Chart 5 - Combo/Mixed Chart) & Table YoY
  const regionNames = ['Central', 'East', 'South', 'West'];
  const regionSales = regionNames.map(reg => {
    return currentData
      .filter(d => d.region === reg)
      .reduce((sum, item) => sum + item.sales, 0);
  });
  const regionProfits = regionNames.map(reg => {
    return currentData
      .filter(d => d.region === reg)
      .reduce((sum, item) => sum + item.profit, 0);
  });

  regionChart.updateOptions({
    colors: [chartStyles.primary, chartStyles.success],
    xaxis: {
      categories: ['Central', 'East', 'South', 'West'],
      labels: { style: { colors: chartStyles.textMuted } }
    },
    yaxis: [
      {
        title: {
          text: 'Pendapatan (USD)',
          style: { color: chartStyles.primary, fontWeight: 600 }
        },
        labels: {
          style: { colors: chartStyles.textMuted },
          formatter: (val) => formatCompact(val)
        }
      },
      {
        opposite: true,
        title: {
          text: 'Laba Bersih (USD)',
          style: { color: chartStyles.success, fontWeight: 600 }
        },
        labels: {
          style: { colors: chartStyles.textMuted },
          formatter: (val) => formatCompact(val)
        }
      }
    ],
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    legend: {
      labels: { colors: chartStyles.textPrimary }
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: [
      { name: 'Pendapatan Penjualan', type: 'column', data: regionSales },
      { name: 'Laba Bersih', type: 'line', data: regionProfits }
    ]
  });

  // Compute YoY growth by shifting active range back 1 year
  const prevStartDate = shiftDateYear(activeFilters.startDate, -1);
  const prevEndDate = shiftDateYear(activeFilters.endDate, -1);

  // Filter raw DASHBOARD_DATA for the same category/segment in previous year
  const prevYearData = DASHBOARD_DATA.filter(item => {
    const matchesCategory = activeFilters.category === 'All' || item.category === activeFilters.category;
    const matchesSegment = activeFilters.segment === 'All' || item.segment === activeFilters.segment;
    const matchesDate = item.orderDate >= prevStartDate && item.orderDate <= prevEndDate;
    return matchesCategory && matchesSegment && matchesDate;
  });

  if (tbody) {
    tbody.innerHTML = "";
    regionNames.forEach((reg, idx) => {
      const currentSalesVal = regionSales[idx];
      const prevSalesVal = prevYearData
        .filter(d => d.region === reg)
        .reduce((sum, item) => sum + item.sales, 0);

      let yoyGrowthText = "N/A";
      let yoyClass = "";
      if (prevSalesVal > 0) {
        const growth = ((currentSalesVal - prevSalesVal) / prevSalesVal) * 100;
        yoyGrowthText = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
        yoyClass = growth >= 0 ? 'trend-positive' : 'trend-negative';
      }

      // Unique customers in active range for this region
      const regionFiltered = currentData.filter(d => d.region === reg);
      const uniqueCusts = new Set(regionFiltered.map(d => d.customerId).filter(Boolean));
      const customerCount = uniqueCusts.size;

      // Top/Driving category in active range for this region
      const regCatSales = {};
      regionFiltered.forEach(d => {
        regCatSales[d.category] = (regCatSales[d.category] || 0) + d.sales;
      });
      let topCat = "Tidak ada";
      let maxCatSales = 0;
      Object.keys(regCatSales).forEach(cat => {
        if (regCatSales[cat] > maxCatSales) {
          maxCatSales = regCatSales[cat];
          topCat = cat;
        }
      });

      const displayRegion = reg;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${displayRegion}</td>
        <td class="${yoyClass}"><strong>${yoyGrowthText}</strong></td>
        <td>${customerCount.toLocaleString()}</td>
        <td><span class="badge badge-success" style="font-size: 0.75rem;">${topCat}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // E. Sub-category Profitability (Chart 6 - Bar Chart)
  const subCategoryProfits = {};
  currentData.forEach(d => {
    subCategoryProfits[d.subCategory] = (subCategoryProfits[d.subCategory] || 0) + d.profit;
  });

  const sortedSubCats = Object.keys(subCategoryProfits).sort((a, b) => subCategoryProfits[b] - subCategoryProfits[a]);
  const subCatData = sortedSubCats.map(sub => subCategoryProfits[sub]);

  subCatChart.updateOptions({
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: '65%',
        borderRadius: 4,
        colors: {
          ranges: [
            { from: -1000000, to: -0.01, color: chartStyles.danger },
            { from: 0, to: 1000000, color: chartStyles.success }
          ]
        }
      }
    },
    xaxis: {
      categories: sortedSubCats,
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    yaxis: {
      labels: { style: { colors: chartStyles.textPrimary } }
    },
    grid: {
      borderColor: chartStyles.borderColor,
      strokeDashArray: 4
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: [
      { name: 'Laba Bersih', data: subCatData }
    ]
  });

  // F. Top 10 State Nasional (Chart 7 - Bar Chart)
  const stateSalesMap = {};
  currentData.forEach(d => {
    if (d.state) {
      stateSalesMap[d.state] = (stateSalesMap[d.state] || 0) + d.sales;
    }
  });

  const sortedStates = Object.keys(stateSalesMap).sort((a, b) => stateSalesMap[b] - stateSalesMap[a]).slice(0, 10);
  const stateSalesData = sortedStates.map(state => stateSalesMap[state]);

  stateChart.updateOptions({
    xaxis: {
      categories: sortedStates,
      labels: {
        style: { colors: chartStyles.textMuted },
        formatter: (val) => formatCompact(val)
      }
    },
    tooltip: {
      theme: chartStyles.themeMode,
      y: {
        formatter: (val) => formatCurrency(val)
      }
    },
    series: [
      { name: 'Penjualan', data: stateSalesData }
    ]
  });

  // G. Customer Segment Share (Chart 8 - Radial Bar)
  const segments = ['Consumer', 'Corporate', 'Home Office'];
  const segmentSalesVal = segments.map(seg => {
    return currentData
      .filter(d => d.segment === seg)
      .reduce((sum, item) => sum + item.sales, 0);
  });

  const totalSegmentSales = segmentSalesVal.reduce((a, b) => a + b, 0);
  const segmentPercentages = totalSegmentSales > 0
    ? segmentSalesVal.map(val => Number(((val / totalSegmentSales) * 100).toFixed(1)))
    : [0, 0, 0];

  lastSegmentSales = [...segmentSalesVal];

  segmentChart.updateOptions({
    colors: [chartStyles.primary, chartStyles.accent, chartStyles.warning],
    legend: {
      show: true,
      position: 'bottom',
      labels: { colors: chartStyles.textPrimary }
    },
    tooltip: {
      enabled: true,
      theme: chartStyles.themeMode,
      custom: function ({ series, seriesIndex, dataPointIndex, w }) {
        const val = lastSegmentSales[seriesIndex] || 0;
        const label = w.globals.labels[seriesIndex];
        return '<div style="padding: 8px; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: var(--font-sans);">' +
          '<span><b>' + label + '</b>: ' + formatCurrency(val) + ' (' + series[seriesIndex] + '%)</span>' +
          '</div>';
      }
    },
    series: segmentPercentages
  });
}

// Date year shifting helper for YoY Growth calculations
function shiftDateYear(dateStr, yearsShift) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + yearsShift);
  return date.toISOString().split('T')[0];
}

// Adjust Chart Styling options during Dark/Light toggles
function updateChartsTheme() {
  updateCharts();
}

// Table Processing Engine (Sorting, Search, Pagination)
function getFilteredTableData() {
  let tableData = [...currentData];

  // Apply search query
  if (tableState.searchQuery) {
    tableData = tableData.filter(d =>
      d.customerName.toLowerCase().includes(tableState.searchQuery) ||
      d.orderId.toLowerCase().includes(tableState.searchQuery) ||
      d.subCategory.toLowerCase().includes(tableState.searchQuery)
    );
  }

  // Apply sorting
  tableData.sort((a, b) => {
    let valA = a[tableState.sortColumn];
    let valB = b[tableState.sortColumn];

    // Normalize strings for sorting
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return tableState.sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return tableState.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return tableData;
}

function renderTable() {
  const filteredData = getFilteredTableData();
  const totalRecords = filteredData.length;

  // Update record count text
  document.getElementById("table-record-count").textContent = `Menampilkan ${Math.min(totalRecords, tableState.page * tableState.pageSize) === 0 ? 0 : (tableState.page - 1) * tableState.pageSize + 1} - ${Math.min(totalRecords, tableState.page * tableState.pageSize)} dari ${totalRecords} transaksi`;

  // Calculate pagination boundaries
  const totalPages = Math.max(1, Math.ceil(totalRecords / tableState.pageSize));
  if (tableState.page > totalPages) tableState.page = totalPages;

  document.getElementById("page-num-current").textContent = tableState.page;
  document.getElementById("page-num-total").textContent = totalPages;

  // Manage pagination button disable states
  document.getElementById("btn-page-prev").disabled = tableState.page === 1;
  document.getElementById("btn-page-next").disabled = tableState.page === totalPages;

  // Slice active page records
  const startIdx = (tableState.page - 1) * tableState.pageSize;
  const pageData = filteredData.slice(startIdx, startIdx + tableState.pageSize);

  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">Tidak ada transaksi yang cocok dengan kueri pencarian.</td></tr>`;
    return;
  }

  // Draw rows
  pageData.forEach(row => {
    const isProfitable = row.profit >= 0;
    const tr = document.createElement("tr");

    const displayRegion = row.region;
    const displayCategory = row.category;
    const displaySubCategory = row.subCategory;

    tr.innerHTML = `
      <td>${row.orderId}</td>
      <td>${formatDate(row.orderDate)}</td>
      <td>${row.customerName}</td>
      <td>${displayRegion}</td>
      <td>${displayCategory}</td>
      <td>${displaySubCategory}</td>
      <td><strong>${formatCurrency(row.sales)}</strong></td>
      <td class="${isProfitable ? 'trend-positive' : 'trend-negative'}"><strong>${isProfitable ? '+' : ''}${formatCurrency(row.profit)}</strong></td>
      <td>
        <span class="status-pill ${isProfitable ? 'status-profitable' : 'status-loss'}">
          ${isProfitable ? 'Untung' : 'Rugi'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update Sorting Carets visually
  const headers = document.querySelectorAll("#orders-table th.sortable");
  headers.forEach(h => {
    const col = h.getAttribute("data-sort");
    const icon = h.querySelector("i");
    if (tableState.sortColumn === col) {
      icon.setAttribute("data-lucide", tableState.sortDirection === 'asc' ? 'chevron-up' : 'chevron-down');
      h.classList.add("active-sort");
    } else {
      icon.setAttribute("data-lucide", "chevrons-up-down");
      h.classList.remove("active-sort");
    }
  });

  lucide.createIcons();
}

// Helpers
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function formatCompact(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1
  }).format(value);
}

function formatDate(dateString) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('id-ID', options);
}

// Formats 2025-01 into Jan 25
function formatMonthLabel(monthStr) {
  const parts = monthStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthIdx = parseInt(parts[1]) - 1;
  const yearShort = parts[0].substring(2);
  return `${months[monthIdx]} '${yearShort}`;
}

// Helper to pull colors directly from CSS configurations
function getChartThemeColors() {
  const style = getComputedStyle(document.documentElement);

  const cleanHex = (cssVar) => {
    return style.getPropertyValue(cssVar).trim();
  };

  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";

  return {
    themeMode: currentTheme,
    primary: cleanHex('--primary') || '#6366f1',
    success: cleanHex('--success') || '#10b981',
    danger: cleanHex('--danger') || '#f43f5e',
    accent: cleanHex('--accent') || '#06b6d4',
    textPrimary: cleanHex('--text-primary') || '#f8fafc',
    textSecondary: cleanHex('--text-secondary') || '#94a3b8',
    textMuted: cleanHex('--text-muted') || '#64748b',
    borderColor: cleanHex('--border-color') || 'rgba(255,255,255,0.07)'
  };
}

// Storytelling Assessment Logic
function setupAssessmentListeners() {
  // Sync dropdowns to dotted dropzones
  const selects = document.querySelectorAll(".story-arc-select");
  selects.forEach(select => {
    select.addEventListener("change", (e) => {
      const col = e.target.getAttribute("data-column");
      const dropzone = document.getElementById(`dropzone-${col}`);
      const val = e.target.value;

      if (val) {
        dropzone.textContent = val;
        dropzone.classList.add("filled");
      } else {
        dropzone.textContent = "--";
        dropzone.classList.remove("filled");
      }
    });
  });

  // Save button
  const saveBtn = document.getElementById("btn-save-assessment");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveAssessmentData();
    });
  }

  // Reset button
  const resetBtn = document.getElementById("btn-reset-assessment");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Apakah Anda yakin ingin menghapus semua data evaluasi?")) {
        resetAssessmentData();
      }
    });
  }

  // Print button
  const printBtn = document.getElementById("btn-print-assessment");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }
}

function saveAssessmentData() {
  const data = {
    storyArc: {
      hook: document.getElementById("arc-hook-select").value,
      context: document.getElementById("arc-context-select").value,
      tension: document.getElementById("arc-tension-select").value,
      climax: document.getElementById("arc-climax-select").value,
      insight: document.getElementById("arc-insight-select").value,
      action: document.getElementById("arc-action-select").value,
      description: document.getElementById("story-arc-description").value
    },
    soWhat: {
      chart1: {
        text: document.getElementById("so-what-chart-1").value,
        status: document.getElementById("status-chart-1").value
      },
      chart2: {
        text: document.getElementById("so-what-chart-2").value,
        status: document.getElementById("status-chart-2").value
      },
      chart3: {
        text: document.getElementById("so-what-chart-3").value,
        status: document.getElementById("status-chart-3").value
      },
      chart4: {
        text: document.getElementById("so-what-chart-4").value,
        status: document.getElementById("status-chart-4").value
      },
      chart5: {
        text: document.getElementById("so-what-chart-5").value,
        status: document.getElementById("status-chart-5").value
      },
      chart6: {
        text: document.getElementById("so-what-chart-6").value,
        status: document.getElementById("status-chart-6").value
      },
      chart7: {
        text: document.getElementById("so-what-chart-7").value,
        status: document.getElementById("status-chart-7").value
      },
      chart8: {
        text: document.getElementById("so-what-chart-8").value,
        status: document.getElementById("status-chart-8").value
      },
      summary: document.getElementById("so-what-summary").value
    },
    visualChecklist: {
      item1: document.getElementById("checklist-item-1").checked,
      item2: document.getElementById("checklist-item-2").checked,
      item3: document.getElementById("checklist-item-3").checked,
      item4: document.getElementById("checklist-item-4").checked,
      item5: document.getElementById("checklist-item-5").checked,
      item6: document.getElementById("checklist-item-6").checked,
      item7: document.getElementById("checklist-item-7").checked,
      item8: document.getElementById("checklist-item-8").checked,
      comments: document.getElementById("visual-hierarchy-comments").value
    },
    recommendations: {
      reco1: {
        element: document.getElementById("reco-1-element").value,
        dimension: document.getElementById("reco-1-dimension").value,
        before: document.getElementById("reco-1-before").value,
        after: document.getElementById("reco-1-after").value,
        justification: document.getElementById("reco-1-justification").value
      },
      reco2: {
        element: document.getElementById("reco-2-element").value,
        dimension: document.getElementById("reco-2-dimension").value,
        before: document.getElementById("reco-2-before").value,
        after: document.getElementById("reco-2-after").value,
        justification: document.getElementById("reco-2-justification").value
      },
      reco3: {
        element: document.getElementById("reco-3-element").value,
        dimension: document.getElementById("reco-3-dimension").value,
        before: document.getElementById("reco-3-before").value,
        after: document.getElementById("reco-3-after").value,
        justification: document.getElementById("reco-3-justification").value
      }
    }
  };

  localStorage.setItem("superstore_storytelling_assessment", JSON.stringify(data));
  alert("Data evaluasi berhasil disimpan ke browser!");
}

function loadAssessmentData() {
  const saved = localStorage.getItem("superstore_storytelling_assessment");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);

    // Load Story Arc
    if (data.storyArc) {
      const stages = ["hook", "context", "tension", "climax", "insight", "action"];
      stages.forEach(stage => {
        const val = data.storyArc[stage] || "";
        const selectEl = document.getElementById(`arc-${stage}-select`);
        const dropzoneEl = document.getElementById(`dropzone-${stage}`);
        if (selectEl) selectEl.value = val;
        if (dropzoneEl) {
          if (val) {
            dropzoneEl.textContent = val;
            dropzoneEl.classList.add("filled");
          } else {
            dropzoneEl.textContent = "--";
            dropzoneEl.classList.remove("filled");
          }
        }
      });
      const descEl = document.getElementById("story-arc-description");
      if (descEl) descEl.value = data.storyArc.description || "";
    }

    // Load So What Test
    if (data.soWhat) {
      for (let i = 1; i <= 8; i++) {
        const cData = data.soWhat[`chart${i}`];
        if (cData) {
          const inputEl = document.getElementById(`so-what-chart-${i}`);
          const selectEl = document.getElementById(`status-chart-${i}`);
          if (inputEl) inputEl.value = cData.text || "";
          if (selectEl) selectEl.value = cData.status || "";
        }
      }
      const sumEl = document.getElementById("so-what-summary");
      if (sumEl) sumEl.value = data.soWhat.summary || "";
    }

    // Load Visual Checklist
    if (data.visualChecklist) {
      for (let i = 1; i <= 8; i++) {
        const checked = data.visualChecklist[`item${i}`];
        const cbEl = document.getElementById(`checklist-item-${i}`);
        if (cbEl) cbEl.checked = !!checked;
      }
      const commEl = document.getElementById("visual-hierarchy-comments");
      if (commEl) commEl.value = data.visualChecklist.comments || "";
    }

    // Load Recommendations
    if (data.recommendations) {
      for (let i = 1; i <= 3; i++) {
        const rData = data.recommendations[`reco${i}`];
        if (rData) {
          const elemEl = document.getElementById(`reco-${i}-element`);
          const dimEl = document.getElementById(`reco-${i}-dimension`);
          const befEl = document.getElementById(`reco-${i}-before`);
          const aftEl = document.getElementById(`reco-${i}-after`);
          const justEl = document.getElementById(`reco-${i}-justification`);

          if (elemEl) elemEl.value = rData.element || "";
          if (dimEl) dimEl.value = rData.dimension || "";
          if (befEl) befEl.value = rData.before || "";
          if (aftEl) aftEl.value = rData.after || "";
          if (justEl) justEl.value = rData.justification || "";
        }
      }
    }
  } catch (e) {
    console.error("Error loading assessment data", e);
  }
}

function resetAssessmentData() {
  localStorage.removeItem("superstore_storytelling_assessment");

  // Reset Story Arc
  const stages = ["hook", "context", "tension", "climax", "insight", "action"];
  stages.forEach(stage => {
    const selectEl = document.getElementById(`arc-${stage}-select`);
    const dropzoneEl = document.getElementById(`dropzone-${stage}`);
    if (selectEl) selectEl.value = "";
    if (dropzoneEl) {
      dropzoneEl.textContent = "--";
      dropzoneEl.classList.remove("filled");
    }
  });
  document.getElementById("story-arc-description").value = "";

  // Reset So What Test
  for (let i = 1; i <= 8; i++) {
    const inputEl = document.getElementById(`so-what-chart-${i}`);
    const selectEl = document.getElementById(`status-chart-${i}`);
    if (inputEl) inputEl.value = "";
    if (selectEl) selectEl.value = "";
  }
  document.getElementById("so-what-summary").value = "";

  // Reset Visual Checklist
  for (let i = 1; i <= 8; i++) {
    const cbEl = document.getElementById(`checklist-item-${i}`);
    if (cbEl) cbEl.checked = false;
  }
  document.getElementById("visual-hierarchy-comments").value = "";

  // Reset Recommendations
  for (let i = 1; i <= 3; i++) {
    const elemEl = document.getElementById(`reco-${i}-element`);
    const dimEl = document.getElementById(`reco-${i}-dimension`);
    const befEl = document.getElementById(`reco-${i}-before`);
    const aftEl = document.getElementById(`reco-${i}-after`);
    const justEl = document.getElementById(`reco-${i}-justification`);

    if (elemEl) elemEl.value = "";
    if (dimEl) dimEl.value = "";
    if (befEl) befEl.value = "";
    if (aftEl) aftEl.value = "";
    if (justEl) justEl.value = "";
  }
}
