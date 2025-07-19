const qrcode = require('qrcode-terminal');
const { PubkyCLIAuth } = require('./pubky-cli-auth');

const auth = new PubkyCLIAuth();



auth.on('login', async (data) => {
    console.log('✅ Connexion réussie !');

    let userPublicKeyString;
    if (data.remotePeer && typeof data.remotePeer.z32 === 'function') {
        userPublicKeyString = data.remotePeer.z32();
        console.log(`Utilisateur authentifié : ${userPublicKeyString}`);
    } else {
        console.error('❌ Impossible d\'obtenir la clé publique de l\'utilisateur.');
        process.exit(1);
    }

    try {
        // Tentative de récupération des publications de l'utilisateur
        const url = `pubky://${userPublicKeyString}/pub/pubky.app/posts/`;
        console.log(`Récupération des publications depuis : ${url}`);

        const response = await data.client.fetch(url);
        if (response.ok) {
            const responseText = await response.text();
            const postUris = responseText.trim().split('\n');
            console.log(`Nombre de publications trouvées : ${postUris.length}`);

            const allPosts = [];
            for (const uri of postUris) {
                try {
                    console.log(`Récupération de la publication : ${uri}`);
                    const postResponse = await data.client.fetch(uri);
                    if (postResponse.ok) {
                        const post = await postResponse.json();
                        allPosts.push(post);
                    } else {
                        console.error(`Échec de la récupération de la publication ${uri}: ${postResponse.status} ${postResponse.statusText}`);
                    }
                } catch (error) {
                    console.error(`Erreur lors de la récupération de la publication ${uri}:`, error);
                }
            }
            console.log('Toutes les publications récupérées :', allPosts);
        } else {
            console.error(`Erreur lors de la récupération des publications : ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error('Corps de la réponse d\'erreur :', errorBody);
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des publications :', error);
    }

    process.exit(0);
});

auth.on('error', (error) => {
    console.error('❌ Échec de la connexion :', error.message);
});

console.log('🚀 Démarrage du processus d’authentification...');
auth.login();
