import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('Initializing...');
  const env = await initializeTestEnvironment({
    projectId: 'demo-test',
    storage: {
      rules: fs.readFileSync(
        path.resolve(__dirname, 'storage.rules'),
        'utf8',
      ),
      host: '127.0.0.1',
      port: 9199,
    },
  });

  console.log('Clearing...');
  await env.clearStorage();

  const ctx = env.unauthenticatedContext();
  const storage = ctx.storage();
  console.log('Got storage instance');

  const photoRef = storage.ref('test.jpg');
  console.log('Created ref');

  try {
    const data = Buffer.alloc(1024, 0);
    console.log('Uploading...');
    await photoRef.put(data, { contentType: 'image/jpeg' });
    console.log('Upload complete!');
  } catch (err) {
    console.error('Error:', err);
  }

  await env.cleanup();
  console.log('Done.');
}

run().catch(console.error);
