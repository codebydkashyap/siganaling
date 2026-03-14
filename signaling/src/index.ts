// server/signaling/src/index.ts
import 'dotenv/config';
import { createSignalingServer } from './server';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
createSignalingServer(PORT);
