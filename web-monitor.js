#!/usr/bin/env node
import './lib/load-env.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import { createLogger } from './lib/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('web-monitor');
const dbPath = new URL('./queue.db', import.meta.url).pathname;

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.WEB_MONITOR_PORT || 3001;
const REFRESH_INTERVAL = 2000;

// Configuration
const MAX_RECENT_JOBS = 10;
const MAX_ERROR_JOBS = 8;
const MAX_TOP_TAGS = 15;
const MAX_RECENT_ACTIVITIES = 20;
const MAX_SLOW_JOBS = 5;
const MAX_FOLLOW_UNFOLLOW = 10;
const MAX_TAGGED_POSTS = 10;

// Servir les fichiers statiques
app.use(express.static('public'));

// Route principale
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TagKy Monitor</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            background: #1a1a1a;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.4;
        }
        
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding: 15px;
            background: linear-gradient(135deg, #2c3e50, #3498db);
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        
        .header h1 {
            color: #ecf0f1;
            font-size: 2em;
            margin-bottom: 5px;
        }
        
        .timestamp {
            color: #bdc3c7;
            font-size: 0.9em;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .card {
            background: #2c2c2c;
            border-radius: 8px;
            padding: 15px;
            border-left: 4px solid #3498db;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .card h3 {
            color: #3498db;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin-bottom: 10px;
        }
        
        .stat {
            background: #3a3a3a;
            padding: 8px;
            border-radius: 5px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 1.2em;
            font-weight: bold;
            color: #2ecc71;
        }
        
        .stat-label {
            font-size: 0.8em;
            color: #95a5a6;
        }
        
        .activity-list {
            max-height: 300px;
            overflow-y: auto;
        }
        
        .activity-item {
            display: flex;
            align-items: center;
            padding: 5px 0;
            border-bottom: 1px solid #3a3a3a;
        }
        
        .activity-icon {
            margin-right: 8px;
            font-size: 1.1em;
        }
        
        .activity-time {
            color: #95a5a6;
            font-size: 0.8em;
            margin-right: 10px;
            min-width: 50px;
        }
        
        .activity-desc {
            flex: 1;
            font-size: 0.9em;
        }
        
        .tag-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        
        .tag {
            background: #34495e;
            color: #ecf0f1;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.8em;
        }
        
        .error {
            color: #e74c3c;
        }
        
        .success {
            color: #2ecc71;
        }
        
        .warning {
            color: #f39c12;
        }
        
        .info {
            color: #3498db;
        }
        
        .health-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 5px;
        }
        
        .health-good {
            background: #2ecc71;
        }
        
        .health-warning {
            background: #f39c12;
        }
        
        .health-error {
            background: #e74c3c;
        }
        
        .full-width {
            grid-column: 1 / -1;
        }
        
        .scrollable {
            max-height: 200px;
            overflow-y: auto;
        }
        
        .connection-status {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 0.8em;
        }
        
        .connected {
            background: #2ecc71;
            color: white;
        }
        
        .disconnected {
            background: #e74c3c;
            color: white;
        }
    </style>
</head>
<body>
    <div class="connection-status" id="connectionStatus">Connexion...</div>
    
    <div class="header">
        <h1>🏷️ TagKy Monitor</h1>
        <div class="timestamp" id="timestamp">Chargement...</div>
    </div>
    
    <div class="grid">
        <div class="card">
            <h3>📊 Statistiques principales</h3>
            <div class="stats-grid" id="mainStats">
                <!-- Stats will be populated here -->
            </div>
        </div>
        
        <div class="card">
            <h3>⚡ Performance</h3>
            <div id="performance">
                <!-- Performance metrics will be populated here -->
            </div>
        </div>
        
        <div class="card">
            <h3>🏥 Santé du système</h3>
            <div id="systemHealth">
                <!-- System health will be populated here -->
            </div>
        </div>
        
        <div class="card full-width">
            <h3>📋 Activités récentes</h3>
            <div class="activity-list" id="activities">
                <!-- Activities will be populated here -->
            </div>
        </div>
        
        <div class="card">
            <h3>🔥 Top Tags</h3>
            <div class="tag-list" id="topTags">
                <!-- Tags will be populated here -->
            </div>
        </div>
        
        <div class="card">
            <h3>🚨 Erreurs récentes</h3>
            <div class="scrollable" id="errors">
                <!-- Errors will be populated here -->
            </div>
        </div>
        
        <div class="card full-width">
            <h3>📄 Posts taggés récents</h3>
            <div class="scrollable" id="taggedPosts">
                <!-- Tagged posts will be populated here -->
            </div>
        </div>
    </div>
    
    <script>
        const socket = io();
        const connectionStatus = document.getElementById('connectionStatus');
        
        socket.on('connect', () => {
            connectionStatus.textContent = '🟢 Connecté';
            connectionStatus.className = 'connection-status connected';
        });
        
        socket.on('disconnect', () => {
            connectionStatus.textContent = '🔴 Déconnecté';
            connectionStatus.className = 'connection-status disconnected';
        });
        
        socket.on('data', (data) => {
            updateTimestamp();
            updateMainStats(data.stats);
            updatePerformance(data.performance);
            updateSystemHealth(data.health);
            updateActivities(data.activities);
            updateTopTags(data.tags);
            updateErrors(data.errors);
            updateTaggedPosts(data.taggedPosts);
        });
        
        function updateTimestamp() {
            document.getElementById('timestamp').textContent = new Date().toLocaleTimeString('fr-FR');
        }
        
        function updateMainStats(stats) {
            if (!stats) return;
            
            const statsHtml = \`
                <div class="stat">
                    <div class="stat-value">\${stats.users}</div>
                    <div class="stat-label">👥 Users</div>
                </div>
                <div class="stat">
                    <div class="stat-value">\${stats.tags}</div>
                    <div class="stat-label">🏷️ Tags</div>
                </div>
                <div class="stat">
                    <div class="stat-value">\${stats.posts}</div>
                    <div class="stat-label">📄 Posts</div>
                </div>
                <div class="stat">
                    <div class="stat-value warning">\${stats.pending}</div>
                    <div class="stat-label">⏳ Pending</div>
                </div>
                <div class="stat">
                    <div class="stat-value info">\${stats.processing}</div>
                    <div class="stat-label">⚙️ Processing</div>
                </div>
                <div class="stat">
                    <div class="stat-value success">\${stats.done}</div>
                    <div class="stat-label">✅ Done</div>
                </div>
                <div class="stat">
                    <div class="stat-value error">\${stats.error}</div>
                    <div class="stat-label">❌ Error</div>
                </div>
                <div class="stat">
                    <div class="stat-value">\${stats.published}</div>
                    <div class="stat-label">📤 Published</div>
                </div>
            \`;
            
            document.getElementById('mainStats').innerHTML = statsHtml;
        }
        
        function updatePerformance(performance) {
            if (!performance) return;
            
            const perfHtml = \`
                <div class="stat">
                    <div class="stat-value">\${performance.avgProcessingTime}s</div>
                    <div class="stat-label">⏱️ Temps moyen</div>
                </div>
                <div class="stat">
                    <div class="stat-value">\${performance.jobsLastHour}</div>
                    <div class="stat-label">📈 Jobs/heure</div>
                </div>
                <div class="stat">
                    <div class="stat-value success">\${performance.successRate}%</div>
                    <div class="stat-label">✅ Succès</div>
                </div>
            \`;
            
            document.getElementById('performance').innerHTML = perfHtml;
        }
        
        function updateSystemHealth(health) {
            if (!health) return;
            
            function getHealthClass(minutes) {
                if (minutes === null) return 'health-error';
                if (minutes < 5) return 'health-good';
                if (minutes < 15) return 'health-warning';
                return 'health-error';
            }
            
            const healthHtml = \`
                <div style="margin-bottom: 10px;">
                    <span class="health-indicator \${getHealthClass(health.lastFetcherActivity)}"></span>
                    Fetcher: \${health.lastFetcherActivity !== null ? health.lastFetcherActivity + 'min' : 'N/A'}
                </div>
                <div style="margin-bottom: 10px;">
                    <span class="health-indicator \${getHealthClass(health.lastWorkerActivity)}"></span>
                    Worker: \${health.lastWorkerActivity !== null ? health.lastWorkerActivity + 'min' : 'N/A'}
                </div>
                <div>
                    <span class="health-indicator \${getHealthClass(health.lastPublisherActivity)}"></span>
                    Publisher: \${health.lastPublisherActivity !== null ? health.lastPublisherActivity + 'min' : 'N/A'}
                </div>
            \`;
            
            document.getElementById('systemHealth').innerHTML = healthHtml;
        }
        
        function updateActivities(activities) {
            if (!activities || !activities.length) return;
            
            const activitiesHtml = activities.map(activity => {
                let icon, className;
                const time = new Date(activity.created_at).toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                switch (activity.type) {
                    case 'job':
                        if (activity.status === 'done') {
                            icon = '✅';
                            className = 'success';
                        } else if (activity.status === 'error') {
                            icon = '❌';
                            className = 'error';
                        } else if (activity.status === 'processing') {
                            icon = '⚙️';
                            className = 'warning';
                        } else {
                            icon = '⏳';
                            className = 'info';
                        }
                        break;
                    case 'notification':
                        icon = '📬';
                        className = 'info';
                        break;
                    case 'published':
                        icon = '📤';
                        className = activity.status === 'success' ? 'success' : 'error';
                        break;
                    case 'follow':
                        icon = '👥';
                        className = 'success';
                        break;
                    case 'tag':
                        icon = '🏷️';
                        className = 'info';
                        break;
                    default:
                        icon = '?';
                        className = '';
                }
                
                let description = '';
                switch (activity.type) {
                    case 'job':
                        description = activity.keywords || 'Job';
                        if (activity.post_uri) description += \` | \${activity.post_uri.substring(0, 40)}...\`;
                        break;
                    case 'notification':
                        description = \`Mention/Reply\${activity.user_id ? ' from ' + activity.user_id : ''}\`;
                        break;
                    case 'published':
                        description = \`Post published\${activity.user_id ? ' by ' + activity.user_id : ''}\`;
                        break;
                    case 'follow':
                        description = \`Follow: \${activity.user_id}\`;
                        break;
                    case 'tag':
                        description = \`Tag: \${activity.keyword}\`;
                        break;
                }
                
                return \`
                    <div class="activity-item">
                        <span class="activity-icon \${className}">\${icon}</span>
                        <span class="activity-time">\${time}</span>
                        <span class="activity-desc">\${description}</span>
                    </div>
                \`;
            }).join('');
            
            document.getElementById('activities').innerHTML = activitiesHtml;
        }
        
        function updateTopTags(tags) {
            if (!tags || !tags.length) return;
            
            const tagsHtml = tags.map(tag => {
                const lastUsed = new Date(tag.last_used).toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                return \`<span class="tag">\${tag.tag} (\${tag.count})</span>\`;
            }).join('');
            
            document.getElementById('topTags').innerHTML = tagsHtml;
        }
        
        function updateErrors(errors) {
            if (!errors || !errors.recentErrors || !errors.recentErrors.length) {
                document.getElementById('errors').innerHTML = '<div style="color: #2ecc71;">Aucune erreur récente 🎉</div>';
                return;
            }
            
            const errorsHtml = errors.recentErrors.map(error => {
                const time = new Date(error.created_at).toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                const shortError = error.last_error.substring(0, 60) + (error.last_error.length > 60 ? '...' : '');
                return \`
                    <div class="activity-item">
                        <span class="activity-icon error">❌</span>
                        <span class="activity-time">\${time}</span>
                        <span class="activity-desc">\${shortError}</span>
                    </div>
                \`;
            }).join('');
            
            document.getElementById('errors').innerHTML = errorsHtml;
        }
        
        function updateTaggedPosts(taggedPosts) {
            if (!taggedPosts || !taggedPosts.length) return;
            
            const postsHtml = taggedPosts.map(post => {
                const time = new Date(post.last_tagged).toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                return \`
                    <div style="margin-bottom: 10px; padding: 8px; background: #3a3a3a; border-radius: 5px;">
                        <div style="font-size: 0.8em; color: #95a5a6; margin-bottom: 3px;">\${time}</div>
                        <div style="font-size: 0.9em; margin-bottom: 3px;">\${post.post_uri}</div>
                        <div style="font-size: 0.8em; color: #3498db;">🏷️ Tags (\${post.tag_count}): \${post.all_tags}</div>
                    </div>
                \`;
            }).join('');
            
            document.getElementById('taggedPosts').innerHTML = postsHtml;
        }
    </script>
</body>
</html>
  `);
});

// Fonctions de base de données (reprises du monitor-compact.js)
function getStats() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 1000 });
    const stats = {
      users: db.prepare('SELECT COUNT(*) AS count FROM followed_users').get()?.count || 0,
      tags: db.prepare('SELECT COUNT(*) AS count FROM tags').get()?.count || 0,
      posts: db.prepare('SELECT COUNT(DISTINCT post_uri) AS count FROM tags').get()?.count || 0,
      pending: db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'pending'").get()?.count || 0,
      processing: db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'processing'").get()?.count || 0,
      done: db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'done'").get()?.count || 0,
      error: db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'error'").get()?.count || 0,
      ignored: db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status = 'ignored'").get()?.count || 0,
      notifications: db.prepare('SELECT COUNT(*) AS count FROM processed_notifications').get()?.count || 0,
      published: db.prepare('SELECT COUNT(*) AS count FROM published_posts').get()?.count || 0
    };
    return stats;
  } catch (error) {
    log.error('Error getting stats:', error);
    return {
      users: 0, tags: 0, posts: 0, pending: 0, processing: 0, 
      done: 0, error: 0, ignored: 0, notifications: 0, published: 0
    };
  } finally {
    if (db) {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }
}

function getTopTags() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 1000 });
    const tags = db.prepare(`
      SELECT keyword as tag, COUNT(*) as count, MAX(created_at) as last_used
      FROM tags 
      GROUP BY keyword 
      ORDER BY count DESC 
      LIMIT ?
    `).all(MAX_TOP_TAGS);
    return tags;
  } catch (error) {
    log.error('Error getting top tags:', error);
    return [];
  } finally {
    if (db) {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }
}

function getRecentActivities() {
  // Temporairement désactivé pour éviter les erreurs SQLite
  return [];
}

function getPerformanceMetrics() {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const avgProcessingTime = db.prepare(`
      SELECT AVG(
        (julianday(processed_at) - julianday(created_at)) * 24 * 60 * 60
      ) as avg_seconds
      FROM jobs 
      WHERE status = 'done' 
        AND processed_at IS NOT NULL 
        AND datetime(created_at) > datetime('now', '-24 hours')
    `).get()?.avg_seconds || 0;
    
    const jobsLastHour = db.prepare(`
      SELECT COUNT(*) as count
      FROM jobs 
      WHERE status = 'done' 
        AND datetime(processed_at) > datetime('now', '-1 hour')
    `).get()?.count || 0;
    
    const successRate = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'done' THEN 1 END) * 100.0 / COUNT(*) as rate
      FROM jobs 
      WHERE datetime(created_at) > datetime('now', '-24 hours')
        AND status IN ('done', 'error', 'ignored')
    `).get()?.rate || 0;
    
    db.close();
    return {
      avgProcessingTime: Math.round(avgProcessingTime),
      jobsLastHour,
      successRate: Math.round(successRate * 10) / 10
    };
  } catch (error) {
    log.error('Error getting performance metrics:', error);
    return {
      avgProcessingTime: 0,
      jobsLastHour: 0,
      successRate: 0
    };
  }
}

function getSystemHealth() {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const lastFetcherActivity = db.prepare(`
      SELECT MAX(processed_at) as last_activity
      FROM processed_notifications
    `).get()?.last_activity;
    
    const lastWorkerActivity = db.prepare(`
      SELECT MAX(processed_at) as last_activity
      FROM jobs WHERE status = 'done'
    `).get()?.last_activity;
    
    const lastPublisherActivity = db.prepare(`
      SELECT MAX(published_at) as last_activity
      FROM published_posts
    `).get()?.last_activity;
    
    db.close();
    
    const now = new Date();
    const getMinutesAgo = (timestamp) => {
      if (!timestamp) return null;
      return Math.round((now - new Date(timestamp)) / 60000);
    };
    
    return {
      lastFetcherActivity: getMinutesAgo(lastFetcherActivity),
      lastWorkerActivity: getMinutesAgo(lastWorkerActivity),
      lastPublisherActivity: getMinutesAgo(lastPublisherActivity)
    };
  } catch (error) {
    log.error('Error getting system health:', error);
    return {
      lastFetcherActivity: null,
      lastWorkerActivity: null,
      lastPublisherActivity: null
    };
  }
}

function getErrorAnalysis() {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const recentErrors = db.prepare(`
      SELECT 
        last_error,
        created_at,
        keywords,
        post_uri
      FROM jobs 
      WHERE status = 'error' 
        AND last_error IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(MAX_ERROR_JOBS);
    
    db.close();
    return { recentErrors };
  } catch (error) {
    log.error('Error getting error analysis:', error);
    return { recentErrors: [] };
  }
}

function getTaggedPostsDetails() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 1000 });
    
    const taggedPosts = db.prepare(`
      SELECT 
        post_uri,
        GROUP_CONCAT(keyword, ', ') as all_tags,
        COUNT(*) as tag_count,
        MAX(created_at) as last_tagged
      FROM tags 
      GROUP BY post_uri 
      ORDER BY last_tagged DESC 
      LIMIT ?
    `).all(MAX_TAGGED_POSTS);
    
    return taggedPosts;
  } catch (error) {
    log.error('Error getting tagged posts:', error);
    return [];
  } finally {
    if (db) {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  }
}

// Fonction pour collecter toutes les données
function collectData() {
  return {
    stats: getStats(),
    tags: getTopTags(),
    activities: getRecentActivities(),
    performance: getPerformanceMetrics(),
    health: getSystemHealth(),
    errors: getErrorAnalysis(),
    taggedPosts: getTaggedPostsDetails()
  };
}

// WebSocket pour les mises à jour en temps réel
io.on('connection', (socket) => {
  log.info('Client connected to web monitor');
  
  // Envoyer les données immédiatement
  socket.emit('data', collectData());
  
  // Envoyer les mises à jour périodiques
  const interval = setInterval(() => {
    socket.emit('data', collectData());
  }, REFRESH_INTERVAL);
  
  socket.on('disconnect', () => {
    log.info('Client disconnected from web monitor');
    clearInterval(interval);
  });
});

// Démarrage du serveur
server.listen(PORT, () => {
  log.info(`🌐 Web Monitor started on http://localhost:${PORT}`);
  log.info('📊 Real-time monitoring dashboard available');
});

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  log.info('🛑 Web Monitor stopping...');
  server.close(() => {
    log.info('✅ Web Monitor stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  log.info('🛑 Web Monitor stopping...');
  server.close(() => {
    log.info('✅ Web Monitor stopped');
    process.exit(0);
  });
});

export default app;