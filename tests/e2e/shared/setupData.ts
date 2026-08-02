import axios from 'axios';
import { execSync } from 'child_process';
import path from 'path';

const PROJECT_ID = 'demo-test';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function clearEmulatorData() {
  console.log('Waiting for emulators to be ready...');
  
  let retries = 5;
  while (retries > 0) {
    try {
      console.log('Clearing Firestore emulator...');
      await axios.delete(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`);
      
      console.log('Clearing Auth emulator...');
      await axios.delete(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`);
      break; // Success
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log('Emulators not ready yet, retrying in 2s...');
      await sleep(2000);
    }
  }
}

export async function seedUsers() {
  console.log('Running seed script...');
  execSync(`node "${path.join(__dirname, 'seed.cjs')}"`, { stdio: 'inherit' });
}

export async function setupData() {
  await clearEmulatorData();
  await seedUsers();
  console.log('Emulator data reset and seeded successfully.');
}
