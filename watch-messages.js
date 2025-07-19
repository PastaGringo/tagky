const { PubkyCLIAuth } = require('./pubky-cli-auth');
const axios = require('axios');
const pubkyAppSpecs = require('pubky-app-specs');
const { PubkySpecsBuilder } = pubkyAppSpecs;
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');

const auth = new PubkyCLIAuth();

auth.on('login', async (data) => {
        console.log(
            chalk.magenta(
                figlet.textSync('Tagky', { horizontalLayout: 'full' })
            )
        );
        console.log(chalk.bold.magenta('🚀 Tagky is watching for new messages...\n'));
        const wasmPath = path.join(__dirname, 'node_modules', 'pubky-app-specs', 'pubky_app_specs_bg.wasm');
        const wasmBuffer = fs.readFileSync(wasmPath);
        await pubkyAppSpecs.default(wasmBuffer); // Initialize WASM module
        const userPublicKeyString = data.remotePeer.z32();
        const specs = new PubkySpecsBuilder(userPublicKeyString);
        console.log(chalk.green('Connected to client!'));
        console.log(chalk.cyan(`User public key: ${userPublicKeyString}\n`));

        let knownPostUris = new Set();

        const checkForNewPosts = async () => {
            try {
                const url = `pubky://${userPublicKeyString}/pub/pubky.app/posts/`;
                const response = await data.client.fetch(url);
                if (!response.ok) {
                    console.error(chalk.red(`Failed to fetch posts list: ${response.statusText}`));
                    return;
                }

                const text = await response.text();
                const postUris = text.trim().split('\n').filter(uri => uri);

                let newUris = [];
                if (knownPostUris.size === 0) {
                    // First run, all are known
                    postUris.forEach(uri => knownPostUris.add(uri));
                    console.log(chalk.yellow(`Initialized with ${knownPostUris.size} existing posts. Waiting for new ones...`));
                } else {
                    newUris = postUris.filter(uri => !knownPostUris.has(uri));
                }

                if (newUris.length > 0) {
                    console.log(chalk.bold.magenta(`\nFound ${newUris.length} new post(s):`));
                    newUris.forEach(uri => knownPostUris.add(uri)); // Add to known URIs immediately

                    for (const uri of newUris) {
                        try {
                            const postResponse = await data.client.fetch(uri);
                            if (postResponse.ok) {
                                const post = await postResponse.json();
                                console.log(chalk.blue('------------------------'));
                                console.log(chalk.white(`New Post at ${uri}:\n`), chalk.whiteBright(JSON.stringify(post, null, 2)));
                                console.log(chalk.blue('------------------------'));

                                if (post.content) {
                                    const tags = await getTagsFromOllama(post.content);
                                    if (tags && tags.length > 0) {
                                        await applyTags(uri, tags, specs, data.client);
                                    }
                                }
                            } else {
                                console.error(chalk.red(` - Failed to fetch content for ${uri}: ${postResponse.statusText}`));
                            }
                        } catch (e) {
                            console.error(chalk.red(` - Error processing post ${uri}:`), e.message);
                        }
                    }
                }

            } catch (error) {
                console.error(chalk.red('Error checking for new posts:'), error.message);
            }
        };

        // Check for new posts every 10 seconds
        setInterval(checkForNewPosts, 10000);
        // Initial check
        await checkForNewPosts();
    });

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