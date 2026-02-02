# Smart Shutters Relay Server

Cloud relay server for the Smart Shutters system. Acts as a bridge between the mobile app and ESP32 devices.

## 🚀 Features

- **REST API** for mobile app commands
- **WebSocket endpoints** for real-time communication
  - `/esp32` - For ESP32 device connection
  - `/app` - For mobile app connections
- **State management** for shutter positions
- **Broadcasting** - Real-time state updates to all connected apps
- **Authentication** - Secure ESP32 and app connections

## 📦 Tech Stack

- **Node.js** + **Express** - HTTP server
- **ws** - WebSocket server
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment configuration

## 🛠️ Installation

```bash
npm install
```

## 🔧 Configuration

Create a `.env` file:

```env
PORT=3000
ESP32_SECRET=your-esp32-secret-key-12345
APP_SECRET=your-app-secret-key-67890
```

## 🏃 Running Locally

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

## 📡 API Endpoints

### Health Check
```
GET /health
```
Returns server status and ESP32 connection state.

### Get State
```
GET /api/state
```
Returns current shutter states.

### Send Command
```
POST /api/command
Content-Type: application/json

{
  "token": "your-app-secret-key",
  "action": "OPEN|CLOSE|STOP|SET_LEVEL",
  "channel": 1-4 (or 0 for all),
  "value": 0-100 (for SET_LEVEL)
}
```

## 🔌 WebSocket Protocol

### ESP32 Connection (`/esp32`)

1. **Connect**: ESP32 connects to `ws://server/esp32`
2. **Auth**: Send `{ "type": "AUTH", "secret": "..." }`
3. **Commands**: Receive commands from server
4. **State Updates**: Send `{ "type": "STATE", "data": {...} }`

### App Connection (`/app`)

1. **Connect**: App connects to `ws://server/app`
2. **Receive State**: Get current state immediately
3. **Updates**: Receive real-time state updates

## 🚀 Deployment on Render

1. **Create Web Service** on [Render.com](https://render.com)
2. **Connect this Git repository**
3. **Configure**:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. **Add Environment Variables**:
   - `ESP32_SECRET`
   - `APP_SECRET`
5. **Deploy**!

### Environment Variables on Render

```
ESP32_SECRET=your-secure-esp32-key
APP_SECRET=your-secure-app-key
```

## 📊 Architecture

```
┌─────────────┐         HTTP/WS        ┌──────────────┐
│ Mobile App  │ ◄─────────────────────► │              │
└─────────────┘                         │    Relay     │
                                        │   Server     │
┌─────────────┐         WebSocket       │  (Node.js)   │
│   ESP32     │ ◄─────────────────────► │              │
└─────────────┘                         └──────────────┘
```

## 🔒 Security

- Token-based authentication for ESP32
- Token-based authentication for mobile apps
- Environment-based secrets
- CORS enabled for web access

## 📝 License

MIT

## 👤 Author

Smart Home Automation System
