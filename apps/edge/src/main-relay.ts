import { createRelay } from './worker-relay.js';

const port = Number(process.env.RELAY_PORT ?? 7460);
createRelay({ workersSubnet: process.env.WORKERS_SUBNET }).server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ msg: 'relay ouvindo', port })));
