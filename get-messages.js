const { PubkyCLIAuth } = require('./pubky-cli-auth.js');

const auth = new PubkyCLIAuth();

auth.on('login', async (data) => {
  console.log('✅ Connexion réussie !');
  console.log('Clé publique de l\'utilisateur connecté :', data.remotePeer.publicKey.toString('hex'));

  try {
    const posts = await data.client.get('/pub/pubky.app/posts/');
    console.log('Publications récupérées :', posts);
  } catch (error) {
    console.error('Erreur lors de la récupération des publications :', error);
  } finally {
    process.exit(0);
  }
});

auth.on('error', (error) => {
  console.error('Erreur de connexion:', error);
  process.exit(1);
});

console.log('Veuillez scanner le QR code avec l\'application Pubky Ring pour vous connecter.');
auth.login();