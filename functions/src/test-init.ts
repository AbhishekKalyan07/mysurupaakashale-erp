import { initializeApp, getApps, type App } from "firebase-admin/app";
import {
  getFirestore as adminGetFirestore,
  type Firestore,
  GeoPoint,
} from "firebase-admin/firestore";
import { getAuth as adminGetAuth } from "firebase-admin/auth";

export function initTestApp(): App {
  if (getApps().length === 0) {
    return initializeApp({ projectId: "demo-test" });
  }
  return getApps()[0];
}

export function getFirestore(): Firestore {
  initTestApp();
  return adminGetFirestore();
}

export function getAuth() {
  initTestApp();
  return adminGetAuth();
}

export function getStorage() {
  const app = initTestApp();
  const { getStorage: adminGetStorage } = require("firebase-admin/storage");
  return adminGetStorage(app);
}

export async function cleanupTestApp() {
  // Safe cleanup for test suites
}

export { type Firestore, GeoPoint };
