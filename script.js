const API = 'http://localhost:3000';

// ====== TOKEN ======
function getToken() {
  return localStorage.getItem('token');
}
function isLoggedIn() {
  return !!getToken();
}

// ====== DOM ======
const output = document.getElementById('output');
const trainerSelect = document.getElementById('trainerSelect');
const slotSelect = document.getElementById('slotSelect');
const actions = document.getElementById('actions');

// ====== СТАН ======
let bookingToEdit = null;
let isEditMode = false;

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  const loginCard = document.getElementById('loginCard');
  const registerCard = document.getElementById('registerCard');
  const bookingCard = document.getElementById('bookingCard');
  const loginForm = document.getElementById('loginForm');
  const registerBlock = document.getElementById('registerBlock');

  // --- стартовий стан ---
  if (isLoggedIn()) {
    actions.style.display = 'flex';
    bookingCard.style.display = 'block';
    loginCard.style.display = 'none';
    registerCard.style.display = 'none';
    registerBlock.style.display = 'none';
    showWelcome();
  } else {
    actions.style.display = 'none';
    bookingCard.style.display = 'none';
    loginCard.style.display = 'block';
    registerCard.style.display = 'none';
    registerBlock.style.display = 'block';
  }

  // ====== LOGIN ======
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) return alert(data.message);

      localStorage.setItem('token', data.token);
      localStorage.setItem('userName', data.user.name);

      location.reload();
    } catch {
      alert('Помилка зʼєднання');
    }
  });
});
// Register//
const registerForm = document.getElementById('registerForm');

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value.trim();

    if (!name || !email || !password) {
      return alert('Заповніть усі поля');
    }

    try {
      const res = await fetch(`${API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        return alert(data.message);
      }

      alert('Реєстрація успішна! Тепер увійдіть 👋');

      // показуємо логін, ховаємо реєстрацію
      document.getElementById('registerCard').style.display = 'none';
      document.getElementById('loginCard').style.display = 'block';
      document.getElementById('registerBlock').style.display = 'block';

      registerForm.reset();
    } catch {
      alert('Помилка зʼєднання з сервером');
    }
  });
}

// ====== FORMAT ======
function formatDate(d) {
  return new Date(d).toLocaleDateString('uk-UA');
}
function formatTime(t) {
  return t.slice(0, 5);
}

// ====== LOADERS ======
function loadTrainers() {
  clearOutput();
  fetch(`${API}/trainers`)
    .then(res => res.json())
    .then(data => {
      output.innerHTML = '<h3>Тренери</h3>';
      data.forEach(t => {
        output.innerHTML += `
          <div class="list-item">
            <strong>${t.name}</strong> — ${t.specialization}
          </div>`;
      });
    });
}

function loadClasses() {
  clearOutput();
  fetch(`${API}/classes`)
    .then(res => res.json())
    .then(data => {
      output.innerHTML = '<h3>Групові заняття</h3>';
      data.forEach(c => {
        output.innerHTML += `
          <div class="list-item">
            <strong>${c.title}</strong> — ${c.trainer_name}<br>
            <small>${c.day_of_week}, ${c.time_start}–${c.time_end}</small>
          </div>`;
      });
    });
}

function loadBookings() {
  clearOutput();

  fetch(`${API}/bookings`, {
    headers: { Authorization: 'Bearer ' + getToken() }
  })
    .then(res => res.json())
    .then(data => {
      output.innerHTML = '<h3>Бронювання</h3>';

      if (!data.length) {
        output.innerHTML += '<p>Немає бронювань</p>';
        return;
      }

      data.forEach(b => {
        output.innerHTML += `
          <div class="list-item">
            <strong>${b.client_name}</strong> — ${b.trainer_name}<br>
            <small>${formatDate(b.date)} • ${formatTime(b.time_start)}–${formatTime(b.time_end)}</small><br><br>
            <button onclick="cancelBooking(${b.id})">Скасувати</button>
            <button onclick="startEdit(${b.id})">Редагувати</button>
          </div>`;
      });
    });
}

// ====== FORM ======
async function bookSlot(e) {
  e.preventDefault();

  const slotId = slotSelect.value;
  if (!slotId) return alert('Оберіть час');

  try {
    if (isEditMode) {
      const res = await fetch(`${API}/book/${bookingToEdit}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({ schedule_id: slotId })
      });

      const data = await res.json();
      alert(data.message || 'Бронювання оновлено');

      isEditMode = false;
      bookingToEdit = null;
    } else {
      const res = await fetch(`${API}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({
          client_name: localStorage.getItem('userName'),
          schedule_id: slotId
        })
      });

      const data = await res.json();
      alert(data.message || 'Бронювання створено');
    }

    resetBookingForm();
    loadBookings();
  } catch {
    alert('Помилка');
  }
}

// ====== EDIT ======
function startEdit(id) {
  bookingToEdit = id;
  isEditMode = true;

  document.querySelector('#bookingCard h2').textContent = 'Редагування бронювання';
  document.querySelector('#bookingCard button[type="submit"]').textContent = 'Зберегти зміни';

  document.getElementById('bookingCard').style.display = 'block';
  document.getElementById('bookingCard').scrollIntoView({ behavior: 'smooth' });
}

// ====== DELETE ======
function cancelBooking(id) {
  if (!confirm('Скасувати бронювання?')) return;

  fetch(`${API}/book/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + getToken() }
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      loadBookings();
    });
}

// ====== SLOTS ======
fetch(`${API}/trainers`)
  .then(res => res.json())
  .then(data => {
    data.forEach(t => {
      trainerSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  });

function loadFreeSlots() {
  const trainerId = trainerSelect.value;
  slotSelect.innerHTML = '<option>Завантаження...</option>';

  fetch(`${API}/schedule/free/${trainerId}`)
    .then(res => res.json())
    .then(data => {
      slotSelect.innerHTML = '<option value="">Оберіть час</option>';
      data.forEach(s => {
        slotSelect.innerHTML += `
          <option value="${s.id}">
            ${formatDate(s.date)} • ${formatTime(s.time_start)}–${formatTime(s.time_end)}
          </option>`;
      });
    });
}

// ====== HELPERS ======
function resetBookingForm() {
  document.querySelector('#bookingCard h2').textContent = 'Нове бронювання';
  document.querySelector('#bookingCard button[type="submit"]').textContent = 'Забронювати';
  slotSelect.value = '';
}

function clearOutput() {
  output.innerHTML = '';
}

function showWelcome() {
  if (document.getElementById('welcomeText')) return;

  const welcome = document.createElement('p');
  welcome.id = 'welcomeText';
  welcome.textContent = `Вітаємо на сайті нашого спортклубу, ${localStorage.getItem('userName')}! 🏋️‍♀️`;
  welcome.style.textAlign = 'center';
  welcome.style.margin = '15px 0';
  welcome.style.fontWeight = '500';

  document.querySelector('.gallery').after(welcome);
}

function showRegister() {
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerBlock').style.display = 'none';
  document.getElementById('registerCard').style.display = 'block';
}

function logout() {
  localStorage.clear();
  location.reload();
}
