import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp-up to 50 users (approximates 500 total concurrency in real spikes)
    { duration: '1m', target: 50 },   // Stable load
    { duration: '30s', target: 200 }, // Spike to 200 users (approximates 2000 total concurrency)
    { duration: '1m', target: 200 },  // Sustained Spike
    { duration: '30s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],                 // Errors must be less than 1%
  },
};

export default function () {
  const BASE_URL = 'http://localhost:5173';

  const res1 = http.get(`${BASE_URL}/`);
  check(res1, {
    'home status is 200': (r) => r.status === 200,
  });
  sleep(1);

  const res2 = http.get(`${BASE_URL}/customer/dashboard`);
  check(res2, {
    'dashboard status is 200': (r) => r.status === 200,
  });
  sleep(2);
}
