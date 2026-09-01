let API_BASE = "/api";
if (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '5000')) {
    API_BASE = "http://localhost:5000/api";
}

const notificationSound = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"+ "A".repeat(100));
const audioUrl = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
const alertAudio = new Audio(audioUrl);

let currentUser = null;
let currentCart = [];
let currentCategory = 'all';
let profitChartInstance = null;
let previousPendingCount = 0;

let adminOrdersCategory = 'all';
let chefOrdersCategory = 'active';

// Application state from DB
let state = {
    users: [],
    menu: [],
    categories: [],
    orders: [],
    notifications: []
};

const sections = {
    login: document.getElementById('login-section'),
    admin: document.getElementById('admin-dashboard'),
    chef: document.getElementById('chef-dashboard'),
    waiter: document.getElementById('waiter-dashboard')
};

async function fetchData() {
    try {
        const res = await fetch(`${API_BASE}/init`);
        const data = await res.json();
        state.users = data.users || [];
        state.menu = data.menu || [];
        state.categories = data.categories || [];
        state.settings = data.settings || {};
        applySettings();
        state.orders = data.orders || [];
        state.notifications = data.notifications || [];
    } catch(e) {
        console.error("Backend ulanmadi", e);
    }
}

let previousStateStr = '';

async function init() {
    // Check if user is logged in
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        showDashboard(currentUser.role); // Show immediately
    } else {
        showSection('login');
    }

    await fetchData();
    previousStateStr = JSON.stringify(state);
    
    if (currentUser) {
        updateDashboards(currentUser.role, true); // Re-render with data
    }
    
    setupEventListeners();
    
    // Auto refresh data
    setInterval(async () => {
        if(currentUser) {
            await fetchData();
            const currentStateStr = JSON.stringify(state);
            if (currentStateStr !== previousStateStr) {
                previousStateStr = currentStateStr;
                updateDashboards(currentUser.role, false);
                checkAudioAlert();
            }
        }
    }, 3000);
}

function login(loginStr, passwordStr) {
    const user = state.users.find(u => u.login === loginStr && u.password === passwordStr);
    if (user) {
        currentUser = user;
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('login-error').textContent = '';
        showToast(`Xush kelibsiz, ${currentUser.name}!`, 'success');
        showDashboard(currentUser.role);
        alertAudio.play().then(() => { alertAudio.pause(); alertAudio.currentTime = 0; }).catch(()=>{});
    } else {
        document.getElementById('login-error').textContent = 'Login yoki parol xato';
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    showSection('login');
}

function showSection(sectionId) {
    Object.values(sections).forEach(s => s.classList.remove('active'));
    if (sections[sectionId]) sections[sectionId].classList.add('active');
}

function showDashboard(role) {
    showSection(role);
    updateDashboards(role, true);
}

function updateDashboards(role, renderChartAnim = false) {
    if (role === 'admin') renderAdminDashboard(renderChartAnim);
    else if (role === 'chef') renderChefDashboard();
    else if (role === 'waiter') renderWaiterDashboard();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : type === 'danger' ? 'fa-times-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function applySettings() {
    const s = state.settings || {};
    const getSetting = (k, def) => s[k] || def;
    
    const style = document.getElementById('dynamic-theme');
    if (style) {
        style.innerHTML = `
            :root {
                --primary-color: ${getSetting('primary_color', '#4f46e5')} !important;
                --accent-color: ${getSetting('accent_color', '#ec4899')} !important;
            }
            body { font-family: '${getSetting('font_family', 'Inter')}', sans-serif; }
        `;
    }
    
    document.querySelectorAll('.app-name-display').forEach(el => {
        el.textContent = getSetting('app_name', 'Gourmet Manager Pro');
    });
    
    const logoClass = getSetting('logo_icon', 'fa-utensils');
    document.querySelectorAll('.app-logo-icon').forEach(el => {
        if (logoClass.startsWith('data:image') || logoClass.startsWith('http')) {
            el.innerHTML = `<img src="${logoClass}" style="width: 100%; height: 100%; object-fit: contain;">`;
            el.className = 'app-logo-icon';
            el.style.display = 'inline-block';
            el.style.width = '30px';
            el.style.height = '30px';
        } else {
            el.innerHTML = '';
            el.className = 'app-logo-icon fas ' + (logoClass.startsWith('fa-') ? logoClass : 'fa-' + logoClass);
            el.style.width = '';
            el.style.height = '';
        }
    });
}


// --- Admin ---
function renderAdminSettings() {
    const s = state.settings || {};
    document.getElementById('setting-app-name').value = s.app_name || 'Gourmet Manager Pro';
    document.getElementById('setting-logo-icon').value = s.logo_icon || 'fa-utensils';
    document.getElementById('setting-primary-color').value = s.primary_color || '#4f46e5';
    document.getElementById('setting-accent-color').value = s.accent_color || '#ec4899';
    document.getElementById('setting-font-family').value = s.font_family || 'Inter';
    document.getElementById('setting-language').value = s.language || 'uz';
    const uploadInput = document.getElementById('setting-logo-upload');
    if(uploadInput) uploadInput.value = '';
}

document.getElementById('settings-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    let logoVal = document.getElementById('setting-logo-icon').value;
    const fileInput = document.getElementById('setting-logo-upload');
    
    const save = async (finalLogo) => {
        const settings = {
            app_name: document.getElementById('setting-app-name').value,
            logo_icon: finalLogo,
            primary_color: document.getElementById('setting-primary-color').value,
            accent_color: document.getElementById('setting-accent-color').value,
            font_family: document.getElementById('setting-font-family').value,
            language: document.getElementById('setting-language').value
        };
        try {
            await fetch(`${API_BASE}/settings`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings) });
            showToast("Sozlamalar saqlandi", "success");
            await fetchData();
        } catch(err) {
            showToast("Xatolik", "error");
        }
    };

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            save(evt.target.result);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        save(logoVal);
    }
});

function renderAdminDashboard(renderChartAnim) {
    renderAdminSettings();
    const completedOrders = state.orders.filter(o => o.status === 'ready' || o.status === 'completed');
    const profit = completedOrders.reduce((sum, o) => sum + o.total, 0);
    document.getElementById('admin-total-profit').textContent = `$${profit.toFixed(2)}`;
    document.getElementById('admin-total-orders').textContent = state.orders.length;
    
    document.getElementById('admin-total-chefs').textContent = state.users.filter(u => u.role === 'chef').length;
    document.getElementById('admin-total-waiters').textContent = state.users.filter(u => u.role === 'waiter').length;
    document.getElementById('admin-total-menus').textContent = state.menu.length;

    if (renderChartAnim) renderChart(completedOrders);
    
    // Only re-render tables if they changed (simple optimization for polling)
    renderUsersTable(state.users.filter(u => u.role === 'chef'), 'admin-chefs-table');
    renderUsersTable(state.users.filter(u => u.role === 'waiter'), 'admin-waiters-table');
    renderAdminMenuGrid(state.menu);
    renderAdminCategories();

    // Update Employee filter options in Orders View
    const employeeFilter = document.getElementById('admin-employee-filter');
    if (employeeFilter) {
        const currentVal = employeeFilter.value;
        let optionsHtml = '<option value="all">Barcha Xodimlar (Oshpaz va Ofitsiantlar)</option>';
        state.users.filter(u => u.role !== 'admin').forEach(u => {
            optionsHtml += `<option value="${u.id}">${u.name} (${u.role === 'waiter' ? 'Ofitsiant' : 'Oshpaz'})</option>`;
        });
        employeeFilter.innerHTML = optionsHtml;
        employeeFilter.value = currentVal || 'all';
    }

    renderAdminOrders();
}

function renderChart(completedOrders) {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;
    const data = [0, 0, 0, 0, 0, 0, completedOrders.reduce((sum, o) => sum + o.total, 0)];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];

    if (profitChartInstance) profitChartInstance.destroy();
    profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kunlik Foyda ($)', data: data, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', tension: 0.4, fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { color: 'rgba(255,255,255,0.05)' } } }, plugins: { legend: { labels: { color: '#f8fafc' } } } }
    });
}

function renderAdminCategories() {
    const tbody = document.getElementById('admin-categories-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.categories.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td><span class="badge" style="text-transform:none;">${c.value}</span></td>
                <td>
                    <button class="btn icon-btn text-warning" onclick="editCategory('${c.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn icon-btn text-danger" onclick="deleteCategory('${c.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

function renderUsersTable(usersList, tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    tbody.innerHTML = '';
    usersList.forEach(u => {
        let userOrders = [];
        if (u.role === 'waiter') userOrders = state.orders.filter(o => o.waiterId === u.login);
        else if (u.role === 'chef') userOrders = state.orders.filter(o => o.chefId === u.id && (o.status === 'ready' || o.status === 'completed'));
        
        let totalIncome = userOrders.reduce((sum, o) => sum + o.total, 0);
        let count = userOrders.length;
        
        tbody.innerHTML += `
            <tr onclick="viewUserStats(${u.id})" style="cursor:pointer;" title="Statistikani ko'rish">
                <td>${u.name}</td><td>${u.phone}</td><td>${u.login}</td><td>***</td>
                <td><span style="color:var(--text-secondary);">${count} ta</span> / <strong style="color:var(--success-color);">$${totalIncome.toFixed(2)}</strong></td>
                <td onclick="event.stopPropagation()">
                    <button class="btn icon-btn text-warning" onclick="editUser(${u.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn icon-btn text-danger" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

function renderAdminMenuGrid(menuList) {
    const container = document.getElementById('admin-menus-grid');
    if (!container) return;
    container.innerHTML = '';
    menuList.forEach(m => {
        let iconHtml = m.icon.startsWith('http') || m.icon.startsWith('data:') ? `<img src="${m.icon}">` : m.icon;
        let catObj = state.categories.find(c => c.value === m.category);
        let catName = catObj ? catObj.name : m.category;
        container.innerHTML += `
            <div class="menu-item" onclick="editMenu(${m.id})">
                <div class="menu-item-icon">${iconHtml}</div>
                <h4>${m.name}</h4><div class="price">$${m.price.toFixed(2)}</div>
                <span class="badge" style="margin-top:0.5rem; text-transform:capitalize;">${catName}</span>
            </div>`;
    });
}

function renderAdminOrders() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    container.innerHTML = '';
    
    const employeeFilter = document.getElementById('admin-employee-filter');
    const selectedEmployeeId = employeeFilter ? employeeFilter.value : 'all';

    let filteredOrders = state.orders;
    
    if (adminOrdersCategory !== 'all') {
        filteredOrders = filteredOrders.filter(o => o.status === adminOrdersCategory);
    }
    
    if (selectedEmployeeId !== 'all') {
        filteredOrders = filteredOrders.filter(o => 
            String(o.waiterId) === String(selectedEmployeeId) || 
            String(o.chefId) === String(selectedEmployeeId)
        );
    }
    
    filteredOrders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="grid-column: 1/-1; text-align: center;">Zakazlar topilmadi.</p>';
        return;
    }
    
    filteredOrders.forEach(order => {
        const waiter = state.users.find(u => u.login === order.waiterId) || {name: 'Noma\'lum'};
        const chef = state.users.find(u => u.id === order.chefId);
        const chefName = chef ? chef.name : 'Taqsimlanmagan';
        let statusBadge = '';
        if (order.status === 'pending') statusBadge = '<span class="badge" style="background: var(--warning-color)">Yangi</span>';
        else if (order.status === 'preparing') statusBadge = '<span class="badge" style="background: var(--primary-color)">Tayyorlanmoqda</span>';
        else if (order.status === 'ready') statusBadge = '<span class="badge" style="background: var(--success-color)">Tayyor</span>';
        else if (order.status === 'cancelled') statusBadge = '<span class="badge" style="background: var(--danger-color)">Bekor qilingan</span>';
        
        let itemsHtml = order.items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('');
        container.innerHTML += `
            <div class="order-card">
                <div class="order-header"><h3>Stol ${order.table}</h3>${statusBadge}</div>
                <div class="order-meta">
                    <span><i class="fas fa-user-tie"></i> Ofitsiant: ${waiter.name}</span>
                    <span><i class="fas fa-fire"></i> Oshpaz: ${chefName}</span>
                    <span><i class="fas fa-clock"></i> ${new Date(order.timestamp).toLocaleString()}</span>
                </div>
                <ul class="order-items-list" style="margin-top:0.5rem; max-height:100px; overflow-y:auto;">${itemsHtml}</ul>
                <div style="margin-top:auto; font-weight:bold; text-align:right; border-top:1px solid var(--border-color); padding-top:0.5rem;">
                    Umumiy: $${order.total.toFixed(2)}
                </div>
            </div>`;
    });
}

// User CRUD
function generateCredentials() {
    document.getElementById('staff-login').value = Math.floor(100 + Math.random() * 900).toString();
    document.getElementById('staff-password').value = Math.floor(100 + Math.random() * 900).toString();
}

document.getElementById('staff-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('staff-id').value;
    const user = {
        id: id ? parseInt(id) : Date.now(),
        role: document.getElementById('staff-role').value,
        name: document.getElementById('staff-name').value,
        phone: document.getElementById('staff-phone').value,
        login: document.getElementById('staff-login').value,
        password: document.getElementById('staff-password').value
    };
    
    await fetch(`${API_BASE}/users`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(user) });
    showToast(id ? "Xodim yangilandi" : "Xodim qo'shildi", "success");
    closeModal('staff-modal');
    await fetchData(); updateDashboards('admin');
});

window.editUser = function(id) {
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    document.getElementById('staff-id').value = user.id;
    document.getElementById('staff-role').value = user.role;
    document.getElementById('staff-name').value = user.name;
    document.getElementById('staff-phone').value = user.phone;
    document.getElementById('staff-login').value = user.login;
    document.getElementById('staff-password').value = user.password;
    document.getElementById('staff-modal-title').textContent = "Xodimni Tahrirlash";
    document.getElementById('staff-modal').classList.add('active');
};

window.deleteUser = async function(id) {
    if(!confirm("Haqiqatan ham o'chirasizmi?")) return;
    await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    showToast("O'chirildi", "success");
    await fetchData(); updateDashboards('admin');
};

let currentUserStatsId = null;
let currentStatsFilter = 'all';
let currentStatsDateFilter = 'all';

window.viewUserStats = function(id) {
    currentUserStatsId = id;
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    
    // Set basic info
    document.getElementById('stats-name').textContent = user.name;
    document.getElementById('stats-role').textContent = user.role === 'chef' ? 'Oshpaz' : 'Ofitsiant';
    document.getElementById('stats-phone-val').textContent = user.phone;
    document.getElementById('stats-login-val').textContent = user.login;
    document.getElementById('stats-password-val').textContent = user.password;
    
    const icon = document.getElementById('stats-avatar-icon');
    icon.className = user.role === 'chef' ? 'fas fa-fire' : 'fas fa-user-tie';

    // Reset filters visual state
    document.querySelectorAll('#stats-order-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('#stats-order-filters .filter-btn[data-status="all"]').classList.add('active');
    currentStatsFilter = 'all';

    document.querySelectorAll('#stats-date-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('#stats-date-filters .filter-btn[data-date="all"]').classList.add('active');
    currentStatsDateFilter = 'all';

    renderUserStatsOrders();
    document.getElementById('user-stats-modal').classList.add('active');
};

window.filterUserStatsDate = function(dateFilter) {
    currentStatsDateFilter = dateFilter;
    document.querySelectorAll('#stats-date-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.date === dateFilter) btn.classList.add('active');
    });
    renderUserStatsOrders();
};


window.filterUserStatsOrders = function(status) {
    currentStatsFilter = status;
    document.querySelectorAll('#stats-order-filters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.status === status) btn.classList.add('active');
    });
    renderUserStatsOrders();
};

function renderUserStatsOrders() {
    if (!currentUserStatsId) return;
    const user = state.users.find(u => u.id === currentUserStatsId);
    if (!user) return;
    
    let allUserOrders = [];
    if (user.role === 'waiter') allUserOrders = state.orders.filter(o => o.waiterId === user.login);
    else if (user.role === 'chef') allUserOrders = state.orders.filter(o => o.chefId === user.id);
    
    // Apply Date Filter
    let dateFilteredOrders = allUserOrders;
    const now = new Date();
    if (currentStatsDateFilter === 'today') {
        dateFilteredOrders = allUserOrders.filter(o => {
            const d = new Date(o.timestamp);
            return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    } else if (currentStatsDateFilter === 'month') {
        dateFilteredOrders = allUserOrders.filter(o => {
            const d = new Date(o.timestamp);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    }

    // Total income calculation always includes only ready/completed for real income
    const completedOrders = dateFilteredOrders.filter(o => o.status === 'ready' || o.status === 'completed');
    document.getElementById('stats-total-orders').textContent = dateFilteredOrders.length;
    document.getElementById('stats-total-income').textContent = `$${completedOrders.reduce((sum, o) => sum + o.total, 0).toFixed(2)}`;

    let filteredOrders = dateFilteredOrders;
    if (currentStatsFilter !== 'all') {
        filteredOrders = dateFilteredOrders.filter(o => o.status === currentStatsFilter);
    }
    
    const container = document.getElementById('stats-orders-list');
    if(container) {
        container.innerHTML = '';
        if(filteredOrders.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top: 2rem;">Zakazlar mavjud emas.</p>';
        } else {
            filteredOrders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            filteredOrders.forEach(o => {
                let itemsHtml = o.items.map(i => `<b>${i.qty}x</b> ${i.name}`).join(', ');
                let statusColor = 'var(--primary-color)';
                let statusText = 'Yangi';
                if(o.status === 'ready') { statusColor = 'var(--success-color)'; statusText = 'Tayyor'; }
                else if(o.status === 'cancelled') { statusColor = 'var(--danger-color)'; statusText = 'Bekor'; }
                else if(o.status === 'preparing') { statusColor = 'var(--warning-color)'; statusText = 'Jarayonda'; }
                
                container.innerHTML += `
                    <div style="background: white; padding: 1rem; border-radius: var(--radius-md); margin-bottom: 0.75rem; border-left: 4px solid ${statusColor}; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-top: 1px solid var(--border-color); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem; align-items: center;">
                            <strong style="font-size: 1.1rem;">Stol ${o.table}</strong>
                            <div>
                                <span class="badge" style="background: ${statusColor}; color: white; margin-right: 0.5rem;">${statusText}</span>
                                <span style="color:var(--success-color); font-weight:bold; font-size: 1.1rem;">$${o.total.toFixed(2)}</span>
                            </div>
                        </div>
                        <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:0.5rem; line-height: 1.4;">${itemsHtml}</p>
                        <small style="color:var(--text-secondary); font-size:0.75rem;"><i class="fas fa-clock mr-2"></i> ${new Date(o.timestamp).toLocaleString()}</small>
                    </div>`;
            });
        }
    }
}

// Menu CRUD
document.getElementById('menu-image-upload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if(w>h) { if(w>300) { h*=300/w; w=300; } } else { if(h>300) { w*=300/h; h=300; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                document.getElementById('menu-icon').value = canvas.toDataURL('image/jpeg', 0.8);
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('menu-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('menu-id').value;
    const item = {
        id: id ? parseInt(id) : Date.now(),
        icon: document.getElementById('menu-icon').value,
        name: document.getElementById('menu-name').value,
        category: document.getElementById('menu-category').value,
        price: parseFloat(document.getElementById('menu-price').value)
    };
    await fetch(`${API_BASE}/menus`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item) });
    showToast(id ? "Taom yangilandi" : "Taom qo'shildi", "success");
    closeModal('menu-modal');
    await fetchData(); updateDashboards('admin');
});

window.editMenu = function(id) {
    const item = state.menu.find(m => m.id === id);
    if (!item) return;
    const catSelect = document.getElementById('menu-category');
    if (catSelect) catSelect.innerHTML = '<option value="" disabled>Kategoriya tanlang</option>' + state.categories.map(c => `<option value="${c.value}">${c.name}</option>`).join('');
    document.getElementById('menu-id').value = item.id;
    document.getElementById('menu-icon').value = item.icon;
    document.getElementById('menu-name').value = item.name;
    document.getElementById('menu-category').value = item.category;
    document.getElementById('menu-price').value = item.price;
    document.getElementById('menu-modal-title').textContent = "Taomni Tahrirlash";
    document.getElementById('btn-delete-menu').style.display = 'block';
    document.getElementById('menu-modal').classList.add('active');
};

window.deleteMenuFromModal = function() {
    const id = document.getElementById('menu-id').value;
    if (id) deleteMenu(parseInt(id));
};

window.deleteMenu = async function(id) {
    if(!confirm("Haqiqatan ham o'chirasizmi?")) return;
    await fetch(`${API_BASE}/menus/${id}`, { method: 'DELETE' });
    showToast("O'chirildi", "success");
    closeModal('menu-modal');
    await fetchData(); updateDashboards('admin');
};

// Categories CRUD
document.getElementById('category-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value;
    let val = document.getElementById('category-value').value;
    if (!val) {
        val = 'cat_' + Date.now();
    }
    const cat = {
        id: id ? id : 'cat_' + Date.now(),
        name: name,
        value: val
    };
    await fetch(`${API_BASE}/categories`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cat) });
    showToast(id ? "Kategoriya yangilandi" : "Kategoriya qo'shildi", "success");
    closeModal('category-modal');
    await fetchData(); updateDashboards('admin');
});

window.editCategory = function(id) {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('category-id').value = cat.id;
    document.getElementById('category-name').value = cat.name;
    document.getElementById('category-value').value = cat.value;
    document.getElementById('category-modal-title').textContent = "Kategoriyani Tahrirlash";
    document.getElementById('category-modal').classList.add('active');
};

window.deleteCategory = async function(id) {
    if(!confirm("Haqiqatan ham o'chirasizmi?")) return;
    await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
    showToast("O'chirildi", "success");
    await fetchData(); updateDashboards('admin');
};

// --- Chef ---
function renderChefDashboard() {
    document.getElementById('chef-sidebar-name').textContent = currentUser.name;
    const pendingOrders = state.orders.filter(o => o.status === 'pending');
    const preparingOrders = state.orders.filter(o => o.status === 'preparing' && o.chefId === currentUser.id);
    const readyOrders = state.orders.filter(o => o.status === 'ready' && o.chefId === currentUser.id);
    
    document.getElementById('chef-stat-received').textContent = pendingOrders.length;
    document.getElementById('chef-stat-preparing').textContent = preparingOrders.length;
    document.getElementById('chef-stat-ready').textContent = readyOrders.length;
    document.getElementById('chef-stat-earned').textContent = `$${readyOrders.reduce((s,o)=>s+o.total,0).toFixed(2)}`;

    const container = document.getElementById('chef-orders-container');
    if (!container) return;
    container.innerHTML = '';
    
    let displayOrders = chefOrdersCategory === 'active' ? [...pendingOrders, ...preparingOrders] : state.orders.filter(o => o.status === chefOrdersCategory && o.chefId === currentUser.id);
    displayOrders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (displayOrders.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="grid-column: 1/-1; text-align: center;">Zakazlar topilmadi.</p>';
        return;
    }
    
    displayOrders.forEach(order => {
        const waiter = state.users.find(u => u.login === order.waiterId) || {name: 'Noma\'lum'};
        const isPending = order.status === 'pending';
        const isReady = order.status === 'ready';
        const isCancelled = order.status === 'cancelled';
        
        let itemsHtml = order.items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('');
        let actionButtons = '';
        if (isPending) actionButtons = `<button class="btn danger-btn" onclick="updateOrderStatus('${order.id}', 'cancelled')">Bekor Qilish</button><button class="btn primary-btn" onclick="updateOrderStatus('${order.id}', 'preparing')">Qabul Qilish</button>`;
        else if (order.status === 'preparing') actionButtons = `<button class="btn success-btn" onclick="updateOrderStatus('${order.id}', 'ready')"><i class="fas fa-check"></i> Tayyor (Tugatish)</button>`;
        else actionButtons = `<span style="color:var(--text-secondary); font-weight:bold;">${isReady ? 'Tugatilgan' : 'Bekor Qilingan'}</span>`;
        
        let badgeColor = isPending ? 'var(--warning-color)' : (isReady ? 'var(--success-color)' : (isCancelled ? 'var(--danger-color)' : 'var(--primary-color)'));
        let badgeText = isPending ? 'Yangi' : (isReady ? 'Tayyor' : (isCancelled ? 'Bekor' : 'Tayyorlanmoqda'));
        
        container.innerHTML += `
            <div class="order-card" style="border-left: 4px solid ${badgeColor}">
                <div class="order-header"><h3>Stol ${order.table}</h3><span class="badge" style="background: ${badgeColor}">${badgeText}</span></div>
                <div class="order-meta">
                    <span><i class="fas fa-user-tie"></i> ${waiter.name}</span>
                    <span><i class="fas fa-clock"></i> ${new Date(order.timestamp).toLocaleTimeString()}</span>
                </div>
                <ul class="order-items-list">${itemsHtml}</ul>
                <div class="order-actions">${actionButtons}</div>
            </div>`;
    });
}

let previousReadyCount = 0;

function checkAudioAlert() {
    if (!currentUser) return;
    if (currentUser.role === 'chef') {
        const pendingCount = state.orders.filter(o => o.status === 'pending').length;
        if (pendingCount > previousPendingCount) {
            alertAudio.play().catch(()=>{});
            showToast("Yangi Zakaz keldi!", "warning");
        }
        previousPendingCount = pendingCount;
    } else if (currentUser.role === 'waiter') {
        const readyCount = state.orders.filter(o => o.waiterId === currentUser.login && o.status === 'ready').length;
        if (readyCount > previousReadyCount) {
            alertAudio.play().catch(()=>{});
            showToast("Buyurtma Tayyor bo'ldi!", "success");
        }
        previousReadyCount = readyCount;
    }
}

window.updateOrderStatus = async function(orderId, newStatus) {
    const payload = { status: newStatus };
    if (newStatus === 'preparing' || newStatus === 'ready' || newStatus === 'cancelled') payload.chefId = currentUser.id;
    
    await fetch(`${API_BASE}/orders/${orderId}/status`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    
    const order = state.orders.find(o => o.id === orderId);
    if (newStatus === 'ready' && order) await createNotification(order.waiterId, `Stol ${order.table} buyurtmasi TAYYOR!`, 'success');
    else if (newStatus === 'cancelled' && order) await createNotification(order.waiterId, `Stol ${order.table} buyurtmasi BEKOR qilindi.`, 'danger');
    
    await fetchData(); updateDashboards('chef');
};

// --- Waiter ---
window.setWaiterCategory = function(btn, category) {
    const filterContainer = document.getElementById('waiter-menu-filters');
    if (filterContainer) {
        filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    currentCategory = category;
    renderWaiterMenu();
};

function renderWaiterDashboard() {
    document.getElementById('waiter-sidebar-name').textContent = currentUser.name;
    
    // Render dynamic filters
    const filterContainer = document.getElementById('waiter-menu-filters');
    if (filterContainer) {
        let html = `<button class="filter-btn ${currentCategory === 'all' ? 'active' : ''}" onclick="setWaiterCategory(this, 'all')">Hammasi</button>`;
        state.categories.forEach(c => {
            html += `<button class="filter-btn ${currentCategory === c.value ? 'active' : ''}" onclick="setWaiterCategory(this, '${c.value}')">${c.name}</button>`;
        });
        filterContainer.innerHTML = html;
    }

    renderWaiterMenu();
    renderCart();
    checkNotifications();
    renderWaiterOrders();
}

function renderWaiterOrders() {
    const container = document.getElementById('waiter-orders-container');
    if (!container) return;
    
    let waiterOrders = state.orders.filter(o => o.waiterId === currentUser.login);
    let totalIncome = waiterOrders.reduce((sum, o) => sum + o.total, 0);
    waiterOrders.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    container.innerHTML = `<div style="grid-column: 1/-1; background: var(--success-color); color: white; padding: 1rem; border-radius: var(--radius-md); text-align: center; margin-bottom: 1rem; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">
        <h3 style="margin: 0; font-size: 1.25rem;">Umumiy Daromadim: $${totalIncome.toFixed(2)}</h3>
        <p style="margin: 0.25rem 0 0 0; opacity: 0.9;">Jami bajarilgan va kutilayotgan buyurtmalar soni: ${waiterOrders.length} ta</p>
    </div>`;
    
    if (waiterOrders.length === 0) {
        container.innerHTML += '<p class="text-secondary" style="grid-column: 1/-1; text-align: center;">Sizda hali buyurtmalar yo\'q.</p>';
        return;
    }
    
    waiterOrders.forEach(order => {
        let statusBadge = '';
        if (order.status === 'pending') statusBadge = '<span class="badge" style="background: var(--warning-color)">Yangi</span>';
        else if (order.status === 'preparing') statusBadge = '<span class="badge" style="background: var(--primary-color)">Tayyorlanmoqda</span>';
        else if (order.status === 'ready') statusBadge = '<span class="badge" style="background: var(--success-color)">Tayyor</span>';
        else if (order.status === 'cancelled') statusBadge = '<span class="badge" style="background: var(--danger-color)">Bekor qilingan</span>';
        
        let itemsHtml = order.items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('');
        let customerHtml = order.customerName ? `<span style="display:block; margin-top:0.25rem;"><i class="fas fa-user"></i> Mijoz: ${order.customerName}</span>` : '';
        container.innerHTML += `
            <div class="order-card">
                <div class="order-header"><h3>Stol ${order.table}</h3>${statusBadge}</div>
                <div class="order-meta">
                    <span><i class="fas fa-clock"></i> ${new Date(order.timestamp).toLocaleString()}</span>
                    <span><i class="fas fa-dollar-sign"></i> Jami: $${order.total.toFixed(2)}</span>
                    ${customerHtml}
                </div>
                <ul class="order-items-list" style="margin-top:0.5rem; max-height:100px; overflow-y:auto;">${itemsHtml}</ul>
            </div>`;
    });
}

function renderWaiterMenu() {
    const container = document.getElementById('menu-items-container');
    if (!container) return;
    container.innerHTML = '';
    const filtered = currentCategory === 'all' ? state.menu : state.menu.filter(i => i.category === currentCategory);
    
    filtered.forEach(item => {
        let iconHtml = item.icon.startsWith('http') || item.icon.startsWith('data:') ? `<img src="${item.icon}">` : item.icon;
        container.innerHTML += `
            <div class="menu-item" onclick="addToCart(${item.id})">
                <div class="menu-item-icon">${iconHtml}</div>
                <h4>${item.name}</h4><div class="price">$${item.price.toFixed(2)}</div>
            </div>`;
    });
}

window.addToCart = function(id) {
    const item = state.menu.find(m => m.id === id);
    if (!item) return;
    const existing = currentCart.find(i => i.id === id);
    if (existing) existing.qty++; else currentCart.push({ ...item, qty: 1 });
    renderCart();
};

window.updateCartQty = function(id, delta) {
    const item = currentCart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) currentCart = currentCart.filter(i => i.id !== id);
    renderCart();
};

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total');
    const submitBtn = document.getElementById('btn-submit-order');
    const cartBadge = document.getElementById('cart-badge');
    
    // Update badge
    const totalItems = currentCart.reduce((sum, i) => sum + i.qty, 0);
    if(cartBadge) {
        if(totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.classList.remove('hidden');
        } else {
            cartBadge.classList.add('hidden');
        }
    }
    
    if (!container) return;
    if (currentCart.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg">Savat bo\'sh</div>';
        totalEl.textContent = '$0.00';
        submitBtn.disabled = true;
        return;
    }
    
    container.innerHTML = '';
    let total = 0;
    currentCart.forEach(item => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        container.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">$${itemTotal.toFixed(2)} ($${item.price}/dona)</span>
                </div>
                <div class="cart-item-actions">
                    <button class="qty-btn" onclick="updateCartQty(${item.id}, -1)">-</button>
                    <span class="cart-qty">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty(${item.id}, 1)">+</button>
                </div>
            </div>`;
    });
    totalEl.textContent = `$${total.toFixed(2)}`;
    submitBtn.disabled = false;
}

document.getElementById('btn-submit-order')?.addEventListener('click', async () => {
    const tableNo = document.getElementById('table-number').value;
    const customerName = document.getElementById('customer-name') ? document.getElementById('customer-name').value : '';
    if (!tableNo) { showToast('Stol raqamini kiriting', 'warning'); return; }
    if (currentCart.length === 0) return;
    
    const chefs = state.users.filter(u => u.role === 'chef');
    let assignedChefId = null;
    if (chefs.length > 0) {
        const chefLoads = chefs.map(c => ({ id: c.id, load: state.orders.filter(o => o.chefId === c.id && (o.status === 'pending' || o.status === 'preparing')).length }));
        chefLoads.sort((a, b) => a.load - b.load);
        assignedChefId = chefLoads[0].id;
    }
    
    const order = {
        id: Date.now().toString().slice(-6), table: tableNo, peopleCount: 1, customerName: customerName,
        items: currentCart, total: currentCart.reduce((sum, i) => sum + (i.price * i.qty), 0),
        status: 'pending', waiterId: currentUser.login, chefId: assignedChefId, timestamp: new Date().toISOString()
    };
    
    await fetch(`${API_BASE}/orders`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(order) });
    
    currentCart = [];
    document.getElementById('table-number').value = '';
    if(document.getElementById('customer-name')) document.getElementById('customer-name').value = '';
    renderCart();
    closeModal('cart-modal');
    showToast(`Zakaz oshxonaga jo'natildi!`, 'success');
    await fetchData(); updateDashboards('waiter');
});

// Notifications
async function createNotification(userId, message, type) {
    const notif = { id: Date.now(), userId, message, type, read: false, timestamp: new Date().toISOString() };
    await fetch(`${API_BASE}/notifications`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(notif) });
}

function checkNotifications() {
    if (!currentUser) return;
    const userNotifs = state.notifications.filter(n => n.userId === currentUser.login);
    const unread = userNotifs.filter(n => !n.read);
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (unread.length > 0) {
            badge.textContent = unread.length;
            badge.classList.remove('hidden');
            const latest = unread[unread.length - 1];
            const age = Date.now() - new Date(latest.timestamp).getTime();
            if (age < 5000 && !latest.toastShown) {
                showToast(latest.message, latest.type);
                latest.toastShown = true; // Prevents re-toasting locally
            }
        } else {
            badge.classList.add('hidden');
        }
    }
}

window.openNotificationsModal = async function() {
    const modal = document.getElementById('notification-modal');
    const list = document.getElementById('modal-notifications-list');
    modal.classList.add('active');
    
    const userNotifs = state.notifications.filter(n => n.userId === currentUser.login).reverse();
    list.innerHTML = '';
    if (userNotifs.length === 0) list.innerHTML = '<p class="text-secondary" style="text-align:center;">Xabarlar yo\'q</p>';
    else {
        userNotifs.forEach(n => {
            list.innerHTML += `
                <div class="notification-item ${!n.read ? 'unread' : ''}">
                    <h4>System</h4><p>${n.message}</p>
                    <small class="text-secondary">${new Date(n.timestamp).toLocaleTimeString()}</small>
                </div>`;
        });
    }
    
    await fetch(`${API_BASE}/notifications/read`, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({userId: currentUser.login}) });
    await fetchData();
    checkNotifications();
};

window.openCartModal = function() {
    document.getElementById('cart-modal').classList.add('active');
};

// Modals
window.openModal = function(id, role = null) {
    if (id === 'staff-modal') {
        document.getElementById('staff-form').reset();
        document.getElementById('staff-id').value = '';
        document.getElementById('staff-role').value = role;
        document.getElementById('staff-modal-title').textContent = role === 'chef' ? "Oshpaz Qo'shish" : "Ofitsiant Qo'shish";
        generateCredentials();
    } else if (id === 'menu-modal') {
        document.getElementById('menu-form').reset();
        document.getElementById('menu-id').value = '';
        document.getElementById('menu-modal-title').textContent = "Yangi Taom Qo'shish";
        document.getElementById('btn-delete-menu').style.display = 'none';
        const catSelect = document.getElementById('menu-category');
        if (catSelect) catSelect.innerHTML = '<option value="" disabled selected>Kategoriya tanlang</option>' + state.categories.map(c => `<option value="${c.value}">${c.name}</option>`).join('');
    } else if (id === 'category-modal') {
        document.getElementById('category-form').reset();
        document.getElementById('category-id').value = '';
        document.getElementById('category-modal-title').textContent = "Yangi Kategoriya Qo'shish";
    }
    document.getElementById(id).classList.add('active');
};
window.closeModal = function(id) { document.getElementById(id).classList.remove('active'); };

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        login(document.getElementById('username').value, document.getElementById('password').value);
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const a = e.target.closest('a');
            if (a && a.classList.contains('logout-btn')) {
                logout();
                return;
            }
            
            const li = e.target.closest('li');
            const target = li ? li.dataset.target : null;
            if (target) {
                const parentSection = e.target.closest('.view-section');
                if(parentSection) {
                    parentSection.querySelectorAll('.nav-links li').forEach(item => item.classList.remove('active'));
                    li.classList.add('active');
                    parentSection.querySelectorAll('.admin-subview, .chef-subview, .waiter-subview').forEach(el => el.classList.remove('active'));
                    const targetView = document.getElementById(target);
                    if(targetView) targetView.classList.add('active');
                }
            }
        });
    });

    document.querySelectorAll('.filter-btn:not(#waiter-menu-filters .filter-btn)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const role = e.target.closest('.view-section').id;
            if (role === 'admin-dashboard') {
                document.querySelectorAll('.admin-orders-filters .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                adminOrdersCategory = e.target.dataset.status;
                renderAdminOrders();
            } else if (role === 'chef-dashboard') {
                document.querySelectorAll('.chef-orders-filters .filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                chefOrdersCategory = e.target.dataset.status;
                renderChefDashboard();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
