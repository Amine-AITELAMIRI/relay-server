# iRobot Credentials Extraction Guide

This guide will walk you through extracting the BLID (username) and password from your iRobot devices (Roomba j7 and Braava Jet).

> [!WARNING]
> You only need to do this once per robot. These credentials won't change unless you factory reset the robot.

---

## Prerequisites

1. **Both robots** should be:
   - Fully charged (or on the charging dock)
   - Connected to your WiFi network
   - On the same network as your computer

2. **Install dorita980 globally** on your computer:
   ```bash
   npm install -g dorita980
   ```

---

## Method 1: Using dorita980 CLI (Recommended)

### Step 1: Find Robot IP Address

**Option A: Check your router's DHCP clients list**
- Log into your router admin panel
- Look for devices named "Roomba" or "Braava"
- Note the IP addresses

**Option B: Use network scanner** (e.g., Angry IP Scanner, Fing mobile app)
- Scan your local network
- Look for iRobot devices

### Step 2: Extract Credentials

#### For Roomba j7:

1. Place Roomba on the dock
2. Press and hold the HOME button for about 2 seconds
3. You'll hear a series of tones, and the CLEAN button will light up
4. The robot will create a WiFi network (you have 2 minutes)

5. Run this command on your computer (replace IP with robot's IP):
   ```bash
   get-roomba-password <ROOMBA_IP_ADDRESS>
   ```
   
   Example:
   ```bash
   get-roomba-password 192.168.1.100
   ```

6. The output will show:
   ```
   Robot blid (username): 1234567890ABCDEF
   Robot password: :1:2345678:ABCDEFGH
   ```

#### For Braava Jet:

1. Place Braava on the charging station
2. Press and hold the CLEAN button for about 2 seconds
3. Wait for the WiFi indicator to flash
4. Run the same command:
   ```bash
   get-roomba-password <BRAAVA_IP_ADDRESS>
   ```

---

## Method 2: Manual Extraction (if Method 1 fails)

### For Roomba j7:

1. Put robot on dock, press and hold HOME button (~2 seconds)
2. Robot creates WiFi network: `Roomba-XXXXXXXXXXXX`
3. Connect your computer to this WiFi network
4. Make HTTP request:
   ```bash
   curl -X GET http://192.168.10.1/umi
   ```
5. You'll see JSON response with `robotid` (this is your BLID)

### For Braava Jet:

Same steps as Roomba, but connect to `Braava-XXXXXXXXXXXX` network.

---

## Step 3: Update Relay Server Configuration

Once you have both sets of credentials:

1. Navigate to relay server directory:
   ```bash
   cd "d:\CODING\projekt smart hause\relay-server"
   ```

2. Edit `.env` file (create it if it doesn't exist, copy from `.env.example`):
   ```env
   # Server Configuration
   PORT=3000
   ESP32_SECRET=your-esp32-secret-key-12345
   APP_SECRET=your-app-secret-key-67890

   # Roomba j7 Configuration
   ROOMBA_J7_IP=192.168.1.100
   ROOMBA_J7_BLID=1234567890ABCDEF
   ROOMBA_J7_PASSWORD=:1:2345678:ABCDEFGH

   # Braava Jet Configuration
   BRAAVA_JET_IP=192.168.1.101
   BRAAVA_JET_BLID=9876543210ABCDEF
   BRAAVA_JET_PASSWORD=:1:8765432:HGFEDCBA
   ```

3. Save and close the file

---

## Step 4: Install Dependencies and Start Server

```bash
# Install dependencies (if not already done)
npm install

# Start the relay server
npm run dev
```

You should see:
```
✅ Roomba j7 initialized
✅ Braava Jet initialized
🚀 Relay Server running on port 3000
🔄 Starting robot status polling (30000ms interval)
```

---

## Troubleshooting

### "Cannot connect to robot"
- Ensure robot is on dock/charging station
- Check that robot's IP hasn't changed (set static IP in router if possible)
- Verify robot is on the same network as relay server

### "Authentication failed"
- Re-extract credentials (they may have changed after firmware update)
- Ensure no extra spaces in `.env` file

### "Robot not responding"
- Restart the robot by pressing and holding CLEAN button for 10 seconds
- Check if robot firmware needs update via iRobot app

### "get-roomba-password command not found"
- Install dorita980 globally: `npm install -g dorita980`
- Try running with full path: `npx get-roomba-password <IP>`

---

## What's Next?

After successfully configuring the relay server:

1. **Test the connection**: Check server logs for robot status updates
2. **Open dashboard**: Navigate to the Robots page to see battery levels and status
3. **Test commands**: Try starting/pausing/docking robots from the dashboard
4. **Set up automations**: Combine robot control with shutter scenes

---

## Important Notes

- **Security**: These credentials give full control of your robots. Keep `.env` file secure and never commit it to Git.
- **Static IP**: Consider setting static IP addresses for your robots in your router to prevent credentials from becoming invalid.
- **Firmware Updates**: Robot credentials may change after firmware updates. If robots stop responding, re-extract credentials.
- **Multiple Robots**: You can add more robots by following the same pattern in the config files.

---

## Need Help?

If you encounter issues:
1. Check relay server logs for error messages
2. Verify robots are accessible via ping: `ping <ROBOT_IP>`
3. Ensure robots are not in use by the iRobot mobile app (close the app)
4. Try rebooting the robots and relay server
