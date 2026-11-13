import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',workers:1,
  use:{baseURL:'http://127.0.0.1:8787',viewport:{width:1440,height:960},timezoneId:'Asia/Tokyo'},
  reporter:'list',
  webServer:[
    {command:'npm start -- --port 8787',url:'http://127.0.0.1:8787/demo',reuseExistingServer:!process.env.CI,timeout:30000},
    {command:'npm start -- --port 8788 --var APP_ENV:development --var APP_ORIGIN:http://127.0.0.1:8788 --var GOOGLE_CLIENT_ID:fixture-client --var GOOGLE_CLIENT_SECRET:fixture-secret',url:'http://127.0.0.1:8788',reuseExistingServer:!process.env.CI,timeout:30000},
  ],
});
