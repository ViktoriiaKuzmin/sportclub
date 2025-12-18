const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db/connection');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'sportclub_secret_key';
const PORT = 3000;

// ====== JWT middleware ======
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Токен відсутній' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Недійсний токен' });
    }

    req.user = user; // { id }
    next();
  });
}

// ====== ROOT ======
app.get('/', (req, res) => {
  res.send('Сервер працює!');
});

// ====== РЕЄСТРАЦІЯ ======
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Заповніть усі поля' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: 'Користувач з таким email вже існує'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    res.status(201).json({ message: 'Реєстрація успішна' });
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== ЛОГІН ======
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Введіть email та пароль' });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Невірний email або пароль' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Невірний email або пароль' });
    }

    const token = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      message: 'Вхід успішний',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== ТРЕНЕРИ ======
app.get('/trainers', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM trainers');
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== ГРУПОВІ ЗАНЯТТЯ ======
app.get('/classes', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT gc.*, t.name AS trainer_name
      FROM group_classes gc
      LEFT JOIN trainers t ON gc.trainer_id = t.id
    `);
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== ВІЛЬНІ СЛОТИ ======
app.get('/schedule/free/:trainer_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM trainer_schedule WHERE trainer_id = ? AND is_booked = 0',
      [req.params.trainer_id]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== БРОНЮВАННЯ КОРИСТУВАЧА ======
app.get('/bookings', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        b.id,
        b.client_name,
        t.name AS trainer_name,
        ts.date,
        ts.time_start,
        ts.time_end
      FROM bookings b
      JOIN trainers t ON b.trainer_id = t.id
      JOIN trainer_schedule ts ON b.schedule_id = ts.id
      WHERE b.user_id = ?
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== СТВОРЕННЯ БРОНЮВАННЯ ======
app.post('/book', authenticateToken, async (req, res) => {
  const { client_name, schedule_id } = req.body;
  const userId = req.user.id;

  if (!client_name || !schedule_id) {
    return res.status(400).json({ message: 'Не всі поля заповнені' });
  }

  try {
    const [slots] = await db.query(
      'SELECT trainer_id, is_booked FROM trainer_schedule WHERE id = ?',
      [schedule_id]
    );

    if (slots.length === 0 || slots[0].is_booked === 1) {
      return res.status(400).json({ message: 'Слот недоступний' });
    }

    const trainer_id = slots[0].trainer_id;

    await db.query(
      'INSERT INTO bookings (user_id, client_name, trainer_id, schedule_id) VALUES (?, ?, ?, ?)',
      [userId, client_name, trainer_id, schedule_id]
    );

    await db.query(
      'UPDATE trainer_schedule SET is_booked = 1 WHERE id = ?',
      [schedule_id]
    );

    res.json({ message: 'Бронювання успішне' });
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});
// ====== РЕДАГУВАННЯ БРОНЮВАННЯ ======
app.put('/book/:id', authenticateToken, async (req, res) => {
  const bookingId = req.params.id;
  const { schedule_id } = req.body;
  const userId = req.user.id;

  try {
    // 1. старе бронювання
    const [oldBooking] = await db.query(
      'SELECT schedule_id FROM bookings WHERE id = ? AND user_id = ?',
      [bookingId, userId]
    );

    if (oldBooking.length === 0) {
      return res.status(403).json({ message: 'Немає доступу' });
    }

    const oldScheduleId = oldBooking[0].schedule_id;

    // 2. дізнаємось нового тренера зі schedule
    const [newSlot] = await db.query(
      'SELECT trainer_id FROM trainer_schedule WHERE id = ?',
      [schedule_id]
    );

    if (newSlot.length === 0) {
      return res.status(400).json({ message: 'Некоректний слот' });
    }

    const newTrainerId = newSlot[0].trainer_id;

    // 3. звільняємо старий слот
    await db.query(
      'UPDATE trainer_schedule SET is_booked = 0 WHERE id = ?',
      [oldScheduleId]
    );

    // 4. оновлюємо booking (І СЛОТ, І ТРЕНЕРА)
    await db.query(
      'UPDATE bookings SET schedule_id = ?, trainer_id = ? WHERE id = ?',
      [schedule_id, newTrainerId, bookingId]
    );

    // 5. блокуємо новий слот
    await db.query(
      'UPDATE trainer_schedule SET is_booked = 1 WHERE id = ?',
      [schedule_id]
    );

    res.json({ message: 'Бронювання оновлено' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Помилка сервера' });
  }
});


// ====== СКАСУВАННЯ БРОНЮВАННЯ ======
app.delete('/book/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT schedule_id FROM bookings WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Немає доступу' });
    }

    await db.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    await db.query(
      'UPDATE trainer_schedule SET is_booked = 0 WHERE id = ?',
      [rows[0].schedule_id]
    );

    res.json({ message: 'Бронювання скасовано' });
  } catch {
    res.status(500).json({ message: 'Помилка сервера' });
  }
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});



