import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',workers:1,use:{baseURL:'http://127.0.0.1:8787',viewport:{width:1440,height:960},timezoneId:'Asia/Tokyo'},reporter:'list'});
