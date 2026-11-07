import { createEgressProxy } from './egress-proxy.js';

const port = Number(process.env.EGRESS_PORT ?? 3128);
createEgressProxy().server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ msg: 'egress proxy ouvindo', port })));
