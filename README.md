
# 💬 Trumy — Real-time Messenger
 
Полнофункциональный мессенджер в реальном времени, вдохновлённый Telegram, WhatsApp и Discord.
 
![Trumy](https://img.shields.io/badge/Trumy-Messenger-7c3aed?style=for-the-badge)
 
## Возможности
 
- **Регистрация и вход** — JWT-авторизация
- **Каналы** — создавайте и присоединяйтесь к каналам (как в Discord)
- **Личные сообщения** — общение 1-на-1
- **Реальное время** — мгновенная доставка через WebSocket (Socket.IO)
- **Индикатор набора** — видно, когда кто-то печатает
- **Статус онлайн** — зелёный индикатор для активных пользователей
- **Загрузка файлов** — отправка изображений и файлов
- **Редактирование/удаление** — управление своими сообщениями
- **Ответы** — цитирование сообщений
- **Форматирование** — **жирный**, *курсив*, `код`, ссылки
- **Тёмная тема** — современный UI в стиле Discord
- **Адаптивный дизайн** — работает на мобильных устройствах
 
## Технологии
 
| Компонент | Технология |
|-----------|-----------|
| Сервер | Node.js + Express |
| WebSocket | Socket.IO |
| База данных | SQLite (better-sqlite3) |
| Авторизация | JWT + bcrypt |
| Фронтенд | Vanilla HTML/CSS/JS |
| Загрузка файлов | Multer |
 
## Запуск
 
### Требования
- Node.js >= 18
 
### Установка и запуск
 
```bash
cd messenger
npm install
npm start
```
 
Откройте `http://localhost:3000` в браузере.
 
### Переменные окружения (опционально)
 
```bash
PORT=3000                           # Порт сервера
JWT_SECRET=your-secret-key          # Секрет для JWT токенов
```
 
## Структура проекта
 
```
messenger/
├── server.js          # Express + Socket.IO сервер
├── db.js              # SQLite база данных
├── auth.js            # Авторизация (JWT, bcrypt)
├── package.json       # Зависимости
├── public/
│   ├── index.html     # Главная страница
│   ├── css/
│   │   └── style.css  # Стили (тёмная тема)
│   └── js/
│       └── app.js     # Клиентская логика
└── uploads/           # Загруженные файлы
```
 
## API Endpoints
 
| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/register` | Регистрация |
| POST | `/api/login` | Вход |
| POST | `/api/upload` | Загрузка файла |
| GET | `/api/channels` | Список каналов |
| GET | `/api/users` | Список пользователей |
 
## Socket.IO Events
 
### Клиент → Сервер
- `channel:join` — войти в канал
- `channel:leave` — покинуть канал
- `channel:create` — создать канал
- `message:send` — отправить сообщение
- `message:edit` — редактировать
- `message:delete` — удалить
- `typing:start/stop` — индикатор набора
- `dm:open` — открыть ЛС
- `dm:send` — отправить ЛС
 
### Сервер → Клиент
- `channel:messages` — история сообщений
- `message:new` — новое сообщение
- `user:online/offline` — статус пользователя
- `dm:messages` — история ЛС
- `dm:new` — новое ЛС
- `dm:notification` — уведомление о новом ЛС
