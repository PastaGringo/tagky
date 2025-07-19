const { Client } = require('@synonymdev/pubky');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');

const NEXT_PUBLIC_DEFAULT_HTTP_RELAY = 'https://httprelay.pubky.app/link/vQgnkpJiQUuWHwjPBBoiTyoKobKHEBXuGZjYFw68K4w';
const capabilities = '/pub/pubky.app/:rw';

class PubkyCLIAuth extends EventEmitter {
  constructor() {
    super();
  }

  async login() {
    const client = new Client({
      pkarr: {
        relays: ['https://pkarr.pubky.app', 'https://pkarr.pubky.org'],
        requestTimeout: null
      },
      userMaxRecordAge: null
    });

    const authRequest = client.authRequest(
      NEXT_PUBLIC_DEFAULT_HTTP_RELAY,
      capabilities
    );

    const authUrl = authRequest.url();
    const responsePromise = authRequest.response();

    qrcode.generate(authUrl, { small: true }, (qr) => {
      console.log(qr);
      console.log(`-> Scannez le QR code avec Pubky Ring pour vous connecter.`);
    });

    try {
      const remotePeer = await responsePromise;
      this.emit('login', { remotePeer, client });
    } catch (error) {
      console.error('Erreur détaillée:', error); this.emit('error', error);
    }
  }
}

module.exports = { PubkyCLIAuth };