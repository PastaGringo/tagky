#!/usr/bin/env node

// Script pour afficher monitor-compact.js dans les logs Docker
// avec un formatage adapté aux conteneurs

// Import des fonctions depuis monitor-compact.js (qui utilise ES modules)
// On va recréer les fonctions nécessaires ici pour éviter les problèmes d'import
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'queue.db');

// Fonction pour collecter les statistiques
function collectStats() {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users) as totalUsers,
        (SELECT COUNT(*) FROM tags) as totalTags,
        (SELECT COUNT(*) FROM posts) as totalPosts,
        (SELECT COUNT(*) FROM notifications) as totalNotifications,
        (SELECT COUNT(*) FROM jobs WHERE status = 'pending') as pendingJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'processing') as processingJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'done') as completedJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'error') as errorJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'ignored') as skippedJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'published') as publishedJobs,
        (SELECT COUNT(DISTINCT post_uri) FROM tags) as taggedPosts
    `).get();
    
    db.close();
    return stats || {};
  } catch (error) {
    return {
      totalUsers: 0, totalTags: 0, totalPosts: 0, totalNotifications: 0,
      pendingJobs: 0, processingJobs: 0, completedJobs: 0, errorJobs: 0,
      skippedJobs: 0, publishedJobs: 0, taggedPosts: 0
    };
  }
}

// Fonction pour récupérer les jobs récents
function getRecentJobs(limit = 5) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const jobs = db.prepare(`
      SELECT type, status, created_at, processed_at
      FROM jobs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit);
    db.close();
    return jobs || [];
  } catch (error) {
    return [];
  }
}

// Fonction pour récupérer l'activité récente
function getRecentActivity(limit = 5) {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Simuler l'activité récente basée sur les jobs et notifications
    const activities = [];
    
    // Jobs récents
    const recentJobs = db.prepare(`
      SELECT 'job' as type, type as job_type, status, created_at
      FROM jobs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit);
    
    recentJobs.forEach(job => {
      activities.push({
        type: 'job',
        description: `Job ${job.job_type} - ${job.status}`,
        created_at: job.created_at
      });
    });
    
    // Notifications récentes
    const recentNotifs = db.prepare(`
      SELECT 'notification' as type, created_at
      FROM notifications 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit);
    
    recentNotifs.forEach(notif => {
      activities.push({
        type: 'notification',
        description: 'Nouvelle notification',
        created_at: notif.created_at
      });
    });
    
    db.close();
    
    // Trier par date et limiter
    return activities
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  } catch (error) {
    return [];
  }
}

// Fonction pour afficher les stats de manière compacte pour Docker
function displayDockerLogs() {
  try {
    const stats = collectStats();
    const recentJobs = getRecentJobs(5);
    const recentActivity = getRecentActivity(5);
    
    // Header avec timestamp
    console.log('\n' + '='.repeat(60));
    console.log(`[TAGKY MONITOR] ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    // Stats principales
    console.log(`📊 STATS: Users: ${stats.totalUsers} | Tags: ${stats.totalTags} | Posts: ${stats.totalPosts}`);
    console.log(`📝 NOTIFICATIONS: ${stats.totalNotifications}`);
    console.log(`⚙️  JOBS: Pending: ${stats.pendingJobs} | Processing: ${stats.processingJobs} | Done: ${stats.completedJobs}`);
    console.log(`❌ ERRORS: ${stats.errorJobs} | ⏭️  SKIPPED: ${stats.skippedJobs} | ✅ PUBLISHED: ${stats.publishedJobs}`);
    console.log(`🏷️  TAGGED POSTS: ${stats.taggedPosts}`);
    
    // Activité récente
    if (recentActivity.length > 0) {
      console.log('\n📋 RECENT ACTIVITY:');
      recentActivity.forEach(activity => {
        const icon = getActivityIcon(activity.type);
        const time = new Date(activity.created_at).toLocaleTimeString();
        console.log(`  ${icon} [${time}] ${activity.description}`);
      });
    }
    
    // Jobs récents
    if (recentJobs.length > 0) {
      console.log('\n🔄 RECENT JOBS:');
      recentJobs.forEach(job => {
        const statusIcon = getJobStatusIcon(job.status);
        const time = new Date(job.created_at).toLocaleTimeString();
        console.log(`  ${statusIcon} [${time}] ${job.type} - ${job.status}`);
      });
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error(`[TAGKY MONITOR ERROR] ${error.message}`);
  }
}

// Icônes pour les types d'activité
function getActivityIcon(type) {
  const icons = {
    'job': '⚙️',
    'notification': '📢',
    'publish': '📤',
    'follow': '👥',
    'unfollow': '👤',
    'tag': '🏷️'
  };
  return icons[type] || '📋';
}

// Icônes pour les statuts de jobs
function getJobStatusIcon(status) {
  const icons = {
    'pending': '⏳',
    'processing': '⚙️',
    'completed': '✅',
    'error': '❌',
    'skipped': '⏭️',
    'published': '📤'
  };
  return icons[status] || '❓';
}

// Fonction principale
function main() {
  console.log('[TAGKY MONITOR] Démarrage du moniteur Docker...');
  
  // Affichage initial
  displayDockerLogs();
  
  // Mise à jour toutes les 10 secondes (plus adapté pour Docker)
  const interval = setInterval(displayDockerLogs, 10000);
  
  // Gestion de l'arrêt propre
  process.on('SIGINT', () => {
    console.log('\n[TAGKY MONITOR] Arrêt du moniteur...');
    clearInterval(interval);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[TAGKY MONITOR] Arrêt du moniteur...');
    clearInterval(interval);
    process.exit(0);
  });
}

// Démarrage si exécuté directement
if (require.main === module) {
  main();
}

module.exports = { displayDockerLogs, main };