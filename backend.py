from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

DB_FILE = "database.db"

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY, role TEXT, name TEXT, phone TEXT, login TEXT, password TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS menu
                 (id INTEGER PRIMARY KEY, icon TEXT, name TEXT, category TEXT, price REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS orders
                 (id TEXT PRIMARY KEY, "table" TEXT, peopleCount INTEGER, items TEXT, total REAL, status TEXT, waiterId TEXT, chefId INTEGER, timestamp TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS notifications
                 (id INTEGER PRIMARY KEY, userId TEXT, message TEXT, type TEXT, read INTEGER, timestamp TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS categories
                 (id TEXT PRIMARY KEY, name TEXT, value TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS settings
                 (key TEXT PRIMARY KEY, value TEXT)''')
    
    # Check if empty, then insert default data
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO users (id, role, name, phone, login, password) VALUES (?, ?, ?, ?, ?, ?)", (1, 'admin', 'Admin', '000', 'admin', 'admin'))
        c.execute("INSERT INTO users (id, role, name, phone, login, password) VALUES (?, ?, ?, ?, ?, ?)", (2, 'chef', 'Chef Mario', '+998901234567', 'chef1', '123'))
        c.execute("INSERT INTO users (id, role, name, phone, login, password) VALUES (?, ?, ?, ?, ?, ?)", (3, 'waiter', 'Waiter John', '+998907654321', 'waiter1', '123'))
        
        default_menu = [
            (1, '🥩', 'Grill Steak', 'mains', 25.99),
            (2, '🍝', 'Pasta Carbonara', 'mains', 18.50),
            (3, '🥗', 'Caesar Salad', 'mains', 12.00),
            (4, '🍹', 'Mojito', 'drinks', 8.50),
            (5, '🥤', 'Coca Cola', 'drinks', 3.00),
            (6, '🍰', 'Chocolate Cake', 'desserts', 7.00)
        ]
        c.executemany("INSERT INTO menu (id, icon, name, category, price) VALUES (?, ?, ?, ?, ?)", default_menu)
        
        default_categories = [
            ('cat1', 'Asosiy', 'mains'),
            ('cat2', 'Ichimliklar', 'drinks'),
            ('cat3', 'Shirinliklar', 'desserts')
        ]
        c.executemany("INSERT INTO categories (id, name, value) VALUES (?, ?, ?)", default_categories)
        
        default_settings = [
            ('app_name', 'Gourmet Manager Pro'),
            ('logo_icon', 'fa-utensils'),
            ('primary_color', '#4f46e5'),
            ('accent_color', '#ec4899'),
            ('font_family', 'Inter'),
            ('language', 'uz')
        ]
        c.executemany("INSERT INTO settings (key, value) VALUES (?, ?)", default_settings)
        
    conn.commit()
    conn.close()

init_db()

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

@app.route('/api/orders/<order_id>', methods=['DELETE'])
def delete_order(order_id):
    conn = get_db()
    conn.execute('DELETE FROM orders WHERE id = ?', (order_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/init', methods=['GET'])
def get_init_data():
    conn = get_db()
    conn.row_factory = dict_factory
    c = conn.cursor()
    
    users = c.execute("SELECT * FROM users").fetchall()
    menu = c.execute("SELECT * FROM menu").fetchall()
    categories = c.execute("SELECT * FROM categories").fetchall()
    
    settings_raw = c.execute("SELECT * FROM settings").fetchall()
    settings = {}
    for s in settings_raw:
        settings[s['key']] = s['value']
    
    orders_raw = c.execute("SELECT * FROM orders").fetchall()
    orders = []
    for o in orders_raw:
        o['items'] = json.loads(o['items'])
        orders.append(o)
        
    notifications = c.execute("SELECT * FROM notifications").fetchall()
    for n in notifications:
        n['read'] = bool(n['read'])
        
    conn.close()
    return jsonify({
        "users": users,
        "menu": menu,
        "categories": categories,
        "settings": settings,
        "orders": orders,
        "notifications": notifications
    })

@app.route('/api/settings', methods=['POST'])
def save_settings():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    for k, v in data.items():
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/categories', methods=['POST'])
def save_category():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM categories WHERE id=?", (data['id'],))
    if c.fetchone():
        c.execute("UPDATE categories SET name=?, value=? WHERE id=?", (data['name'], data['value'], data['id']))
    else:
        c.execute("INSERT INTO categories (id, name, value) VALUES (?, ?, ?)", (data['id'], data['name'], data['value']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/categories/<id>', methods=['DELETE'])
def delete_category(id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM categories WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/users', methods=['POST'])
def save_user():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    # Check if exists
    c.execute("SELECT id FROM users WHERE id=?", (data['id'],))
    if c.fetchone():
        c.execute("UPDATE users SET role=?, name=?, phone=?, login=?, password=? WHERE id=?",
                  (data['role'], data['name'], data['phone'], data['login'], data['password'], data['id']))
    else:
        c.execute("INSERT INTO users (id, role, name, phone, login, password) VALUES (?, ?, ?, ?, ?, ?)",
                  (data['id'], data['role'], data['name'], data['phone'], data['login'], data['password']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/users/<int:id>', methods=['DELETE'])
def delete_user(id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM users WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/menus', methods=['POST'])
def save_menu():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT id FROM menu WHERE id=?", (data['id'],))
    if c.fetchone():
        c.execute("UPDATE menu SET icon=?, name=?, category=?, price=? WHERE id=?",
                  (data['icon'], data['name'], data['category'], data['price'], data['id']))
    else:
        c.execute("INSERT INTO menu (id, icon, name, category, price) VALUES (?, ?, ?, ?, ?)",
                  (data['id'], data['icon'], data['name'], data['category'], data['price']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/menus/<int:id>', methods=['DELETE'])
def delete_menu(id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM menu WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/orders', methods=['POST'])
def save_order():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO orders (id, \"table\", peopleCount, items, total, status, waiterId, chefId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              (data['id'], data['table'], data['peopleCount'], json.dumps(data['items']), data['total'], data['status'], data['waiterId'], data.get('chefId'), data['timestamp']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/orders/<id>/status', methods=['PUT'])
def update_order_status(id):
    data = request.json
    new_status = data['status']
    chef_id = data.get('chefId')
    
    conn = get_db()
    c = conn.cursor()
    if chef_id is not None:
        c.execute("UPDATE orders SET status=?, chefId=? WHERE id=?", (new_status, chef_id, id))
    else:
        c.execute("UPDATE orders SET status=? WHERE id=?", (new_status, id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/notifications', methods=['POST'])
def save_notification():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO notifications (id, userId, message, type, read, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
              (data['id'], data['userId'], data['message'], data['type'], int(data.get('read', False)), data['timestamp']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/notifications/read', methods=['PUT'])
def mark_notifications_read():
    data = request.json
    userId = data['userId']
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE notifications SET read=1 WHERE userId=?", (userId,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
