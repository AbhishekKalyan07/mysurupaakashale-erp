import axios from 'axios';

const PROJECT_ID = 'demo-test';
const FIRESTORE_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_URL = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

export async function createCustomer(email: string, name: string) {
  const authRes = await axios.post(`${AUTH_URL}/accounts:signUp?key=fake-api-key`, {
    email,
    password: 'password123',
    returnSecureToken: true
  });
  const uid = authRes.data.localId;

  const docData = {
    fields: {
      id: { stringValue: uid },
      email: { stringValue: email },
      role: { stringValue: 'customer' },
      name: { stringValue: name },
      isActive: { booleanValue: true },
      createdAt: { timestampValue: new Date().toISOString() },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  await axios.post(`${FIRESTORE_URL}/users?documentId=${uid}`, docData);
  return uid;
}

export async function createSubscription(customerId: string, planTier: string, mealType: string) {
  const subId = 'sub-' + Math.floor(Math.random() * 100000);
  const docData = {
    fields: {
      id: { stringValue: subId },
      customerId: { stringValue: customerId },
      planTier: { stringValue: planTier },
      mealType: { stringValue: mealType },
      status: { stringValue: 'active' },
      startDate: { stringValue: new Date().toISOString().split('T')[0] },
      totalDeliveries: { integerValue: 30 },
      deliveriesUsed: { integerValue: 0 },
      pricePerMeal: { integerValue: 150 },
      totalAmount: { integerValue: 4500 },
      createdAt: { timestampValue: new Date().toISOString() },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };
  await axios.post(`${FIRESTORE_URL}/subscriptions?documentId=${subId}`, docData);
  return subId;
}

// Minimal stubs for other helpers to avoid complex REST transformations
export async function assignDeliveryPartner(zoneId: string, partnerId: string) {}
export async function generateOrders(date: string) { return 'mock-order-1'; }
export async function lockProduction(date: string) {}
export async function closeDispatch(date: string) {}
export async function seedDay(date: string) {}
