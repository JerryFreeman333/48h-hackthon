// Explicit opt-in for the user's private local translation review, never a public release.
import {createServer} from '../src/server.mjs';
const port=Number(process.env.PORT??3100);
createServer({privateTranslationPreview:true}).listen(port,'127.0.0.1',()=>console.log(`A private Chinese translation review: http://127.0.0.1:${port}/demo/a`));
