const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');

initializeApp();
setGlobalOptions({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 60 });

const app = require('./src/app');
exports.api = onRequest({ invoker: 'public' }, app);
