# Déploiement Docker - Pubky Authentication

Ce guide explique comment déployer l'application Pubky Authentication avec Docker et Docker Compose.

## Prérequis

- Docker Engine 20.10+
- Docker Compose 2.0+

## Structure des fichiers

```
.
├── Dockerfile              # Image Docker de l'application
├── docker-compose.yml      # Orchestration des services
├── .dockerignore          # Fichiers exclus de l'image
├── pubky-auth.js          # Application principale
├── package.json           # Dépendances Node.js
└── qr-codes/             # Volume pour les QR codes générés
```

## Configuration

### Variables d'environnement

L'application supporte les variables d'environnement suivantes :

- `PUBKY_RELAY_URL` : URL du relay Pubky (défaut: `https://relay.pubky.app/link/`)
- `CALLBACK_PORT` : Port du serveur de callback (défaut: `3000`)
- `CALLBACK_DOMAIN` : Domaine pour l'URL de callback (défaut: `localhost`)
- `QR_OUTPUT_DIR` : Répertoire de sortie des QR codes (défaut: `./qr-codes`)
- `NODE_ENV` : Environnement Node.js (défaut: `production`)

### Ports exposés

- `3000` : Serveur HTTP de callback pour Pubky Ring

## Déploiement

### 1. Construction et démarrage

```bash
# Construction de l'image et démarrage des services
docker-compose up --build

# Démarrage en arrière-plan
docker-compose up -d --build
```

### 2. Vérification du statut

```bash
# Statut des conteneurs
docker-compose ps

# Logs de l'application
docker-compose logs -f pubky-auth

# Health check
curl http://localhost:3000/health
```

### 3. Arrêt des services

```bash
# Arrêt des services
docker-compose down

# Arrêt avec suppression des volumes
docker-compose down -v
```

## Utilisation

### Connexion avec Pubky Ring

1. **Démarrage** : L'application démarre automatiquement et génère un QR code
2. **QR Code** : Le QR code est affiché dans les logs et sauvegardé dans `./qr-codes/`
3. **Scan** : Utilisez l'application Pubky Ring pour scanner le QR code
4. **Callback** : L'application reçoit automatiquement les données de connexion
5. **Connexion** : Les informations de compte sont affichées dans les logs

### Accès aux QR codes

Les QR codes générés sont sauvegardés dans le volume `./qr-codes/` et sont accessibles depuis l'hôte :

```bash
# Lister les QR codes générés
ls -la ./qr-codes/

# Copier un QR code
cp ./qr-codes/pubky-connection-*.png ~/Desktop/
```

## Monitoring

### Health Check

L'application expose un endpoint de health check :

```bash
curl http://localhost:3000/health
# Réponse : {"status":"healthy","timestamp":1234567890}
```

### Logs

```bash
# Logs en temps réel
docker-compose logs -f

# Logs d'un service spécifique
docker-compose logs -f pubky-auth

# Dernières 100 lignes
docker-compose logs --tail=100 pubky-auth
```

## Personnalisation

### Modification du port

Pour changer le port d'écoute, modifiez le `docker-compose.yml` :

```yaml
services:
  pubky-auth:
    ports:
      - "8080:3000"  # Port hôte:Port conteneur
    environment:
      - CALLBACK_PORT=3000
```

### Nom de domaine personnalisé

Pour utiliser un nom de domaine personnalisé :

```bash
# Pour un domaine public (production)
CALLBACK_DOMAIN="mon-domaine.com" docker-compose up

# Pour un sous-domaine
CALLBACK_DOMAIN="pubky.mon-domaine.com" docker-compose up
```

Ou directement dans le `docker-compose.yml` :

```yaml
services:
  pubky-auth:
    environment:
      - CALLBACK_DOMAIN=mon-domaine.com
```

**⚠️ Important pour la production :**
- Assurez-vous que votre domaine pointe vers votre serveur (configuration DNS)
- Utilisez HTTPS en production avec un reverse proxy (nginx, traefik)
- Le port doit être accessible depuis l'extérieur pour recevoir les callbacks

### Relay personnalisé

Pour utiliser un relay différent :

```yaml
services:
  pubky-auth:
    environment:
      - PUBKY_RELAY_URL=https://mon-relay.example.com/
```

## Sécurité

- L'application s'exécute avec un utilisateur non-root (`pubky:nodejs`)
- Les ports sont exposés uniquement sur localhost par défaut
- Les volumes sont montés avec les permissions appropriées
- Health check intégré pour la surveillance

## Dépannage

### Problèmes courants

1. **Port déjà utilisé** :
   ```bash
   # Vérifier les ports utilisés
   netstat -tulpn | grep 3000
   
   # Changer le port dans docker-compose.yml
   ports:
     - "3001:3000"
   ```

2. **Permissions sur les volumes** :
   ```bash
   # Créer le répertoire avec les bonnes permissions
   mkdir -p ./qr-codes
   chmod 755 ./qr-codes
   ```

3. **Logs d'erreur** :
   ```bash
   # Vérifier les logs détaillés
   docker-compose logs --details pubky-auth
   ```

### Reconstruction complète

```bash
# Arrêt et nettoyage complet
docker-compose down -v --rmi all

# Reconstruction depuis zéro
docker-compose up --build --force-recreate
```

## Production

Pour un déploiement en production :

1. **Reverse Proxy** : Utilisez nginx ou traefik devant l'application
2. **HTTPS** : Configurez TLS pour les communications sécurisées
3. **Monitoring** : Intégrez avec Prometheus/Grafana
4. **Logs** : Configurez la rotation et l'archivage des logs
5. **Backup** : Sauvegardez régulièrement le volume `qr-codes`

## Support

Pour plus d'informations, consultez :
- [README principal](./README.md)
- [Documentation Pubky](https://github.com/pubky/pubky)
- [Docker Documentation](https://docs.docker.com/)