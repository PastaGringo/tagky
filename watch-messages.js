const { PubkyCLIAuth } = require('./pubky-cli-auth');
const axios = require('axios');
const pubkyAppSpecs = require('pubky-app-specs');
const { PubkySpecsBuilder } = pubkyAppSpecs;
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');

const auth = new PubkyCLIAuth();

const WATCHED_PUBKEYS_PATH = path.join(__dirname, 'watched_pubkeys.json');
const MY_PUBKEY = 'pk:wyzsr6ckk4j55cczb3yxgybimeapp86tu85a1xn38iffb1iy8njy';

async function getWatchedPubkeys() {
    try {
        const data = await fs.readFile(WATCHED_PUBKEYS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function saveWatchedPubkeys(pubkeys) {
    await fs.writeFile(WATCHED_PUBKEYS_PATH, JSON.stringify(pubkeys, null, 2));
}

auth.on('login', async (data) => {
    console.log(chalk.magenta(figlet.textSync('Tagky', { horizontalLayout: 'full' })));
    console.log(chalk.bold.magenta('🚀 Tagky is watching for new messages...\n'));

    const wasmPath = path.join(__dirname, 'node_modules', 'pubky-app-specs', 'pubky_app_specs_bg.wasm');
    const wasmBuffer = await fs.readFile(wasmPath);
    await pubkyAppSpecs.default(wasmBuffer);

    const userPublicKeyString = data.remotePeer.z32();
    const specs = new PubkySpecsBuilder(userPublicKeyString);
    console.log(chalk.green('Connected to client!'));
    console.log(chalk.cyan(`User public key: ${userPublicKeyString}\n`));

    let knownPostUris = new Set();

    async function handleCommands() {
        const url = `pubky://${userPublicKeyString}/pub/pubky.app/posts/?tagged=${MY_PUBKEY}`;
        try {
            const response = await data.client.fetch(url);
            if (!response.ok) return;

            const postUris = (await response.text()).trim().split('\n').filter(uri => uri);
            for (const uri of postUris) {
                if (knownPostUris.has(uri)) continue;
                knownPostUris.add(uri);

                const postResponse = await data.client.fetch(uri);
                if (!postResponse.ok) continue;

                const post = await postResponse.json();
                const senderPubkey = post.meta.owner; // Assuming the sender's pubkey is in meta.owner

                if (post.content) {
                    let watchedPubkeys = await getWatchedPubkeys();
                    if (post.content.includes('/tag on')) {
                        if (!watchedPubkeys.includes(senderPubkey)) {
                            watchedPubkeys.push(senderPubkey);
                            await saveWatchedPubkeys(watchedPubkeys);
                            console.log(chalk.green(`Enabled tagging for ${senderPubkey}`));
                            await sendReply(senderPubkey, 'Tagging has been enabled', specs, data.client);
                        }
                    } else if (post.content.includes('/tag off')) {
                        const index = watchedPubkeys.indexOf(senderPubkey);
                        if (index > -1) {
                            watchedPubkeys.splice(index, 1);
                            await saveWatchedPubkeys(watchedPubkeys);
                            console.log(chalk.yellow(`Disabled tagging for ${senderPubkey}`));
                            await sendReply(senderPubkey, 'Tagging has been disabled', specs, data.client);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red('Error handling commands:'), error.message);
        }
    }

    async function checkForNewPosts() {
        const watchedPubkeys = await getWatchedPubkeys();
        if (watchedPubkeys.length > 0) {
            console.log(chalk.cyan(`Watching for new posts from ${watchedPubkeys.length} user(s)...`));
            for (const pubkey of watchedPubkeys) {
                try {
                    const url = `pubky://${pubkey}/pub/pubky.app/posts/`;
                    const response = await data.client.fetch(url);
                    if (!response.ok) continue;

                    const postUris = (await response.text()).trim().split('\n').filter(uri => uri);
                    const newUris = postUris.filter(uri => !knownPostUris.has(uri));

                    if (newUris.length > 0) {
                        newUris.forEach(uri => knownPostUris.add(uri));
                        for (const uri of newUris) {
                            const postResponse = await data.client.fetch(uri);
                            if (postResponse.ok) {
                                const post = await postResponse.json();
                                console.log(chalk.blue('------------------------'));
                                console.log(chalk.white(`New Post from ${pubkey}:\n`), chalk.whiteBright(JSON.stringify(post, null, 2)));
                                console.log(chalk.blue('------------------------'));

                                if (post.content) {
                                    const tags = await getTagsFromOllama(post.content);
                                    if (tags && tags.length > 0) {
                                        await applyTags(uri, tags, specs, data.client);
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(chalk.red(`Error checking posts for ${pubkey}:`), error.message);
                }
            }
        } else {
            console.log(chalk.gray('No users to watch. Waiting for /tag on commands...'));
        }
    }

    setInterval(handleCommands, 5000); // Check for commands every 5 seconds
    setInterval(checkForNewPosts, 10000); // Check for posts every 10 seconds
    await handleCommands();
    await checkForNewPosts();
});

async function sendReply(recipientPubkey, content, specs, client) {
    console.log(chalk.blue(`Sending reply to ${recipientPubkey}: "${content}"`));
    try {
        // Tagging the recipient in the post to notify them.
        const postResult = specs.createPost(content, [recipientPubkey]);

        const body = JSON.stringify(postResult.post.toJson());
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');

        const response = await client.fetch(postResult.meta.url, {
            method: 'PUT',
            body: new TextEncoder().encode(body),
            headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
        }

        console.log(chalk.green(`✅ Successfully sent reply to: ${recipientPubkey}`));

    } catch (error) {
        console.error(chalk.red(`❌ Error sending reply to "${recipientPubkey}":`), error.message);
    }
}

async function getTagsFromOllama(content) {
    console.log(chalk.blue('\nSending content to Ollama to find tags...'));
    try {
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: 'mistral:latest',
            prompt: `Extract 3 relevant tags from the following text. Respond with a comma-separated list of single words. Text: "${content}"`,
            stream: true
        }, { responseType: 'stream' });

        let ollamaResponse = '';
        for await (const chunk of response.data) {
            const chunkStr = chunk.toString();
            try {
                const json = JSON.parse(chunkStr);
                ollamaResponse += json.response;
                process.stdout.write(json.response);
            } catch (e) {
                // Not a valid JSON, maybe just a string chunk
            }
        }
        console.log(chalk.blue('\nOllama stream finished.'));
        return ollamaResponse.split(',').map(tag => tag.trim()).filter(tag => tag);
    } catch (error) {
        console.error(chalk.red('Error getting tags from Ollama:'), error.message);
        return [];
    }
}

async function applyTags(postUri, tags, specs, client) {
    console.log(chalk.yellow(`Applying tags: ${tags.join(', ')}`));
    for (const tag of tags) {
        const tagLabel = tag.trim();
        if (!tagLabel) continue;

        try {
            const result = specs.createTag(postUri, tagLabel);



            const body = JSON.stringify(result.tag.toJson());



            const headers = new Headers();
            headers.append('Content-Type', 'application/json');

            const response = await client.fetch(result.meta.url, {
                method: 'PUT',
                body: new TextEncoder().encode(body),
                headers,
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
            }

            console.log(chalk.green(`✅ Successfully applied tag: ${tagLabel}`));

        } catch (error) {
            console.error(chalk.red(`❌ Error applying tag "${tagLabel}":`), error.message);
        }
    }
}

auth.login();