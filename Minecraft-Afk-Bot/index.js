
const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');
const path = require('path');

const app = express();

// Global variables for bot control
let bot = null;
let miningInterval = null;
let lookInterval = null;
let chatLogs = [];
let botSettings = {
   username: config['bot-account']['username'],
   password: 'naran123',
   serverIp: config.server.ip,
   isConnected: false,
   isMining: false,
   lookDirection: 90 // West by default
};

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints
app.post('/api/connect', (req, res) => {
   if (!bot || bot.ended) {
      createBot();
      res.json({ success: true, message: 'Bot connecting...' });
   } else {
      res.json({ success: false, message: 'Bot already connected' });
   }
});

app.post('/api/disconnect', (req, res) => {
   if (bot && !bot.ended) {
      stopMining();
      bot.quit();
      botSettings.isConnected = false;
      res.json({ success: true, message: 'Bot disconnected' });
   } else {
      res.json({ success: false, message: 'Bot not connected' });
   }
});

app.post('/api/mining/start', (req, res) => {
   if (bot && !bot.ended && !botSettings.isMining) {
      startMining();
      res.json({ success: true, message: 'Mining started' });
   } else {
      res.json({ success: false, message: 'Cannot start mining' });
   }
});

app.post('/api/mining/stop', (req, res) => {
   if (botSettings.isMining) {
      stopMining();
      res.json({ success: true, message: 'Mining stopped' });
   } else {
      res.json({ success: false, message: 'Bot not mining' });
   }
});

app.post('/api/mining/target', (req, res) => {
   if (bot && !bot.ended) {
      startTargetMining();
      res.json({ success: true, message: 'Target mining started' });
   } else {
      res.json({ success: false, message: 'Bot not connected' });
   }
});

app.post('/api/look', (req, res) => {
   const { direction } = req.body;
   if (bot && !bot.ended) {
      let yaw = 90; // Default west
      if (direction === 'east') yaw = 270;
      else if (direction === 'north') yaw = 180;
      else if (direction === 'south') yaw = 0;
      
      botSettings.lookDirection = yaw;
      bot.look(yaw * (Math.PI / 180), 0);
      res.json({ success: true, message: `Bot looking ${direction}` });
   } else {
      res.json({ success: false, message: 'Bot not connected' });
   }
});

app.post('/api/look/adjust', (req, res) => {
   const { yawDelta, pitchDelta } = req.body;
   if (bot && !bot.ended) {
      const currentYaw = bot.entity.yaw;
      const currentPitch = bot.entity.pitch;
      
      const newYaw = currentYaw + (yawDelta || 0) * (Math.PI / 180);
      const newPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, currentPitch + (pitchDelta || 0) * (Math.PI / 180)));
      
      bot.look(newYaw, newPitch);
      res.json({ success: true, message: `Adjusted look by yaw: ${yawDelta || 0}°, pitch: ${pitchDelta || 0}°` });
   } else {
      res.json({ success: false, message: 'Bot not connected' });
   }
});

app.post('/api/movement', (req, res) => {
   const { action, state } = req.body;
   if (bot && !bot.ended) {
      const validActions = ['forward', 'back', 'left', 'right', 'jump', 'sneak'];
      if (validActions.includes(action)) {
         bot.setControlState(action, state === 'start');
         res.json({ success: true, message: `Movement ${action} ${state === 'start' ? 'started' : 'stopped'}` });
      } else {
         res.json({ success: false, message: 'Invalid movement action' });
      }
   } else {
      res.json({ success: false, message: 'Bot not connected' });
   }
});

app.post('/api/settings', (req, res) => {
   const { username, password, serverIp } = req.body;
   if (username) botSettings.username = username;
   if (password) botSettings.password = password;
   if (serverIp) botSettings.serverIp = serverIp;
   
   res.json({ success: true, message: 'Settings updated' });
});

app.get('/api/status', (req, res) => {
   res.json({
      ...botSettings,
      chatLogs: chatLogs.slice(-50) // Last 50 chat messages
   });
});

app.get('/api/logs', (req, res) => {
   res.json({ logs: chatLogs });
});

function startMining() {
   if (bot && !bot.ended) {
      botSettings.isMining = true;
      
      // Stop all other movements first
      bot.clearControlStates();
      
      console.log('[MINING] Starting continuous mining...');
      
      // Continuous dig function
      const continuousMining = async () => {
         try {
            // Look in the set direction
            const yaw = botSettings.lookDirection * (Math.PI / 180);
            bot.look(yaw, 0, true);
            
            // Find block in front of bot
            const forward = bot.entity.position.clone();
            forward.x += Math.cos(yaw) * 2; // 2 blocks forward
            forward.z += Math.sin(yaw) * 2;
            forward.y = Math.floor(forward.y); // Ensure Y is integer
            
            const targetBlock = bot.blockAt(forward);
            
            if (targetBlock && targetBlock.name !== 'air') {
               console.log(`[MINING] Digging block: ${targetBlock.name} at ${targetBlock.position}`);
               
               try {
                  await bot.dig(targetBlock);
                  console.log(`[MINING] Successfully destroyed ${targetBlock.name}!`);
               } catch (error) {
                  console.log(`[MINING] Dig failed: ${error.message}`);
               }
            } else {
               console.log('[MINING] No solid block found in front');
            }
            
         } catch (error) {
            console.log(`[MINING] Error: ${error.message}`);
         }
         
         // Continue mining if still active
         if (botSettings.isMining) {
            setTimeout(continuousMining, 1000); // Wait 1 second between digs
         }
      };
      
      // Start the continuous mining
      continuousMining();
      
      console.log('[INFO] Continuous mining started - bot will dig blocks in front');
   }
}

function startTargetMining() {
   if (bot && !bot.ended) {
      botSettings.isMining = true;
      
      // Stop all movements
      bot.clearControlStates();
      
      // Target coordinates to mine
      const targetCoords = [
         { x: 1812, y: 51, z: 40 },
         { x: 1811, y: 51, z: 40 },
         { x: 1810, y: 51, z: 40 },
         { x: 1809, y: 51, z: 40 },
         { x: 1808, y: 51, z: 40 },
         { x: 1807, y: 51, z: 40 }
      ];
      
      let currentTargetIndex = 0;
      
      console.log('[TARGET-MINING] Starting target coordinate mining...');
      
      const mineTargetBlocks = async () => {
         try {
            if (currentTargetIndex >= targetCoords.length) {
               console.log('[TARGET-MINING] All target blocks completed!');
               stopMining();
               return;
            }
            
            const target = targetCoords[currentTargetIndex];
            const targetBlock = bot.blockAt(target);
            
            if (targetBlock && targetBlock.name !== 'air') {
               console.log(`[TARGET-MINING] Mining block ${currentTargetIndex + 1}/6: ${targetBlock.name} at (${target.x}, ${target.y}, ${target.z})`);
               
               // Look towards the target block
               bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5));
               
               try {
                  await bot.dig(targetBlock);
                  console.log(`[TARGET-MINING] ✅ Successfully destroyed block at (${target.x}, ${target.y}, ${target.z})!`);
                  currentTargetIndex++;
               } catch (error) {
                  console.log(`[TARGET-MINING] ❌ Failed to dig block at (${target.x}, ${target.y}, ${target.z}): ${error.message}`);
                  currentTargetIndex++; // Skip this block and move to next
               }
            } else {
               console.log(`[TARGET-MINING] Block at (${target.x}, ${target.y}, ${target.z}) is air or doesn't exist, skipping...`);
               currentTargetIndex++;
            }
            
         } catch (error) {
            console.log(`[TARGET-MINING] Error: ${error.message}`);
            currentTargetIndex++;
         }
         
         // Continue to next block if still active
         if (botSettings.isMining && currentTargetIndex < targetCoords.length) {
            setTimeout(mineTargetBlocks, 2000); // Wait 2 seconds between blocks
         } else if (currentTargetIndex >= targetCoords.length) {
            console.log('[TARGET-MINING] All coordinates completed!');
            stopMining();
         }
      };
      
      // Start mining target blocks
      mineTargetBlocks();
   }
}

function stopMining() {
   botSettings.isMining = false;
   
   // Stop all mining related states
   if (bot && !bot.ended) {
      bot.setControlState('left', false);
      bot.clearControlStates();
   }
   
   if (miningInterval) {
      clearInterval(miningInterval);
      miningInterval = null;
   }
   if (lookInterval) {
      clearInterval(lookInterval);
      lookInterval = null;
   }
   console.log('[INFO] Mining stopped - all states cleared');
}

function createBot() {
   bot = mineflayer.createBot({
      username: botSettings.username,
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: botSettings.serverIp,
      port: config.server.port,
      version: config.server.version,
   });

   bot.loadPlugin(pathfinder);
   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   bot.settings.colorsEnabled = false;

   bot.once('spawn', () => {
      console.log('\x1b[33m[AfkBot] Bot joined to the server', '\x1b[0m');
      botSettings.isConnected = true;
      chatLogs.push({ type: 'system', message: 'Bot connected to server', timestamp: new Date().toISOString() });

      // Auto login and move to oneblock
      setTimeout(() => {
         bot.chat(`/login ${botSettings.password}`);
         console.log(`[INFO] Executed /login ${botSettings.password}`);
         chatLogs.push({ type: 'system', message: `Executed /login ${botSettings.password}`, timestamp: new Date().toISOString() });
      }, 1000);

      setTimeout(() => {
         bot.chat('/move oneblock');
         console.log('[INFO] Executed /move oneblock');
         chatLogs.push({ type: 'system', message: 'Executed /move oneblock', timestamp: new Date().toISOString() });
      }, 2000);

      // Auto start mining after 5 seconds
      setTimeout(() => {
         bot.look(botSettings.lookDirection * (Math.PI / 180), 0);
         startMining();
         chatLogs.push({ type: 'system', message: 'Auto-mining started towards west', timestamp: new Date().toISOString() });
      }, 5000);

      if (config.utils['auto-auth'].enabled) {
         console.log('[INFO] Started auto-auth module');
         var password = config.utils['auto-auth'].password;
         setTimeout(() => {
            bot.chat(`/register ${password} ${password}`);
            bot.chat(`/login ${password}`);
         }, 500);
      }

      if (config.utils['chat-messages'].enabled) {
         console.log('[INFO] Started chat-messages module');
         var messages = config.utils['chat-messages']['messages'];

         if (config.utils['chat-messages'].repeat) {
            var delay = config.utils['chat-messages']['repeat-delay'];
            let i = 0;

            let msg_timer = setInterval(() => {
               bot.chat(`${messages[i]}`);
               if (i + 1 == messages.length) {
                  i = 0;
               } else i++;
            }, delay * 1000);
         } else {
            messages.forEach((msg) => {
               bot.chat(msg);
            });
         }
      }

      const pos = config.position;
      if (config.position.enabled) {
         console.log(`\x1b[32m[Afk Bot] Starting moving to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`);
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      if (config.utils['anti-afk'].enabled) {
         bot.setControlState('jump', true);
         if (config.utils['anti-afk'].sneak) {
            bot.setControlState('sneak', true);
         }
      }
   });

   bot.on('chat', (username, message) => {
      const logEntry = { type: 'chat', username, message, timestamp: new Date().toISOString() };
      chatLogs.push(logEntry);
      
      // Keep only last 200 messages
      if (chatLogs.length > 200) {
         chatLogs = chatLogs.slice(-200);
      }
      
      if (config.utils['chat-log']) {
         console.log(`[ChatLog] <${username}> ${message}`);
      }
   });

   bot.on('goal_reached', () => {
      console.log(`\x1b[32m[AfkBot] Bot arrived to target location. ${bot.entity.position}\x1b[0m`);
      chatLogs.push({ type: 'system', message: `Bot reached target location: ${bot.entity.position}`, timestamp: new Date().toISOString() });
   });

   bot.on('death', () => {
      console.log(`\x1b[33m[AfkBot] Bot has been died and was respawned ${bot.entity.position}`, '\x1b[0m');
      chatLogs.push({ type: 'system', message: `Bot died and respawned at: ${bot.entity.position}`, timestamp: new Date().toISOString() });
   });

   bot.on('end', () => {
      botSettings.isConnected = false;
      botSettings.isMining = false;
      stopMining();
      chatLogs.push({ type: 'system', message: 'Bot disconnected from server', timestamp: new Date().toISOString() });
      
      if (config.utils['auto-reconnect']) {
         setTimeout(() => {
            createBot();
         }, config.utils['auto-recconect-delay']);
      }
   });

   bot.on('kicked', (reason) => {
      console.log('\x1b[33m', `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`, '\x1b[0m');
      chatLogs.push({ type: 'system', message: `Bot kicked: ${reason}`, timestamp: new Date().toISOString() });
   });

   bot.on('error', (err) => {
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m');
      chatLogs.push({ type: 'error', message: `Error: ${err.message}`, timestamp: new Date().toISOString() });
   });
}

app.listen(8000, '0.0.0.0', () => {
  console.log('Bot control server started on port 8000');
});

// Auto-start bot
createBot();
