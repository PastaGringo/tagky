```

  ████████╗ █████╗  ██████╗ ██╗  ██╗██╗   ██╗
  ╚══██╔══╝██╔══██╗██╔════╝ ██║ ██╔╝╚██╗ ██╔╝
     ██║   ███████║╚█████╗  █████╔╝  ╚████╔╝ 
     ██║   ██╔══██║ ╚═══██╗ ██╔═██╗   ╚██╔╝  
     ██║   ██║  ██║██████╔╝ ██║  ██╗   ██║   
     ╚═╝   ╚═╝  ╚═╝╚═════╝  ╚═╝  ╚═╝   ╚═╝   

```

# Tagky - Pubky Tagging Application

## About

Tagky is a command-line application designed to interact with the Pubky network. It automatically fetches new content and uses a local AI model to generate and apply relevant tags, helping to organize and discover information on the decentralized network.

This project contains a set of command-line interface (CLI) scripts to interact with the Pubky network. It allows authenticating via the Pubky Ring application, fetching messages, and automatically tagging new content using a local AI model.

- **Pubky Website**: [pubky.org](https://pubky.org)
- **Pubky GitHub Repository**: [github.com/pubky](https://github.com/pubky)

This project contains a set of command-line interface (CLI) scripts to interact with the Pubky network. It allows authenticating via the Pubky Ring application, fetching messages, and automatically tagging new content using a local AI model.

## Installation

Ensure you have Node.js installed, then install the dependencies:

```bash
npm install
```

## How to Launch the Application

To run the main application, which watches for and tags new messages, execute:

```bash
node watch-messages.js
```

A QR code will be displayed in your terminal. Scan it with the Pubky Ring app on your mobile device to authorize the connection.

## Scripts Description

### `pubky-cli-auth.js`

This is a reusable module that handles the authentication logic with Pubky. It uses the `@synonymdev/pubky` SDK to generate a secure authentication request as a QR code and emits a `login` event upon successful connection.

**Key Code Snippet:**
```javascript
const authRequest = client.authRequest(
  NEXT_PUBLIC_DEFAULT_HTTP_RELAY,
  capabilities
);

const authUrl = authRequest.url();
qrcode.generate(authUrl, { small: true }, (qr) => {
  console.log(qr);
});

const remotePeer = await authRequest.response();
this.emit('login', { remotePeer, client });
```
This snippet creates an authentication request, displays it as a QR code, and waits for the user to authorize it in the Pubky Ring app. Once authorized, it emits a `login` event with the connection details.

### `watch-messages.js`

The main script of the application. It authenticates the user, then periodically checks for new posts on the Pubky network. When a new post is found, it sends the content to a local Ollama instance (Mistral model) to extract relevant tags and applies them to the post.

**Key Code Snippet:**
```javascript
const checkForNewPosts = async () => {
    const response = await data.client.fetch(url);
    const postUris = (await response.text()).trim().split('\n');
    const newUris = postUris.filter(uri => !knownPostUris.has(uri));

    for (const uri of newUris) {
        const postResponse = await data.client.fetch(uri);
        const post = await postResponse.json();
        const tags = await getTagsFromOllama(post.content);
        await applyTags(uri, tags, specs, data.client);
    }
};

setInterval(checkForNewPosts, 10000);
```
This part of the script periodically fetches the list of posts, identifies new ones, retrieves their content, generates tags using a local AI, and applies them.

### `get-messages.js`

A simpler script that authenticates and fetches all existing posts for the connected user, then exits.

**Key Code Snippet:**
```javascript
auth.on('login', async (data) => {
  try {
    const posts = await data.client.get('/pub/pubky.app/posts/');
    console.log('Publications récupérées :', posts);
  } catch (error) {
    console.error('Erreur lors de la récupération des publications :', error);
  }
});
```
This snippet shows how, after a successful login, the script makes a single request to fetch all posts for the authenticated user.

### `test.js`

A test script used for development. It authenticates, fetches all posts, and then attempts to retrieve the content of each post individually.

**Key Code Snippet:**
```javascript
const response = await data.client.fetch(url);
const postUris = (await response.text()).trim().split('\n');

for (const uri of postUris) {
    const postResponse = await data.client.fetch(uri);
    if (postResponse.ok) {
        const post = await postResponse.json();
        allPosts.push(post);
    }
}
console.log('Toutes les publications récupérées :', allPosts);
```
This snippet demonstrates fetching a list of post URIs and then iterating through them to fetch the full content of each post one by one.

## How It Works

The `pubky-cli-auth.js` script uses the `client.authRequest()` method from the Pubky SDK to create a temporary and secure authentication URL. This URL is then converted into a QR code.

When you scan this QR code with Pubky Ring:

1.  The app verifies the request's validity.
2.  It asks you to confirm the authorization.
3.  Once authorization is granted, the `authRequest.response()` promise in the script resolves and returns your public key information.
4.  A `login` event is emitted with the user data.

## Development Context and Deeper Understanding

The file `pubky-dev-context(2).md` is included in this repository to provide a rich context for AI-assisted development. It contains logs, errors, and notes from the development process, which can be invaluable for an AI to understand the project's history and challenges.

To fully grasp how this project interacts with the Pubky ecosystem, it is highly recommended to analyze the following official Pubky repositories:

-   **`pubky/pubky-core`**: The core implementation of the Pubky protocol.
-   **`pubky/pubky-app`**: The reference client application for Pubky.
-   **`pubky/pubky-app-specs`**: The data model specifications for Pubky applications.

Analyzing these repositories will provide a comprehensive understanding of the underlying technology and data structures.

## Dependencies and Sources

-   **`@synonymdev/pubky`**: The core dependency. It's the official Pubky client for JavaScript/WebAssembly, used for all interactions with the Pubky network.
    -   **Source**: [npm](https://www.npmjs.com/package/@synonymdev/pubky) | [GitHub (part of pubky-core)](https://github.com/pubky/pubky-core)
-   **`pubky-app-specs`**: Used for creating and validating data models (like tags) according to the Pubky application specifications.
    -   **Source**: [npm](https://www.npmjs.com/package/pubky-app-specs)
-   **`qrcode-terminal`**: Generates QR codes in the terminal for the login process.
    -   **Source**: [npm](https://www.npmjs.com/package/qrcode-terminal)
-   **`axios`**: Used to make HTTP requests to the local Ollama AI model.
    -   **Source**: [npm](https://www.npmjs.com/package/axios)
-   **`chalk` & `figlet`**: Used for styling the terminal output.
    -   **Source**: [npm (chalk)](https://www.npmjs.com/package/chalk) | [npm (figlet)](https://www.npmjs.com/package/figlet)

## License

MIT

---

```

  ████████╗ █████╗  ██████╗ ██╗  ██╗██╗   ██╗
  ╚══██╔══╝██╔══██╗██╔════╝ ██║ ██╔╝╚██╗ ██╔╝
     ██║   ███████║╚█████╗  █████╔╝  ╚████╔╝ 
     ██║   ██╔══██║ ╚═══██╗ ██╔═██╗   ╚██╔╝  
     ██║   ██║  ██║██████╔╝ ██║  ██╗   ██║   
     ╚═╝   ╚═╝  ╚═╝╚═════╝  ╚═╝  ╚═╝   ╚═╝   

```

# Tagky - Application de Tagging Pubky

## À propos

Tagky est une application en ligne de commande conçue pour interagir avec le réseau Pubky. Elle récupère automatiquement le nouveau contenu et utilise un modèle d'IA local pour générer et appliquer des tags pertinents, aidant ainsi à organiser et à découvrir des informations sur le réseau décentralisé.

Ce projet contient un ensemble de scripts en ligne de commande (CLI) pour interagir avec le réseau Pubky. Il permet de s'authentifier via l'application Pubky Ring, de récupérer des messages et de taguer automatiquement du nouveau contenu à l'aide d'un modèle d'IA local.

- **Site web de Pubky**: [pubky.org](https://pubky.org)
- **Dépôt GitHub de Pubky**: [github.com/pubky](https://github.com/pubky)

Ce projet contient un ensemble de scripts en ligne de commande (CLI) pour interagir avec le réseau Pubky. Il permet de s'authentifier via l'application Pubky Ring, de récupérer des messages et de taguer automatiquement du nouveau contenu à l'aide d'un modèle d'IA local.

## Installation

Assurez-vous d'avoir Node.js installé, puis installez les dépendances :

```bash
npm install
```

## Lancement de l'application

Pour lancer l'application principale, qui surveille et tague les nouveaux messages, exécutez :

```bash
node watch-messages.js
```

Un QR code s'affichera dans votre terminal. Scannez-le avec l'application Pubky Ring sur votre appareil mobile pour autoriser la connexion.

## Description des Scripts

### `pubky-cli-auth.js`

Ceci est un module réutilisable qui gère la logique d'authentification avec Pubky. Il utilise le SDK `@synonymdev/pubky` pour générer une requête d'authentification sécurisée sous forme de QR code et émet un événement `login` lors d'une connexion réussie.

**Extrait de code clé :**
```javascript
const authRequest = client.authRequest(
  NEXT_PUBLIC_DEFAULT_HTTP_RELAY,
  capabilities
);

const authUrl = authRequest.url();
qrcode.generate(authUrl, { small: true }, (qr) => {
  console.log(qr);
});

const remotePeer = await authRequest.response();
this.emit('login', { remotePeer, client });
```
Cet extrait crée une demande d'authentification, l'affiche sous forme de QR code et attend que l'utilisateur l'autorise dans l'application Pubky Ring. Une fois l'autorisation accordée, il émet un événement `login` avec les détails de la connexion.

### `watch-messages.js`

Le script principal de l'application. Il authentifie l'utilisateur, puis vérifie périodiquement les nouvelles publications sur le réseau Pubky. Lorsqu'une nouvelle publication est trouvée, il envoie le contenu à une instance locale d'Ollama (modèle Mistral) pour en extraire des tags pertinents et les applique à la publication.

**Extrait de code clé :**
```javascript
const checkForNewPosts = async () => {
    const response = await data.client.fetch(url);
    const postUris = (await response.text()).trim().split('\n');
    const newUris = postUris.filter(uri => !knownPostUris.has(uri));

    for (const uri of newUris) {
        const postResponse = await data.client.fetch(uri);
        const post = await postResponse.json();
        const tags = await getTagsFromOllama(post.content);
        await applyTags(uri, tags, specs, data.client);
    }
};

setInterval(checkForNewPosts, 10000);
```
Cette partie du script récupère périodiquement la liste des publications, identifie les nouvelles, récupère leur contenu, génère des tags à l'aide d'une IA locale et les applique.

### `get-messages.js`

Un script plus simple qui authentifie et récupère toutes les publications existantes pour l'utilisateur connecté, puis se termine.

**Extrait de code clé :**
```javascript
auth.on('login', async (data) => {
  try {
    const posts = await data.client.get('/pub/pubky.app/posts/');
    console.log('Publications récupérées :', posts);
  } catch (error) {
    console.error('Erreur lors de la récupération des publications :', error);
  }
});
```
Cet extrait montre comment, après une connexion réussie, le script effectue une seule requête pour récupérer toutes les publications de l'utilisateur authentifié.

### `test.js`

Un script de test utilisé pour le développement. Il authentifie, récupère toutes les publications, puis tente de récupérer le contenu de chaque publication individuellement.

**Extrait de code clé :**
```javascript
const response = await data.client.fetch(url);
const postUris = (await response.text()).trim().split('\n');

for (const uri of postUris) {
    const postResponse = await data.client.fetch(uri);
    if (postResponse.ok) {
        const post = await postResponse.json();
        allPosts.push(post);
    }
}
console.log('Toutes les publications récupérées :', allPosts);
```
Cet extrait montre comment récupérer une liste d'URI de publications, puis comment itérer à travers cette liste pour récupérer le contenu complet de chaque publication une par une.

## Fonctionnement

Le script `pubky-cli-auth.js` utilise la méthode `client.authRequest()` du SDK Pubky pour créer une URL d'authentification temporaire et sécurisée. Cette URL est ensuite transformée en QR code.

Lorsque vous scannez ce QR code avec Pubky Ring :

1.  L'application vérifie la validité de la requête.
2.  Elle vous demande de confirmer l'autorisation.
3.  Une fois l'autorisation accordée, la promesse `authRequest.response()` dans le script se résout et renvoie les informations de votre clé publique.
4.  L'événement `login` est émis avec les données de l'utilisateur.

## Contexte de Développement et Compréhension Approfondie

Le fichier `pubky-dev-context(2).md` est inclus dans ce dépôt pour fournir un contexte riche pour le développement assisté par IA. Il contient des journaux, des erreurs et des notes du processus de développement, qui peuvent être d'une valeur inestimable pour une IA afin de comprendre l'historique et les défis du projet.

Pour bien comprendre comment ce projet interagit avec l'écosystème Pubky, il est fortement recommandé d'analyser les dépôts officiels Pubky suivants :

-   **`pubky/pubky-core`**: L'implémentation principale du protocole Pubky.
-   **`pubky/pubky-app`**: L'application client de référence pour Pubky.
-   **`pubky/pubky-app-specs`**: Les spécifications du modèle de données pour les applications Pubky.

L'analyse de ces dépôts fournira une compréhension complète de la technologie sous-jacente et des structures de données.

## Dépendances et Sources

-   **`@synonymdev/pubky`**: La dépendance principale. C'est le client officiel Pubky pour JavaScript/WebAssembly, utilisé pour toutes les interactions avec le réseau Pubky.
    -   **Source**: [npm](https://www.npmjs.com/package/@synonymdev/pubky) | [GitHub (partie de pubky-core)](https://github.com/pubky/pubky-core)
-   **`pubky-app-specs`**: Utilisé pour créer et valider des modèles de données (comme les tags) conformément aux spécifications de l'application Pubky.
    -   **Source**: [npm](https://www.npmjs.com/package/pubky-app-specs)
-   **`qrcode-terminal`**: Génère des QR codes dans le terminal pour le processus de connexion.
    -   **Source**: [npm](https://www.npmjs.com/package/qrcode-terminal)
-   **`axios`**: Utilisé pour effectuer des requêtes HTTP vers le modèle d'IA local Ollama.
    -   **Source**: [npm](https://www.npmjs.com/package/axios)
-   **`chalk` & `figlet`**: Utilisés pour styliser la sortie du terminal.
    -   **Source**: [npm (chalk)](https://www.npmjs.com/package/chalk) | [npm (figlet)](https://www.npmjs.com/package/figlet)

## Licence

MIT